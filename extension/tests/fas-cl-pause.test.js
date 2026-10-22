// Node tests for extension 1.0.23: (A) hard pause of Craigslist PRICE-EDIT runs, (B) fail-closed Craigslist posting identity in the edit flow.
// DOM is STUBBED; none of this was driven against live Craigslist. Run: node --test extension/tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const Core = require('../fas-edit-core.js');
const G = require('../fas-cl-guard.js');

// ------------------------------------------------------------------ (A) pause: pure decision ---------------------------------------------
test('pause: config constant exists, is true, and only the literal false lifts it', () => {
  const cfgSrc = read('config.js');
  assert.match(cfgSrc, /FAS_CL_PRICE_EDITS_PAUSED:\s*true/);
  assert.strictEqual(Core.isEditPausedByConfig('CRAIGSLIST', { FAS_CL_PRICE_EDITS_PAUSED: true }), true);
  assert.strictEqual(Core.isEditPausedByConfig('CRAIGSLIST', {}), true, 'missing flag fails closed');
  assert.strictEqual(Core.isEditPausedByConfig('CRAIGSLIST', null), true);
  assert.strictEqual(Core.isEditPausedByConfig('CRAIGSLIST', { FAS_CL_PRICE_EDITS_PAUSED: 'false' }), true);
  assert.strictEqual(Core.isEditPausedByConfig('CRAIGSLIST', { FAS_CL_PRICE_EDITS_PAUSED: false }), false);
  for (const p of ['FACEBOOK', 'POSHMARK', 'MERCARI', 'GRAILED', 'GUMTREE_AU']) assert.strictEqual(Core.isEditPausedByConfig(p, { FAS_CL_PRICE_EDITS_PAUSED: true }), false, p + ' unaffected');
});
test('pause: nextEditPlatform skips Craigslist when paused, keeps order and other platforms when not', () => {
  const pending = { CRAIGSLIST: [{ id: 'a' }], FACEBOOK: [{ id: 'b' }], MERCARI: [] };
  assert.strictEqual(Core.nextEditPlatform(pending, new Set(), { FAS_CL_PRICE_EDITS_PAUSED: true }), 'FACEBOOK');
  assert.strictEqual(Core.nextEditPlatform({ CRAIGSLIST: [{ id: 'a' }] }, new Set(), { FAS_CL_PRICE_EDITS_PAUSED: true }), undefined);
  assert.strictEqual(Core.nextEditPlatform({ CRAIGSLIST: [{ id: 'a' }] }, new Set(), { FAS_CL_PRICE_EDITS_PAUSED: false }), 'CRAIGSLIST');
  assert.strictEqual(Core.nextEditPlatform(pending, new Set(['FACEBOOK']), { FAS_CL_PRICE_EDITS_PAUSED: false }), 'CRAIGSLIST');
});

