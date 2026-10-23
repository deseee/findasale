// fas-posh-shipping.js -- injected on demand (chrome.scripting) into a Poshmark tab by background.js (fasPoshShipRun).
// Purpose (2026-10-14, Patrick: "it almost all seems to be free shipping which it shouldn't"): set the listing's
// Shipping Discount to "No Discount" on an own listing whose shipping_discount_type is "free", then verify.
// Verified in the live DOM 2026-10-14 (read-only): the edit page carries the Shipping Discount dropdown
// (ul.dropdown__menu > li > a[data-et-name="shipping_discount_item"] with spans "No Discount" / "$4.99" / "Free"), inside the
// listing-price modal opened by the "*Required" trigger input; save = [data-et-name="update"]; GET /vm-rest/posts/<id> returns
// shipping_discount_type ("free" | null). NOT verified: the click sequence itself (nothing was clicked) -- every step is checked and
// the result is confirmed by re-reading shipping_discount_type from the API, never assumed.
(function () {
  if (self.FAS_POSH_SHIP && self.FAS_POSH_SHIP.v >= 2) return;
  var VER = '2.55';
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function q(s, r) { return (r || document).querySelector(s); }
  function qa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function visible(el) { if (!el) return false; var b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; }
  async function waitFor(fn, ms) { var end = Date.now() + (ms || 8000); while (Date.now() < end) { var v = fn(); if (v) return v; await sleep(250); } return null; }
  function realClick(el) {
    if (!el) return;
    var t = el;
    var b = t.getBoundingClientRect();
    var o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, button: 0, buttons: 1 };
    t.dispatchEvent(new PointerEvent('pointerdown', o)); t.dispatchEvent(new MouseEvent('mousedown', o));
    t.dispatchEvent(new PointerEvent('pointerup', o)); t.dispatchEvent(new MouseEvent('mouseup', o)); t.dispatchEvent(new MouseEvent('click', o));
  }
  async function getPost(id) {
    var res = await fetch('/vm-rest/posts/' + id + '?app_version=' + VER + '&_=' + Date.now(), { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
    var j = null; try { j = await res.json(); } catch (e) { /* ignore */ }
    var p = j && (j.data || j.post || j);
    return { status: res.status, ok: res.ok, post: p && typeof p === 'object' ? p : null };
  }
  function fail(code, reason) { return { state: 'fail', code: code, reason: reason }; }
  function noDiscountItem() {
    return qa('a[data-et-name="shipping_discount_item"]').filter(function (a) { return /^\s*no discount\s*$/i.test(a.textContent || ''); })[0] || null;
  }
  // Collect the ids of the signed-in seller's own closet listings that are published, plus their current shipping type.
  async function collect() {
    var last = 0, same = 0;
    for (var i = 0; i < 45 && same < 3; i++) {
      window.scrollTo(0, document.body.scrollHeight); await sleep(1100);
      var n = new Set(qa('a[href*="/listing/"]').map(function (a) { return a.href; })).size;
      same = n === last ? same + 1 : 0; last = n;
    }
    var ids = {};
    qa('a[href*="/listing/"]').forEach(function (a) { var m = /([0-9a-f]{24})/.exec(a.href); if (m) ids[m[1]] = 1; });
    var out = [];
    var keys = Object.keys(ids);
    for (var k = 0; k < keys.length; k++) {
      try {
        var r = await getPost(keys[k]);
        if (r.status === 403 || r.status === 429) return { blocked: 'http_' + r.status, rows: out };
        if (r.ok && r.post) out.push({ id: keys[k], status: r.post.status, ship: r.post.shipping_discount_type === undefined ? '(unknown)' : r.post.shipping_discount_type, title: String(r.post.title || '').slice(0, 70) });
      } catch (e) { /* skip one */ }
      await sleep(350);
    }
    return { rows: out, total: keys.length };
  }
  function closetPath() {
    var a = qa('a[href^="/closet/"]').map(function (x) { return (x.getAttribute('href') || '').split('?')[0]; }).filter(function (h) { return /^\/closet\/[^/]+\/?$/.test(h); })[0];
    return a || '';
  }
  function norm(t) { return String(t || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function textOf(el) { return norm(el && (el.innerText || el.textContent)); }
  var BTN_SEL = 'button, [role="button"], input[type="submit"], input[type="button"], a[role="button"]';
  function btnLabel(el) { return norm(el.getAttribute('aria-label') || el.value || el.innerText || el.textContent || ''); }
  function isDisabled(el) { return !!(el && (el.disabled || el.getAttribute('aria-disabled') === 'true')); }
  function buttons() { return qa(BTN_SEL).filter(function (b) { return visible(b) && !isDisabled(b); }); }
  function visibleLabels() { return buttons().map(btnLabel).filter(Boolean).slice(0, 25).map(function (l) { return l.slice(0, 40); }); }
  function pageText() { return ((document.body && document.body.innerText) || '').slice(0, 4000); }
  // 1.0.63: the edit form does not save on Update alone. Live-confirmed 2026-10-23 on the price-edit path (fas-edit-engine.js
  // posh_verify_only, extension 1.0.62): after Update Poshmark shows a "Share Listing" screen whose "List This Item" button is
  // what actually saves, and for breakable items two packing acknowledgements ("Fragile Item Detected" -> Publish Listing, then
  // "... not be compensating me" -> Publish). This script clicked Update and went straight to verify, so the No Discount change
  // was never saved: 1,317 verify_still_free errors 2026-10-15..10-23 and not one success. Click exactly those steps, nothing
  // else; any certify / suspicious / verification prompt stops the run for the person.
  async function finishSave() {
    var clicks = [];
    for (var n = 0; n < 8; n++) {
      var ack = null, which = '';
      buttons().forEach(function (b) {
        var mt = textOf(b.closest('.modal, [role="dialog"]'));
        var lb = btnLabel(b);
        if (lb === 'publish' && /not be compensating/.test(mt)) { ack = b; which = 'fragile_confirm'; }
        else if (lb === 'publish listing' && /potential breakable item/.test(mt) && which !== 'fragile_confirm') { ack = b; which = 'fragile'; }
      });
      if (ack) { clicks.push(which); realClick(ack); await sleep(2500); continue; }
      var share = buttons().filter(function (b) { return /^list this item$/.test(btnLabel(b)); }).pop();
      if (share && /share listing/i.test(pageText())) { clicks.push('list_this_item'); realClick(share); await sleep(2500); continue; }
      break;
    }
    return clicks;
  }
  function flaggedPrompt() {
    var t = qa('[role="dialog"], .modal, [class*="error" i], [class*="toast" i]').filter(visible).map(textOf).join(' ').slice(0, 2000);
    return /suspicious|certify|single listing creation|verify (that )?you|are you a robot/i.test(t);
  }
  // ctx: { id, phase, ... } -- one action per call, like fas-edit-engine. Phases: '' (apply + Update) -> 'finish' (Share
  // Listing / fragile steps) -> 'verify' (re-read shipping_discount_type from the API; one re-read after a pause before failing).
  async function step(ctx) {
    var id = ctx.id;
    if (/\/login|\/signup/.test(location.pathname)) return { state: 'blocked', code: 'login_required', reason: 'Poshmark is signed out' };
    if (ctx.phase === 'finish') {
      await sleep(800);
      var clicks = await finishSave();
      if (flaggedPrompt()) return { state: 'blocked', code: 'poshmark_flagged', reason: 'Poshmark showed a certify/verification prompt after Update, so the change needs you' };
      return { state: 'continue', delayMs: 3500, scratch: { phase: 'verify', finishClicks: clicks, afterUpdatePath: location.pathname.slice(0, 60), afterUpdateButtons: clicks.length ? undefined : visibleLabels() } };
    }
    if (ctx.phase !== 'verify' && !/^\/edit-listing\//.test(location.pathname)) return { state: 'goto', url: 'https://poshmark.com/edit-listing/' + id };
    var g = await getPost(id);
    if (g.status === 403 || g.status === 429) return { state: 'blocked', code: 'http_' + g.status, reason: 'GET post returned ' + g.status };
    if (!g.ok || !g.post) return fail('get_failed', 'GET post HTTP ' + g.status);
    var ship = g.post.shipping_discount_type;
    if (ctx.phase === 'verify') {
      if (ship !== 'free') return { state: 'done', details: { ship: ship == null ? 'none' : ship, finishClicks: ctx.finishClicks || [] } };
      if (!ctx.reread) return { state: 'continue', delayMs: 4000, scratch: { reread: true } };
      var r = fail('verify_still_free', 'After Update the listing still reports shipping_discount_type "free"' + (ctx.finishClicks && ctx.finishClicks.length ? ' (clicked: ' + ctx.finishClicks.join(', ') + ')' : ' (no Share Listing or packing step was found after Update)'));
      r.diag = { picked: ctx.picked || '', modalDone: ctx.modalDone || '', finishClicks: ctx.finishClicks || [], afterUpdatePath: ctx.afterUpdatePath || '', afterUpdateButtons: ctx.afterUpdateButtons || [], now: location.pathname.slice(0, 60), status: g.post.status || '' };
      return r;
    }
    if (ship !== 'free') return { state: 'done', details: { ship: ship == null ? 'none' : ship, already: true } };
    var item = await waitFor(noDiscountItem, 6000);
    if (!item) {
      var trig = qa('input.form__text[placeholder="*Required"]').filter(visible)[0] || q('input[data-vv-name="listingPrice"]');
      if (trig) { realClick(trig); await sleep(900); }
      item = await waitFor(noDiscountItem, 6000);
    }
    if (!item) { var nf = fail('no_discount_option_not_found', 'No a[data-et-name="shipping_discount_item"] "No Discount" on the edit page'); nf.diag = { buttons: visibleLabels(), path: location.pathname.slice(0, 60) }; return nf; }
    var wrap = item.closest('.dropdown') || item.parentElement;
    var sel = wrap && q('.dropdown__selector', wrap);
    if (sel) { realClick(sel); await sleep(400); }
    realClick(item); await sleep(600);
    var shown = sel ? String(sel.innerText || '').trim() : '';
    if (/free/i.test(shown)) return fail('selection_did_not_take', 'Dropdown still shows "' + shown.slice(0, 30) + '"');
    // The Done button belongs to the modal that holds the dropdown; the old "last visible [class*=modal]" pick could land on
    // a modal__footer/title child that has no buttons, so Done was never clicked.
    var dlg = item.closest('[role="dialog"], .modal') || qa('[role="dialog"], .modal').filter(visible).pop();
    var done = qa('button', dlg || document).filter(function (b) { return visible(b) && /^\s*(done|apply|save|ok)\s*$/i.test(b.textContent || ''); }).pop();
    var modalDone = done ? norm(done.textContent) : 'none';
    if (done) { realClick(done); await sleep(700); }
    var upd = q('[data-et-name="update"]');
    if (!(upd && visible(upd))) upd = qa('button').filter(function (b) { return visible(b) && /^\s*(update|save)\s*$/i.test(b.textContent || ''); })[0];
    if (!upd || upd.disabled) { var nu = fail('update_button_not_found', 'No enabled Update button after choosing No Discount'); nu.diag = { picked: shown.slice(0, 30), modalDone: modalDone, buttons: visibleLabels() }; return nu; }
    setTimeout(function () { realClick(upd); }, 60);
    return { state: 'continue', delayMs: 4000, scratch: { phase: 'finish', picked: shown.slice(0, 30), modalDone: modalDone } };
  }
  self.FAS_POSH_SHIP = { v: 2, step: step, collect: collect, closetPath: closetPath };
})();
