// 1.0.72 (2026-10-27, Patrick, live on 1.0.71): when Poshmark shows its "Problem Detected ... potential oversized item" box, the
// extension popped its own centered "Poshmark refused this item as oversized" modal a few seconds later, right on top of
// Poshmark's box, and a click aimed at Publish Listing did nothing. A flag hold (oversized or prohibited) now logs the problem
// without the modal (FAS_TRACE.problem noModal), keeps the corner bar clear of Poshmark's dialogs, and the bar says Poshmark
// asks for a second confirm ("Publish Listing" box: Cancel / Publish).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const posh = rd('fas-poshmark.js');

function extract(src, name) {
  let i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  if (src.slice(i - 6, i) === 'async ') i -= 6;
  let depth = 0;
  const j = src.indexOf('{', src.indexOf(')', i));
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unterminated ' + name);
}

// ---- a tiny fake page, enough for fas-trace.js's panel + modal code
function fakeEl(tag) {
  const e = {
    tagName: tag, children: [], style: {}, className: '', id: '', innerHTML: '', parentNode: null, textContent: '',
    appendChild(c) { c.parentNode = e; e.children.push(c); return c; },
    remove() { if (e.parentNode) { const a = e.parentNode.children; const i = a.indexOf(e); if (i >= 0) a.splice(i, 1); e.parentNode = null; } },
    attachShadow() { const s = fakeEl('#shadow'); e.shadowRoot = s; return s; },
    addEventListener() {}, setAttribute() {}, focus() {}, select() {},
    querySelector(sel) {
      const cls = sel.replace(/^[^.]*\./, '');
      const walk = (n) => { for (const c of n.children) { if ((' ' + c.className + ' ').indexOf(' ' + cls + ' ') >= 0) return c; const r = walk(c); if (r) return r; } return null; };
      const hit = walk(e);
      if (hit) return hit;
      if (String(e.innerHTML).indexOf('class="' + cls) >= 0 || String(e.innerHTML).indexOf('class="g ' + cls) >= 0) return fakeEl('stub');
      return null;
    },
  };
  return e;
}
function loadTrace() {
  const docEl = fakeEl('html');
  const findId = (n, id) => { for (const c of n.children) { if (c.id === id) return c; const r = findId(c, id); if (r) return r; } return null; };
  const sent = [];
  const sb = {
    document: { createElement: (t) => fakeEl(t), documentElement: docEl, body: null, getElementById: (id) => findId(docEl, id), querySelectorAll: () => [], title: 'Sell', readyState: 'complete' },
    location: { host: 'poshmark.com', pathname: '/create-listing' },
    chrome: { runtime: { id: 'x', lastError: null, sendMessage: (m, cb) => { sent.push(m); if (cb) cb(); }, getManifest: () => ({ version: 't' }) }, storage: { local: { get: (k, cb) => cb({}), set() {} } } },
    getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {}, console: { log() {}, warn() {}, error() {} },
  };
  sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(rd('fas-trace.js'), sb);
  const shadow = () => { const h = findId(docEl, 'fas-trace-host'); return h && h.shadowRoot; };
  return { T: sb.FAS_TRACE, sent, shadow };
}

test('FAS_TRACE.problem with noModal logs the same error record but draws no centered modal', () => {
  const { T, sent, shadow } = loadTrace();
  T.problem({ noModal: true, code: 'poshmark_oversized', title: 't', what: 'w', why: 'y', next: 'n', ctx: { dialog: 'Problem Detected' } });
  const rec = sent.filter((m) => m.type === 'fasTrace').map((m) => m.rec);
  assert.strictEqual(rec.length, 1);
  assert.strictEqual(rec[0].lvl, 'error');
  assert.strictEqual(rec[0].code, 'poshmark_oversized');
  assert.strictEqual(shadow().querySelector('.mask'), null, 'no centered modal');
});

test('control: FAS_TRACE.problem without noModal still draws the modal (other problems unchanged)', () => {
  const { T, shadow } = loadTrace();
  T.problem({ code: 'publish_unconfirmed', title: 't', what: 'w', next: 'n' });
  assert.ok(shadow().querySelector('.mask'), 'modal drawn');
});