// ------------------------------------------------------------------ (A) pause: the real background.js pump in a vm -------------------------
function loadBackground(opts) {
  opts = opts || {};
  const store = {};
  const deep = () => new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : deep()), apply: () => undefined });
  const calls = { run: [], claim: [], api: [], tabs: [], log: [] };
  const own = {
    storage: { local: {
      get: async (k) => { const o = {}; (Array.isArray(k) ? k : [k]).forEach((x) => { if (x in store) o[x] = store[x]; }); return o; },
      set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); },
      remove: async (k) => { (Array.isArray(k) ? k : [k]).forEach((x) => delete store[x]); } }, session: undefined },
    runtime: { getManifest: () => ({ version: 'test' }), onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
    tabs: new Proxy({ create: () => calls.tabs.push('create'), update: () => calls.tabs.push('update'), get: () => undefined }, { get: (t, k) => (k in t ? t[k] : deep()) })
  };
  const sb = { console, setTimeout: () => 0, clearTimeout() {}, Math, Date, JSON, URL, Promise, Set, Map };
  sb.self = sb; sb.window = sb;
  sb.chrome = new Proxy(function () {}, { get: (t, k) => (k in own ? own[k] : deep()) });
  sb.importScripts = (...files) => files.forEach((f) => vm.runInContext(read(f), sb));
  vm.createContext(sb);
  vm.runInContext(read('background.js'), sb);
  sb.apiFetch = async (u) => { calls.api.push(u); return { ok: true, data: {} }; };
  sb.fasLog = () => {};
  if (!opts.realRun) {
    sb.fasEditRunLockFree = async () => true;
    sb.fasClTryClaim = async (k) => { calls.claim.push(k); return { ok: true }; };
    sb.fasEditRunPlatform = async (p, entries) => { calls.run.push(p + ':' + entries.length); return 'ran'; };
    sb.fasT = (lvl, code, msg) => { calls.log.push({ lvl, code, msg }); };
  }
  return { sb, store, calls };
}
test('pause ON: the pump never starts a Craigslist run (no claim, no tab, no api), leaves it pending, and still runs other platforms', async () => {
  const { sb, store, calls } = loadBackground();
  assert.strictEqual(sb.FAS_CONFIG.FAS_CL_PRICE_EDITS_PAUSED, true);
  store.fasEditPending = { CRAIGSLIST: [{ id: 'c1', priceDrift: true, price: 5 }], FACEBOOK: [{ id: 'f1', priceDrift: true, price: 7 }] };
  const out = await sb.fasEditPump();
  assert.deepStrictEqual(calls.run, ['FACEBOOK:1'], 'only Facebook ran');
  assert.deepStrictEqual(calls.claim, [], 'Craigslist lock never taken');
  assert.deepStrictEqual(calls.tabs, []);
  assert.deepStrictEqual(calls.api, [], 'no mark-synced / failure endpoint');
  assert.strictEqual(store.fasEditPending.CRAIGSLIST.length, 1, 'Craigslist entries stay pending');
  assert.strictEqual(store.fasEditState, undefined, 'nothing recorded as failed or done');
  assert.ok(calls.log.some((l) => l.code === 'cl_price_edits_paused' && l.lvl === 'info' && /Craigslist price edits are paused \(FAS_CL_PRICE_EDITS_PAUSED\)/.test(l.msg)));
  assert.ok(!/CRAIGSLIST/.test(out), 'pump outcome does not claim a Craigslist run');
});
test('pause ON: Craigslist-only queue -> pump does nothing at all', async () => {
  const { sb, store, calls } = loadBackground();
  store.fasEditPending = { CRAIGSLIST: [{ id: 'c1', priceDrift: true, price: 5 }, { id: 'c2', quantityDrift: true, quantity: 2 }] };
  await sb.fasEditPump();
  assert.deepStrictEqual(calls.run, []); assert.deepStrictEqual(calls.claim, []); assert.deepStrictEqual(calls.api, []);
  assert.strictEqual(store.fasEditPending.CRAIGSLIST.length, 2);
});
test('pause ON: fasEditRunPlatform called directly for Craigslist returns paused_by_config and touches nothing (no quantity-only confirm either)', async () => {
  const { sb, store, calls } = loadBackground({ realRun: true });
  const r = await sb.fasEditRunPlatform('CRAIGSLIST', [{ id: 'q1', quantityDrift: true, quantity: 3 }, { id: 'p1', priceDrift: true, price: 9 }]);
  assert.strictEqual(r, 'paused_by_config');
  assert.deepStrictEqual(calls.api, [], 'no price-synced-for-platform / failure call');
  assert.deepStrictEqual(calls.tabs, []);
  assert.deepStrictEqual(store, {});
});
test('pause OFF (constant false): the pump runs Craigslist exactly as before (claim taken, run started)', async () => {
  const { sb, store, calls } = loadBackground();
  sb.FAS_CONFIG.FAS_CL_PRICE_EDITS_PAUSED = false;
  store.fasEditPending = { CRAIGSLIST: [{ id: 'c1', priceDrift: true, price: 5 }], FACEBOOK: [{ id: 'f1', priceDrift: true, price: 7 }] };
  await sb.fasEditPump();
  assert.deepStrictEqual(calls.run, ['FACEBOOK:1', 'CRAIGSLIST:1']);
  assert.deepStrictEqual(calls.claim, ['edit']);
  assert.ok(!calls.log.some((l) => l.code === 'cl_price_edits_paused'));
});
test('pause: the paused-note is logged at most once per hour', () => {
  const { sb, calls } = loadBackground();
  sb.fasClPriceEditsPausedNote(3); sb.fasClPriceEditsPausedNote(3); sb.fasClPriceEditsPausedNote(4);
  assert.strictEqual(calls.log.filter((l) => l.code === 'cl_price_edits_paused').length, 1);
});
test('pause scope: removal, renew and the stale-flag reconcile never go through the edit pump / FAS_CL_PRICE_EDITS_PAUSED', () => {
  const bg = read('background.js');
  const hits = bg.split('\n').filter((l) => /FAS_CL_PRICE_EDITS_PAUSED|isEditPausedByConfig|nextEditPlatform|fasClPriceEditsPausedNote/.test(l));
  assert.ok(hits.length > 0 && hits.length < 8, 'pause is referenced in only a few places: ' + hits.length);
  // reconcile + removal use the dedicated removal tab and fas-craigslist-removal-frame.js, never fasEditExec / fas-edit-engine.js
  const recon = bg.slice(bg.indexOf('async function fasClMaybeStartReconcile'), bg.indexOf('async function fasClApplyReconcile'));
  assert.ok(!/fasEditExec|fasEditPump|fasEditRunPlatform|fasEditApplyItem|fas-edit-engine/.test(recon));
  assert.ok(!/fas-edit-engine/.test(read('fas-craigslist-removal-frame.js')));
});

