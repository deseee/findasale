/* FindA.Sale shared step narration + diagnostics (extension 1.0.13).
 *
 * One small module used by every content script, the service worker, the edit engine and the popup so the whole extension
 * explains itself the same way and leaves the same kind of trail:
 *
 *   FAS_TRACE.begin({ platform, flow, item })      start a run (flow: 'post' | 'edit' | 'remove' | 'renew' | ...)
 *   FAS_TRACE.step(what, why, ctx)                 "what I am doing now" + "why", shown in the panel AND logged
 *   FAS_TRACE.ok(msg, ctx)                         mark the current step done
 *   FAS_TRACE.info / warn / error(code, msg, ctx)  log only (warn/error also show in the panel)
 *   FAS_TRACE.problem({code, title, what, why, next, ctx, snapshot})   modal: what happened, why, what happens next, copy diagnostics
 *   FAS_TRACE.end(summary, ctx)                    finish the run (panel shows result, then fades)
 *   FAS_TRACE.snapshot()                           small, privacy-safe description of the page for diagnostics
 *
 * Records are kept in chrome.storage.local.fasTrace (ring buffer, newest last, popup "Activity log" reads it) and warn/error
 * records are also shipped to the backend runtime log (POST /extension/logs) by the service worker. Logging never throws and
 * never blocks the flow it describes. Query strings, tokens and e-mail addresses are stripped before anything is stored.
 */