test('both flag-hold problems (oversized and prohibited) are logged with noModal, before the hold', () => {
  for (const code of ['poshmark_oversized', 'poshmark_prohibited_flag']) {
    const i = posh.indexOf("code: '" + code + "'");
    assert.ok(i > 0, code);
    const call = posh.slice(posh.lastIndexOf('tProblem({', i), i);
    assert.ok(/noModal: true/.test(call), code + ' has noModal');
    assert.ok(i < posh.indexOf('holdForPoshmarkFlagDecision(item, flagKind, index, total)', i));
  }
  const a = posh.indexOf('writePoshFlagHoldState(item.id, flagKind);');
  const b = posh.indexOf('holdForPoshmarkFlagDecision(item, flagKind, index, total)', a);
  const block = posh.slice(a, b);
  assert.strictEqual((block.match(/tProblem\(\{/g) || []).length, 2);
  assert.strictEqual((block.match(/tProblem\(\{ noModal: true,/g) || []).length, 2, 'every tProblem in the flag block is modal-free');
  assert.ok(!/refused this item as oversized/.test(posh));
});

// ---- running the real hold function with a fake page
function holdRun(kind, total) {
  const els = {};
  let html = '';
  let sleeps = 0;
  const keep = { clear: 0, restore: 0 };
  const env = {
    overlay: (h) => { html = h; els['fas-posh-skip'] = { onclick: null }; els['fas-posh-close'] = { onclick: null }; },
    button: (id, label) => '<button id="' + id + '">' + label + '</button>',
    escapeHtml: (s) => String(s),
    document: { getElementById: (id) => els[id] || null },
    tInfo: () => {}, tWarn: () => {},
    sleep: async () => { sleeps++; if (sleeps === 3) els['fas-posh-skip'].onclick(); },
    looksLikeSellForm: () => true,
    POSH_LABEL_COSTS_TEXT: 'label costs',
    fasPoshClosetDupCheck: async () => ({ state: 'clear' }),
    bar: null,
    poshKeepOwnUiClearOfDialog: () => { keep.clear++; },
    poshRestoreOwnUi: () => { keep.restore++; },
  };
  const names = Object.keys(env);
  const fn = new Function(...names, 'return (' + extract(posh, 'holdForPoshmarkFlagDecision') + ');')(...names.map((k) => env[k]));
  return fn({ id: 'i1', title: 'Guitar Strap' }, kind, 0, total).then((d) => ({ d, html, keep }));
}

test('oversized hold: the side bar mentions the second confirm box and the under-10-lb confirmation, keeps Skip/Stop, keeps clear of the dialog', async () => {
  const { d, html, keep } = await holdRun('oversized', 3);
  assert.strictEqual(d, 'skip');
  assert.ok(html.indexOf('Poshmark then asks you to confirm in a second box; click <b>Publish</b> there.') > 0);
  assert.ok(html.indexOf('asks you to confirm the item is under 10 lb and fits a Priority Mail box') > 0);
  assert.ok(html.indexOf('($5 for 5-10 lb)') > 0 && html.indexOf('($10 for 10-15 lb)') > 0);
  assert.ok(html.indexOf('only confirm if the item really is under 10 lb') > 0);
  assert.ok(html.indexOf('out of date') < 0);
  assert.ok(html.indexOf('id="fas-posh-skip"') > 0 && html.indexOf('id="fas-posh-close"') > 0);
  assert.ok(keep.clear >= 3, 'kept clear on draw and on every tick');
  assert.strictEqual(keep.restore, 1, 'own UI restored when the hold ends');
});

test('prohibited hold: also tells the person about a possible second confirm box', async () => {
  const { html } = await holdRun('prohibited', 1);
  assert.ok(html.indexOf('If Poshmark then asks you to confirm in a second box, click <b>Publish</b> there.') > 0);
});

// ---- placement beside Poshmark's box
const place = new Function('return (' + extract(posh, 'poshPlaceClearOfDialog') + ');')();
const overlap = new Function('return (' + extract(posh, 'poshRectsOverlap') + ');')();
function barRect(p, vw, vh, w, h) {
  // the bar as placed: width min(w, maxWidth), height min(h, maxHeight), 16px from the chosen corner
  const W = Math.min(w, p.maxWidth || 360), H = Math.min(h, p.maxHeight || Infinity);
  if (p.side === 'left') return { left: 16, right: 16 + W, bottom: vh - 16, top: vh - 16 - H };
  if (p.side === 'above') return { right: vw - 16, left: vw - 16 - W, top: 16, bottom: 16 + H };
  return { right: vw - 16, left: vw - 16 - W, bottom: vh - 16, top: vh - 16 - H };
}
test('placement: the corner bar never overlaps Poshmark\'s box when the window has room', () => {
  const cases = [
    { vw: 1280, vh: 800, d: { left: 390, right: 890, top: 200, bottom: 600 } },
    { vw: 900, vh: 800, d: { left: 300, right: 860, top: 200, bottom: 520 } },
    { vw: 700, vh: 900, d: { left: 100, right: 600, top: 150, bottom: 550 } },
    { vw: 700, vh: 700, d: { left: 100, right: 600, top: 300, bottom: 680 } },
  ];
  for (const c of cases) {
    const p = place(c.d, c.vw, c.vh);
    assert.notStrictEqual(p.side, 'none');
    assert.ok(!overlap(barRect(p, c.vw, c.vh, 360, 400), c.d), JSON.stringify([c, p]));
  }
});
test('placement: no room anywhere -> the bar goes under Poshmark\'s dialog by z-index', () => {
  const p = place({ left: 10, right: 390, top: 10, bottom: 590, z: 1050 }, 400, 600);
  assert.strictEqual(p.side, 'none');
  assert.strictEqual(p.zIndex, 1049);
  assert.deepStrictEqual(place(null, 1000, 800), { side: 'default' });
});
test('the live keep-clear also removes a stray FindA.Sale modal and hides the trace panel when it would overlap', () => {
  const body = extract(posh, 'poshKeepOwnUiClearOfDialog');
  assert.ok(/querySelector\('\.mask'\)/.test(body) && /m\.remove\(\)/.test(body));
  assert.ok(/poshRectsOverlap\(pr, d\)\) host\.style\.display = 'none'/.test(body));
  assert.ok(/#fas-poshmark-bar, #fas-trace-host/.test(extract(posh, 'poshFindVisibleDialog')), 'never mistakes its own UI for Poshmark\'s box');
});

test('manifest is 1.0.76', () => {
  assert.strictEqual(JSON.parse(rd('manifest.json')).version, '1.0.76');
});