// ------------------------------------------------------------------ (B) identity: guard ---------------------------------------------------
test('guard: preview headings give the posting title, skipping the "Attention" banner; non-preview pages do not read headings', () => {
  assert.strictEqual(G.previewHeadingTitle(['Attention: posting will expire in 28 days', 'Cecil Fielder 1990 Fleer card - $4 (Detroit) ...']), 'Cecil Fielder 1990 Fleer card - $4 (Detroit) ...');
  assert.strictEqual(G.previewHeadingTitle(['Attention: posting will expire in 28 days']), '');
  assert.strictEqual(G.previewHeadingTitle([]), '');
  const mk = (heads) => ({ querySelector: () => null, querySelectorAll: () => heads.map((t) => ({ innerText: t, textContent: t })) });
  const doc = mk(['Attention: posting will expire in 28 days', 'Coca Cola metal sign']);
  assert.strictEqual(G.pagePostingTitle(doc, { preview: true }), 'Coca Cola metal sign');
  assert.strictEqual(G.pagePostingTitle(doc), '', 'headings are only read on preview pages');
});
test('guard: a preview heading "TITLE - $price (location)" is compatible with the plain title, even for short titles', () => {
  assert.strictEqual(G.titlesCompatible('Brass lamp - $25 (Paw Paw)', ['Brass lamp']), 'match');
  assert.strictEqual(G.titlesCompatible('Brass lamp - $25 (Paw Paw)', ['Brass candlestick']), 'mismatch');
});