(function (root) {
  'use strict';
  if (root.FAS_TRACE && root.FAS_TRACE.__v) return;

  var KEY = 'fasTrace';
  var MAX_RECORDS = 500;
  var IS_PAGE = typeof document !== 'undefined' && typeof document.createElement === 'function';
  var state = { platform: '', flow: '', item: null, runId: '', steps: [], current: null, startedAt: 0, panel: null, collapsed: false, endTimer: null, tick: null };

  function now() { return Date.now(); }
  function rid() { return Math.random().toString(36).slice(2, 8); }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // ---- redaction -----------------------------------------------------------------------------------------------------
  function redactStr(s) {
    return String(s == null ? '' : s)
      .replace(/https?:\/\/[^\s"'<>]+/g, function (u) { try { var x = new URL(u); return x.origin + x.pathname.replace(/[0-9a-f]{20,}/gi, '<id>'); } catch (e) { return u.split('?')[0]; } })
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
      .replace(/\b(bearer|token|authorization|password|passwd|csrf|secret|api[-_]?key)\b\s*[:=]\s*\S+/gi, '$1=<redacted>')
      .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<token>');
  }
  function redact(v, depth) {
    depth = depth || 0;
    if (v == null) return v;
    if (typeof v === 'string') return clip(redactStr(v), 400);
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (depth > 3) return '<deep>';
    if (Array.isArray(v)) return v.slice(0, 20).map(function (x) { return redact(x, depth + 1); });
    if (typeof v === 'object') {
      var out = {}, n = 0;
      for (var k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
        if (/pass|token|secret|cookie|authorization|csrf|key$/i.test(k)) { out[k] = '<redacted>'; continue; }
        if (++n > 25) break;
        out[k] = redact(v[k], depth + 1);
      }
      return out;
    }
    return String(v);
  }
  function pagePath() { try { return location.host + location.pathname.replace(/[0-9a-f]{20,}/gi, '<id>'); } catch (e) { return ''; } }

  // ---- record + storage ----------------------------------------------------------------------------------------------
  function makeRecord(level, code, msg, ctx) {
    return {
      t: now(), lvl: level, plat: state.platform || '', flow: state.flow || '', run: state.runId || '',
      item: state.item ? clip(state.item.title || state.item.id || '', 70) : '', itemId: state.item && state.item.id ? String(state.item.id) : '',
      step: state.current ? clip(state.current.what, 80) : '', code: code || '', msg: clip(redactStr(msg), 500),
      page: IS_PAGE ? pagePath() : 'service-worker', ctx: ctx ? redact(ctx) : undefined
    };
  }
  function storeLocal(rec) {
    try {
      if (!root.chrome || !chrome.storage || !chrome.storage.local) return;
      chrome.storage.local.get([KEY], function (st) {
        try {
          var arr = (st && st[KEY]) || [];
          arr.push(rec);
          if (arr.length > MAX_RECORDS) arr = arr.slice(arr.length - MAX_RECORDS);
          var o = {}; o[KEY] = arr; chrome.storage.local.set(o);
        } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
  }
  function emit(rec) {
    // In the service worker / popup write straight to storage; in a page ask the worker (single writer, also forwards warn/error to
    // the backend log). If the message can't be delivered fall back to a direct storage write so the record is never lost.
    try {
      if (IS_PAGE && root.chrome && chrome.runtime && chrome.runtime.sendMessage && chrome.runtime.id) {
        chrome.runtime.sendMessage({ type: 'fasTrace', rec: rec }, function () { if (chrome.runtime.lastError) storeLocal(rec); });
      } else {
        storeLocal(rec);
      }
    } catch (e) { storeLocal(rec); }
    try { if (typeof console !== 'undefined') console[rec.lvl === 'error' ? 'error' : rec.lvl === 'warn' ? 'warn' : 'log']('[FAS ' + (rec.plat || '') + '] ' + (rec.step ? rec.step + ' | ' : '') + (rec.code ? rec.code + ' ' : '') + rec.msg); } catch (e) { /* ignore */ }
  }
  function log(level, code, msg, ctx) { var rec = makeRecord(level, code, msg, ctx); emit(rec); return rec; }

  // ---- page snapshot (privacy-safe) ----------------------------------------------------------------------------------
  function visible(el) { try { var r = el.getBoundingClientRect(); var cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; } catch (e) { return false; } }
  function snapshot() {
    if (!IS_PAGE) return {};
    var s = { page: pagePath(), title: clip(document.title, 80), ready: document.readyState };
    try {
      s.headings = Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3')).filter(visible).slice(0, 6).map(function (h) { return clip(h.textContent.trim(), 60); });
      s.buttons = Array.prototype.slice.call(document.querySelectorAll('button,[role="button"],input[type="submit"],a.btn')).filter(visible).slice(0, 14).map(function (b) { return clip((b.value || b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim(), 40); }).filter(Boolean);
      s.fields = Array.prototype.slice.call(document.querySelectorAll('input,textarea,select')).filter(visible).slice(0, 18).map(function (i) { return [i.tagName.toLowerCase(), i.type || '', i.name || i.id || i.getAttribute('aria-label') || i.getAttribute('data-vv-name') || '', i.type === 'password' ? '' : (i.value ? 'filled' : 'empty')].join(':'); });
      var dlg = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"],[aria-modal="true"],.modal')).filter(visible)[0];
      if (dlg) s.dialog = clip(dlg.innerText.replace(/\s+/g, ' ').trim(), 160);
      var err = Array.prototype.slice.call(document.querySelectorAll('[role="alert"],.error,.form__error,[class*="error" i]')).filter(visible).slice(0, 3).map(function (e) { return clip(e.innerText.replace(/\s+/g, ' ').trim(), 100); }).filter(Boolean);
      if (err.length) s.errors = err;
    } catch (e) { s.snapErr = String(e && e.message || e); }
    return redact(s);
  }

  // ---- panel (shadow DOM so site CSS can't touch it) -----------------------------------------------------------------
  var CSS = ':host{all:initial}.p{position:fixed;left:16px;bottom:16px;z-index:2147483646;width:340px;max-width:calc(100vw - 32px);background:#14201a;color:#eef3ef;border:1px solid #3c8c5a;border-radius:12px;font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.45);overflow:hidden}' +
    '.h{display:flex;align-items:center;gap:8px;padding:9px 12px;background:#1d3327;cursor:pointer;user-select:none}.h b{flex:1;font-size:13px}.h small{opacity:.75}' +
    '.b{padding:10px 12px}.what{font-weight:600;font-size:13.5px}.why{margin-top:3px;color:#b9d3c4;font-size:12.5px}.it{color:#9fc4ae;font-size:12px;margin-bottom:6px}' +
    '.ls{margin:8px 0 0;padding:0;list-style:none;border-top:1px solid #2a4a38;padding-top:6px;max-height:110px;overflow:auto}.ls li{font-size:12px;color:#a8c2b3;padding:1px 0}.ls .ok::before{content:"\\2713  ";color:#6fd39a}.ls .bad::before{content:"\\2717  ";color:#ff8f7a}.ls .run::before{content:"\\2022  ";color:#ffd37a}' +
    '.warn{color:#ffcf7a}.err{color:#ff9d8a}.sp{display:inline-block;width:10px;height:10px;border:2px solid #6fd39a;border-top-color:transparent;border-radius:50%;animation:s 1s linear infinite;vertical-align:-1px;margin-right:6px}@keyframes s{to{transform:rotate(360deg)}}' +
    '.mask{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center}.m{width:460px;max-width:calc(100vw - 32px);max-height:86vh;overflow:auto;background:#fff;color:#1b2520;border-radius:14px;padding:20px 22px;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 18px 60px rgba(0,0,0,.5)}' +
    '.m h3{margin:0 0 4px;font-size:17px}.m .lbl{margin-top:12px;font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#4a6455}.m p{margin:2px 0}.m code{background:#eef3ef;border-radius:4px;padding:1px 5px;font-size:12px}' +
    '.row{margin-top:16px;display:flex;gap:8px;flex-wrap:wrap}button{font:600 13px -apple-system,Segoe UI,Roboto,sans-serif;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;background:#3c8c5a;color:#fff}button.g{background:#e6ece8;color:#1b2520}';
  function ensureHost() {
    if (!IS_PAGE) return null;
    var host = document.getElementById('fas-trace-host');
    if (host && host.__fasRoot) return host.__fasRoot;
    host = document.createElement('div'); host.id = 'fas-trace-host';
    var sr = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var st = document.createElement('style'); st.textContent = CSS; sr.appendChild(st);
    var wrap = document.createElement('div'); wrap.className = 'wrap'; sr.appendChild(wrap);
    host.__fasRoot = wrap;
    (document.documentElement || document.body).appendChild(host);
    return wrap;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function elapsed() { var s = Math.max(0, Math.round((now() - (state.startedAt || now())) / 1000)); return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's'; }
  function render() {
    if (!IS_PAGE) return;
    var wrap = ensureHost(); if (!wrap) return;
    var old = wrap.querySelector('.p'); if (old) old.remove();
    var p = document.createElement('div'); p.className = 'p';
    var cur = state.current;
    var head = '<div class="h"><b>FindA.Sale · ' + esc(state.platform || 'working') + '</b><small>' + esc(elapsed()) + '</small><small>' + (state.collapsed ? '▲' : '▼') + '</small></div>';
    var body = '';
    if (!state.collapsed) {
      body += '<div class="b">';
      if (state.item) body += '<div class="it">' + esc(clip(state.item.title || '', 60)) + (state.itemPos ? ' (' + esc(state.itemPos) + ')' : '') + '</div>';
      if (cur) {
        body += '<div class="what ' + (cur.status === 'warn' ? 'warn' : cur.status === 'bad' ? 'err' : '') + '">' + (cur.status === 'run' ? '<span class="sp"></span>' : '') + esc(cur.what) + '</div>';
        if (cur.why) body += '<div class="why">' + esc(cur.why) + '</div>';
      }
      var recent = state.steps.slice(-6, cur ? -1 : undefined);
      if (recent.length) body += '<ul class="ls">' + recent.map(function (s) { return '<li class="' + (s.status === 'ok' ? 'ok' : s.status === 'bad' ? 'bad' : 'run') + '">' + esc(clip(s.what, 60)) + '</li>'; }).join('') + '</ul>';
      body += '</div>';
    }
    p.innerHTML = head + body;
    p.querySelector('.h').onclick = function () { state.collapsed = !state.collapsed; render(); };
    wrap.appendChild(p);
    state.panel = p;
  }
  function startTick() { if (!IS_PAGE || state.tick) return; state.tick = setInterval(function () { if (!state.current || state.current.status !== 'run') return; var s = state.panel && state.panel.querySelector('.h small'); if (s) s.textContent = elapsed(); }, 1000); }

  // ---- public API ----------------------------------------------------------------------------------------------------
  var API = {
    __v: 1,
    begin: function (o) {
      o = o || {};
      if (state.endTimer) { clearTimeout(state.endTimer); state.endTimer = null; }
      state.platform = o.platform || state.platform; state.flow = o.flow || ''; state.item = o.item || null; state.itemPos = o.itemPos || '';
      state.runId = rid(); state.steps = []; state.current = null; state.startedAt = now();
      log('info', 'run_begin', 'Started ' + (state.flow || 'run') + (state.item ? ' for "' + clip(state.item.title || state.item.id, 60) + '"' : ''), o.ctx);
      if (o.silent !== true) render();
      startTick();
    },
    step: function (what, why, ctx) {
      if (state.current && state.current.status === 'run') state.current.status = 'ok';
      state.current = { what: what, why: why || '', status: 'run', t: now() };
      state.steps.push(state.current);
      if (state.steps.length > 40) state.steps.shift();
      log('info', 'step', what + (why ? ' — ' + why : ''), ctx);
      render(); startTick();
      return state.current;
    },
    ok: function (msg, ctx) { if (state.current) { state.current.status = 'ok'; } if (msg) log('info', 'step_ok', msg, ctx); render(); },
    info: function (code, msg, ctx) { log('info', code, msg, ctx); },
    warn: function (code, msg, ctx) { if (state.current) state.current.status = 'warn'; log('warn', code, msg, ctx); render(); },
    error: function (code, msg, ctx) { if (state.current) state.current.status = 'bad'; log('error', code, msg, ctx); render(); },
    // Modal for anything that stops or changes the plan. Always plain language: what happened, why, what happens next.
    problem: function (o) {
      o = o || {};
      var snap = o.snapshot === false ? undefined : snapshot();
      if (state.current) state.current.status = 'bad';
      log('error', o.code || 'problem', (o.title || 'Problem') + ' | ' + (o.what || '') + ' | why: ' + (o.why || '') + ' | next: ' + (o.next || ''), Object.assign({}, o.ctx || {}, { snapshot: snap }));
      render();
      if (!IS_PAGE) return;
      var wrap = ensureHost(); if (!wrap) return;
      var prev = wrap.querySelector('.mask'); if (prev) prev.remove();
      var mask = document.createElement('div'); mask.className = 'mask';
      mask.innerHTML = '<div class="m" role="dialog" aria-modal="true"><h3>' + esc(o.title || 'FindA.Sale hit a problem') + '</h3>' +
        (state.item ? '<p><code>' + esc(clip(state.item.title || '', 70)) + '</code> on ' + esc(state.platform || 'the marketplace') + '</p>' : '') +
        '<div class="lbl">What happened</div><p>' + esc(o.what || '') + '</p>' +
        (o.why ? '<div class="lbl">Why</div><p>' + esc(o.why) + '</p>' : '') +
        '<div class="lbl">What happens next</div><p>' + esc(o.next || 'Nothing was changed. You can close this.') + '</p>' +
        '<div class="row"><button class="copy">Copy diagnostics</button><button class="g close">Close</button></div><p class="res" style="font-size:12px;color:#4a6455;margin-top:8px"></p></div>';
      wrap.appendChild(mask);
      mask.querySelector('.close').onclick = function () { mask.remove(); if (typeof o.onClose === 'function') try { o.onClose(); } catch (e) { /* ignore */ } };
      mask.querySelector('.copy').onclick = function () {
        API.recent(60, function (recs) {
          var txt = JSON.stringify({ when: new Date().toISOString(), version: (root.chrome && chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : '', problem: { code: o.code, title: o.title, what: o.what, why: o.why, next: o.next }, snapshot: snap, trail: recs }, null, 1);
          var done = function (ok) { mask.querySelector('.res').textContent = ok ? 'Copied. Paste it to support or to Claude.' : 'Copy blocked by the browser; open the extension popup > Activity log > Copy.'; };
          try { navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
        });
      };
    },
    end: function (summary, ctx) {
      if (state.current && state.current.status === 'run') state.current.status = 'ok';
      log('info', 'run_end', summary || 'Finished', Object.assign({ elapsedMs: now() - (state.startedAt || now()) }, ctx || {}));
      if (state.current) state.current = { what: summary || 'Finished', why: '', status: 'ok', t: now() };
      render();
      if (IS_PAGE) { if (state.endTimer) clearTimeout(state.endTimer); state.endTimer = setTimeout(function () { var h = document.getElementById('fas-trace-host'); var p = h && h.__fasRoot && h.__fasRoot.querySelector('.p'); if (p) p.remove(); }, 12000); }
    },
    log: log, snapshot: snapshot, redact: redact, redactStr: redactStr,
    recent: function (n, cb) {
      try { chrome.storage.local.get([KEY], function (st) { var a = (st && st[KEY]) || []; cb(a.slice(-(n || 100))); }); } catch (e) { cb([]); }
    },
    // Worker side: store the record a page sent; returns true when it deserves a backend log line.
    ingest: function (rec) {
      if (!rec || typeof rec !== 'object') return false;
      var clean = { t: Number(rec.t) || now(), lvl: String(rec.lvl || 'info').slice(0, 6), plat: String(rec.plat || '').slice(0, 20), flow: String(rec.flow || '').slice(0, 20), run: String(rec.run || '').slice(0, 12),
        item: clip(rec.item, 70), itemId: String(rec.itemId || '').slice(0, 40), step: clip(rec.step, 80), code: String(rec.code || '').slice(0, 60), msg: clip(redactStr(rec.msg), 500), page: clip(redactStr(rec.page), 120), ctx: rec.ctx ? redact(rec.ctx) : undefined };
      storeLocal(clean);
      return clean.lvl === 'warn' || clean.lvl === 'error';
    },
    KEY: KEY
  };
  root.FAS_TRACE = API;
})(typeof self !== 'undefined' ? self : this);