// ------------------------------------------------------------------ (B) identity: engine --------------------------------------------------
function el(o) { return Object.assign({ getBoundingClientRect: () => ({ width: 10, height: 10 }), getAttribute: () => null, classList: { contains: () => false }, tagName: 'DIV', innerText: '', textContent: '' }, o || {}); }
// A Craigslist posting-flow page: `buttons` are labels, `heads` are h1-h4 texts, `titleInput` is the form's PostingTitle value (or null), `price` adds the price input.
function page(o) {
  const buttons = (o.buttons || []).map((l) => el({ tagName: 'INPUT', value: l, innerText: '', textContent: '' }));
  const heads = (o.heads || []).map((t) => el({ tagName: 'H2', innerText: t, textContent: t }));
  const titleInput = o.titleInput != null ? el({ value: o.titleInput, tagName: 'INPUT' }) : null;
  return { document: { title: o.docTitle || 'posting', body: { innerText: o.body || 'posting', textContent: '' },
    querySelector: (sel) => {
      if (/PostingTitle/.test(sel)) return titleInput;
      if (/price/.test(sel) && o.price) return el({ value: '4', tagName: 'INPUT' });
      return null;
    },
    querySelectorAll: (sel) => /^h1/.test(sel) ? heads : (/button|submit/.test(sel) ? buttons : []) } };
}
function loadEngine(dom) {
  const clicks = [];
  const sandbox = { console, clearTimeout, Math, Date, JSON, URL, Promise };
  sandbox.setTimeout = (f, ms, ...a) => { if (ms === 80) { clicks.push('click'); return 0; } return setTimeout(f, ms, ...a); };
  sandbox.self = sandbox; sandbox.window = sandbox;
  sandbox.document = Object.assign({ querySelector: () => null, querySelectorAll: () => [], title: '', body: { innerText: '', textContent: '' } }, dom.document || {});
  sandbox.location = Object.assign({ href: 'https://post.craigslist.org/k/abc', hostname: 'post.craigslist.org', pathname: '/k/abc', search: '' }, dom.location || {});
  sandbox.getComputedStyle = () => ({ visibility: 'visible', display: 'block' });
  sandbox.requestAnimationFrame = (f) => setTimeout(f, 0);
  sandbox.PointerEvent = sandbox.MouseEvent = sandbox.Event = function (type, init) { this.type = type; Object.assign(this, init || {}); };
  vm.createContext(sandbox);
  for (const f of ['fas-edit-core.js', 'fas-cl-guard.js', 'fas-edit-engine.js']) vm.runInContext(read(f), sandbox);
  const fn = sandbox.FAS_EDIT_ENGINE._test.clStep;
  return { step: fn, clicks };
}
const ITEM = { id: 'it1', title: 'Cecil Fielder 1990 Fleer Detroit Tigers baseball card', priceDrift: true, price: 4 };
const ctx = (scratch) => ({ platform: 'CRAIGSLIST', item: ITEM, scratch: scratch, stepNo: 3 });
const EDIT = { phase: 'edit', postingId: '123456789', priceSet: false, hops: 1, rowTitle: ITEM.title };
const PREVIEW_BTNS = ['publish', 'edit post', 'edit location', 'edit images', 'cancel edit'];

test('identity (preview): heading of ANOTHER posting -> posting_identity_mismatch, nothing clicked', async () => {
  const e = loadEngine(page({ buttons: PREVIEW_BTNS, heads: ['Attention: posting will expire in 28 days', 'Coca Cola Skating Girl metal sign - $20 (Detroit)'] }));
  const r = await e.step(ctx(EDIT));
  assert.strictEqual(r.state, 'fail'); assert.strictEqual(r.code, 'posting_identity_mismatch'); assert.deepStrictEqual(e.clicks, []);
});
test('identity (preview): title cannot be read -> posting_identity_unverified, "edit post" is NOT pressed, nothing clicked', async () => {
  const e = loadEngine(page({ buttons: PREVIEW_BTNS, heads: ['Attention: posting will expire in 28 days'] }));
  const r = await e.step(ctx(EDIT));
  assert.strictEqual(r.state, 'fail'); assert.strictEqual(r.code, 'posting_identity_unverified'); assert.deepStrictEqual(e.clicks, []);
  assert.strictEqual(r.details.blockedClick, 'edit post');
});
test('identity (preview): matching heading -> proceeds to "edit post" (one click) and remembers the identity', async () => {
  const e = loadEngine(page({ buttons: PREVIEW_BTNS, heads: ['Attention: posting will expire in 28 days', ITEM.title + ' - $9 (Detroit) ...'] }));
  const r = await e.step(ctx(EDIT));
  assert.strictEqual(r.state, 'continue'); assert.strictEqual(e.clicks.length, 1);
  assert.strictEqual(r.scratch.identityOk, true);
});
test('identity (preview, price already typed): publish with unreadable title is refused; with matching title it is pressed', async () => {
  const bad = loadEngine(page({ buttons: ['publish', 'edit post'], heads: ['Attention: posting will expire in 28 days'] }));
  const r1 = await bad.step(ctx(Object.assign({}, EDIT, { priceSet: true, identityOk: true })));
  assert.strictEqual(r1.code, 'posting_identity_unverified'); assert.deepStrictEqual(bad.clicks, []);
  assert.strictEqual(r1.details.blockedClick, 'publish');
  const ok = loadEngine(page({ buttons: ['publish', 'edit post'], heads: ['Attention: posting will expire in 28 days', ITEM.title] }));
  const r2 = await ok.step(ctx(Object.assign({}, EDIT, { priceSet: true })));
  assert.strictEqual(r2.state, 'continue'); assert.strictEqual(ok.clicks.length, 1);
});
test('identity (form): unreadable title box value never lets Continue through; matching title does', async () => {
  const bad = loadEngine(page({ buttons: ['continue'], titleInput: '', price: true }));
  const r1 = await bad.step(ctx(EDIT));
  assert.strictEqual(r1.code, 'posting_identity_unverified'); assert.deepStrictEqual(bad.clicks, []);
  const mism = loadEngine(page({ buttons: ['continue'], titleInput: 'Coca Cola Skating Girl metal sign', price: true }));
  assert.strictEqual((await mism.step(ctx(EDIT))).code, 'posting_identity_mismatch');
  assert.deepStrictEqual(mism.clicks, []);
});
test('identity (manage page): "edit this posting" needs a readable matching title too', async () => {
  const bad = loadEngine(page({ buttons: ['edit this posting'] }));
  const r = await bad.step(ctx(EDIT));
  assert.strictEqual(r.code, 'posting_identity_unverified'); assert.deepStrictEqual(bad.clicks, []);
  const ok = loadEngine(page({ buttons: ['edit this posting'], heads: [ITEM.title] }));
  const r2 = await ok.step(ctx(EDIT));
  assert.strictEqual(r2.state, 'continue'); assert.strictEqual(ok.clicks.length, 1);
});
test('identity (untitled intermediate pages): a plain Continue after an earlier matched page is allowed; without a matched page it is refused', async () => {
  const inter = loadEngine(page({ buttons: ['continue'], body: 'location map' }));
  const r1 = await inter.step(ctx(Object.assign({}, EDIT, { priceSet: true, identityOk: true })));
  assert.strictEqual(r1.state, 'continue'); assert.strictEqual(inter.clicks.length, 1);
  const none = loadEngine(page({ buttons: ['continue'], body: 'location map' }));
  const r2 = await none.step(ctx(Object.assign({}, EDIT, { priceSet: true })));
  assert.strictEqual(r2.code, 'posting_identity_unverified'); assert.deepStrictEqual(none.clicks, []);
  // a bare "publish" on an untitled page is never lenient
  const pub = loadEngine(page({ buttons: ['publish'], body: 'x' }));
  const r3 = await pub.step(ctx(Object.assign({}, EDIT, { priceSet: true, identityOk: true })));
  assert.strictEqual(r3.code, 'posting_identity_unverified'); assert.deepStrictEqual(pub.clicks, []);
});
test('identity: the new failure code survives the diagnostics builder and the manifest/version is 1.0.53', () => {
  const d = Core.buildDiag({ platform: 'CRAIGSLIST', itemId: 'x', title: 'T', outcome: 'failed', code: 'posting_identity_unverified', reason: 'r', details: { blockedClick: 'publish' } }, { version: '1.0.24' });
  assert.strictEqual(d.code, 'posting_identity_unverified'); assert.strictEqual(d.v, '1.0.24');
  assert.strictEqual(JSON.parse(read('manifest.json')).version, '1.0.53');
  for (const f of ['background.js', 'config.js', 'fas-edit-core.js', 'fas-edit-engine.js', 'fas-cl-guard.js', 'tests/fas-cl-pause.test.js']) assert.ok(!fs.readFileSync(path.join(root, f)).includes(0), f + ' has NUL bytes');
});
