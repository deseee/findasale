// Node tests for extension 1.0.23: (A) Craigslist PRICE-EDIT gating (since 2026-11-01 the staged FAS_CL_PRICE_EDIT_MODE: paused / canary / on),
// (B) fail-closed Craigslist posting identity in the edit flow.
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

// ------------------------------------------------------------------ (A) staged mode: pure decision ---------------------------------------
// 2026-11-01: FAS_CL_PRICE_EDITS_PAUSED (boolean) became FAS_CL_PRICE_EDIT_MODE 'paused' | 'canary' | 'on' (owner decision: one verified edit first).
const HOUR = 3600 * 1000;
const M = (mode) => ({ FAS_CL_PRICE_EDIT_MODE: mode });
test('mode: config ships canary, the old boolean is gone, and anything unknown fails closed to paused', () => {
  const cfgSrc = read('config.js');
  assert.match(cfgSrc, /FAS_CL_PRICE_EDIT_MODE:\s*'canary'/);
  assert.ok(!/FAS_CL_PRICE_EDITS_PAUSED:/.test(cfgSrc), 'old boolean removed from config');
  assert.strictEqual(Core.clPriceEditMode(M('canary')), 'canary');
  assert.strictEqual(Core.clPriceEditMode(M('on')), 'on');
  for (const bad of [{}, null, undefined, M('ON'), M(''), M(true), { FAS_CL_PRICE_EDITS_PAUSED: false }]) assert.strictEqual(Core.clPriceEditMode(bad), 'paused', JSON.stringify(bad));
});
test('gate: paused blocks; on allows with the per-run cap; canary allows ONE item per 24 h counted from the last attempt', () => {
  const now = Date.UTC(2026, 10, 1, 12);
  assert.deepStrictEqual(Core.clEditGate(M('paused'), null, now), { mode: 'paused', allowed: false, cap: 0, reason: 'paused', nextAt: null });
  const on = Core.clEditGate(M('on'), { at: now - 60 }, now);
  assert.strictEqual(on.allowed, true); assert.strictEqual(on.cap, Core.CL_ON_RUN_CAP); assert.strictEqual(Core.CL_ON_RUN_CAP, 25);
  assert.deepStrictEqual(Core.clEditGate(M('canary'), null, now), { mode: 'canary', allowed: true, cap: 1, reason: '', nextAt: null });
  const used = Core.clEditGate(M('canary'), { at: now - 2 * HOUR }, now);
  assert.strictEqual(used.allowed, false); assert.strictEqual(used.reason, 'canary_used'); assert.strictEqual(used.nextAt, now + 22 * HOUR);
  assert.strictEqual(Core.clEditGate(M('canary'), { at: now - 25 * HOUR }, now).allowed, true, 'next day allowed again');
  assert.strictEqual(Core.clEditGate(M('canary'), { at: now + HOUR }, now).allowed, false, 'record from the future fails closed');
  assert.strictEqual(Core.isEditPausedByConfig('CRAIGSLIST', M('canary'), { at: now - HOUR }, now), true);
  assert.strictEqual(Core.isEditPausedByConfig('CRAIGSLIST', M('canary'), null, now), false);
  assert.strictEqual(Core.isEditPausedByConfig('CRAIGSLIST', {}, null, now), true, 'missing mode fails closed');
  for (const p of ['FACEBOOK', 'POSHMARK', 'MERCARI', 'GRAILED', 'GUMTREE_AU']) assert.strictEqual(Core.isEditPausedByConfig(p, M('paused'), null, now), false, p + ' unaffected');
});
test('gate: nextEditPlatform skips Craigslist when paused or when the canary is used, keeps it otherwise', () => {
  const pending = { CRAIGSLIST: [{ id: 'a' }], FACEBOOK: [{ id: 'b' }], MERCARI: [] };
  const now = Date.now();
  assert.strictEqual(Core.nextEditPlatform(pending, new Set(), M('paused')), 'FACEBOOK');
  assert.strictEqual(Core.nextEditPlatform({ CRAIGSLIST: [{ id: 'a' }] }, new Set(), M('paused')), undefined);
  assert.strictEqual(Core.nextEditPlatform({ CRAIGSLIST: [{ id: 'a' }] }, new Set(), M('canary'), { at: now - HOUR }, now), undefined);
  assert.strictEqual(Core.nextEditPlatform({ CRAIGSLIST: [{ id: 'a' }] }, new Set(), M('canary'), null, now), 'CRAIGSLIST');
  assert.strictEqual(Core.nextEditPlatform({ CRAIGSLIST: [{ id: 'a' }] }, new Set(), M('on')), 'CRAIGSLIST');
  assert.strictEqual(Core.nextEditPlatform(pending, new Set(['FACEBOOK']), M('on')), 'CRAIGSLIST');
});
test('canary pick: a plain price change, preferring a stored posting URL, then a stored id, then title only', () => {
  const N = (r) => Core.normalizeEntry(r, 'CRAIGSLIST');
  const t = N({ id: 't', title: 'Title only', price: 5 });
  const i = N({ id: 'i', title: 'Has id', price: 6, remoteListingId: '7980221088' });
  const u = N({ id: 'u', title: 'Has url', price: 7, remoteListingUrl: 'https://kalamazoo.craigslist.org/clt/d/paw-paw-x/7986006834.html' });
  assert.strictEqual(u.remoteListingId, '7986006834');
  assert.strictEqual(Core.pickCanaryEntry([t, i, u]).id, 'u');
  assert.strictEqual(Core.pickCanaryEntry([t, i]).id, 'i');
  assert.strictEqual(Core.pickCanaryEntry([t]).id, 't');
  assert.strictEqual(Core.pickCanaryEntry([N({ id: 'q', title: 'x', price: 5, quantityDrift: true, quantity: 2 }), N({ id: 'z', title: 'y', price: 0 }), N({ id: 'n', title: 'y', priceDrift: false, price: 4 })]), null);
  assert.strictEqual(Core.pickCanaryEntry([]), null);
});

// ------------------------------------------------------------------ (A) the real background.js pump in a vm -------------------------------
function loadBackground(opts) {
  opts = opts || {};
  const store = {};
  const deep = () => new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : deep()), apply: () => undefined });
  const calls = { run: [], claim: [], api: [], tabs: [], log: [], fasLog: [], apply: [] };
  const own = {
    storage: { local: {
      get: async (k) => { const o = {}; (Array.isArray(k) ? k : [k]).forEach((x) => { if (x in store) o[x] = JSON.parse(JSON.stringify(store[x])); }); return o; },
      set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); },
      remove: async (k) => { (Array.isArray(k) ? k : [k]).forEach((x) => delete store[x]); } }, session: undefined },
    runtime: { getManifest: () => ({ version: 'test' }), onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
    tabs: new Proxy({ create: async () => { calls.tabs.push('create'); return { id: 77 }; }, update: (id, p, cb) => { calls.tabs.push('update'); if (typeof cb === 'function') cb(); }, remove: (id, cb) => { calls.tabs.push('remove'); if (typeof cb === 'function') cb(); }, query: async () => [], get: () => undefined }, { get: (t, k) => (k in t ? t[k] : deep()) })
  };
  const sb = { console, setTimeout: () => 0, clearTimeout() {}, Math, Date, JSON, URL, Promise, Set, Map };
  sb.self = sb; sb.window = sb;
  sb.chrome = new Proxy(function () {}, { get: (t, k) => (k in own ? own[k] : deep()) });
  sb.importScripts = (...files) => files.forEach((f) => vm.runInContext(read(f), sb));
  vm.createContext(sb);
  vm.runInContext(read('background.js'), sb);
  if (opts.mode) sb.FAS_CONFIG.FAS_CL_PRICE_EDIT_MODE = opts.mode;
  sb.apiFetch = async (u, o) => { calls.api.push(u); return opts.api ? opts.api(u, o) : { ok: true, status: 200, data: {} }; };
  sb.fasLog = (lvl, source, msg, ctx, extra) => { calls.fasLog.push({ lvl, source, msg, ctx, extra }); };
  sb.fasT = (lvl, code, msg) => { calls.log.push({ lvl, code, msg }); };
  sb.sleep = async () => {};
  if (!opts.realRun) {
    sb.fasEditRunLockFree = async () => true;
    sb.fasClTryClaim = async (k) => { calls.claim.push(k); return { ok: true }; };
    sb.fasEditRunPlatform = async (p, entries) => { calls.run.push(p + ':' + entries.length); return 'ran'; };
  } else {
    sb.fasIsPlatformPaused = async () => false;
    sb.fasEditApplyItem = async (tabId, platform, entry) => {
      calls.apply.push(entry.id);
      return opts.applyResult ? opts.applyResult(entry) : { state: 'done', scratch: { postingId: entry.remoteListingId || '7111111111', oldPrice: 9 }, details: { readBack: { price: entry.price }, postingId: entry.remoteListingId || '7111111111' }, trail: [], diags: [] };
    };
  }
  return { sb, store, calls };
}
test('paused: the pump never starts a Craigslist run (no claim, no tab, no api), leaves it pending, and still runs other platforms', async () => {
  const { sb, store, calls } = loadBackground({ mode: 'paused' });
  store.fasEditPending = { CRAIGSLIST: [{ id: 'c1', priceDrift: true, price: 5 }], FACEBOOK: [{ id: 'f1', priceDrift: true, price: 7 }] };
  const out = await sb.fasEditPump();
  assert.deepStrictEqual(calls.run, ['FACEBOOK:1'], 'only Facebook ran');
  assert.deepStrictEqual(calls.claim, [], 'Craigslist lock never taken');
  assert.deepStrictEqual(calls.tabs, []);
  assert.deepStrictEqual(calls.api, [], 'no mark-synced / failure endpoint');
  assert.strictEqual(store.fasEditPending.CRAIGSLIST.length, 1, 'Craigslist entries stay pending');
  assert.strictEqual(store.fasEditState, undefined, 'nothing recorded as failed or done');
  assert.ok(calls.log.some((l) => l.code === 'cl_price_edits_paused' && l.lvl === 'info' && /Craigslist price edits are paused \(FAS_CL_PRICE_EDIT_MODE paused\)/.test(l.msg)));
  assert.ok(!/CRAIGSLIST/.test(out), 'pump outcome does not claim a Craigslist run');
});
test('paused: fasEditRunPlatform called directly for Craigslist returns paused_by_config and touches nothing (no quantity-only confirm either)', async () => {
  const { sb, store, calls } = loadBackground({ mode: 'paused', realRun: true });
  const r = await sb.fasEditRunPlatform('CRAIGSLIST', [{ id: 'q1', quantityDrift: true, quantity: 3 }, { id: 'p1', priceDrift: true, price: 9 }]);
  assert.strictEqual(r, 'paused_by_config');
  assert.deepStrictEqual(calls.api, []); assert.deepStrictEqual(calls.tabs, []); assert.deepStrictEqual(store, {});
});
test('on: the pump runs Craigslist as before (claim taken, run started)', async () => {
  const { sb, store, calls } = loadBackground({ mode: 'on' });
  store.fasEditPending = { CRAIGSLIST: [{ id: 'c1', priceDrift: true, price: 5 }], FACEBOOK: [{ id: 'f1', priceDrift: true, price: 7 }] };
  await sb.fasEditPump();
  assert.deepStrictEqual(calls.run, ['FACEBOOK:1', 'CRAIGSLIST:1']);
  assert.deepStrictEqual(calls.claim, ['edit']);
  assert.ok(!calls.log.some((l) => l.code === 'cl_price_edits_paused' || l.code === 'cl_canary_waiting'));
});
const CL_Q = () => [
  { id: 't1', title: 'Brass lamp with shade', priceDrift: true, price: 5 },
  { id: 'i1', title: 'Cast iron skillet', priceDrift: true, price: 12, remoteListingId: '7980221088' },
  { id: 'u1', title: 'Profile PT-500 guitar tuner', priceDrift: true, price: 8, remoteListingId: '7987135515', remoteListingUrl: 'https://kalamazoo.craigslist.org/msg/d/paw-paw-profile-pt-500-guitar-tuner/7987135515.html' },
  { id: 'q1', title: 'Stock only', priceDrift: false, quantityDrift: true, quantity: 2 }
];
test('canary: edits exactly ONE Craigslist item (the one with a stored posting URL), records it, logs cl_canary_edit at warn, then stops for the day', async () => {
  const { sb, store, calls } = loadBackground({ mode: 'canary', realRun: true });
  const r = await sb.fasEditRunPlatform('CRAIGSLIST', CL_Q());
  assert.deepStrictEqual(calls.apply, ['u1'], 'one item only');
  assert.match(r, /^applied_1_failed_0/);
  const c = store.fasClCanary;
  assert.strictEqual(c.itemId, 'u1'); assert.strictEqual(c.outcome, 'done'); assert.strictEqual(c.verified, true); assert.strictEqual(c.backendConfirmed, true);
  assert.strictEqual(c.postingId, '7987135515');
  assert.strictEqual(c.postingUrl, 'https://kalamazoo.craigslist.org/msg/d/paw-paw-profile-pt-500-guitar-tuner/7987135515.html');
  assert.strictEqual(c.oldPrice, 9); assert.strictEqual(c.newPrice, 8);
  const line = calls.fasLog.find((l) => l.source === 'cl_canary_edit');
  assert.ok(line, 'runtime-log line sent'); assert.strictEqual(line.lvl, 'warn');
  assert.match(line.msg, /^cl_canary_edit: VERIFIED .*\$9 -> \$8 posting 7987135515 https:\/\/kalamazoo\.craigslist\.org\//);
  assert.strictEqual(line.extra.itemId, 'u1'); assert.strictEqual(line.extra.platform, 'CRAIGSLIST');
  assert.ok(JSON.stringify(line.ctx).length < 2000, 'fits the backend context cap');
  assert.ok(calls.api.some((u) => /\/extension\/items\/u1\/price-synced-for-platform/.test(u)), 'verified edit confirmed to the backend');
  assert.ok(!calls.api.some((u) => /\/items\/(t1|i1)\//.test(u)), 'the other price items are not touched or confirmed');
  // same day: nothing more, not even a lock claim from the pump
  calls.apply.length = 0; calls.api.length = 0;
  assert.strictEqual(await sb.fasEditRunPlatform('CRAIGSLIST', CL_Q()), 'canary_used_today');
  assert.deepStrictEqual(calls.apply, []); assert.deepStrictEqual(calls.api, []);
  assert.ok(calls.log.some((l) => l.code === 'cl_canary_waiting'));
});
test('canary: the pump does not claim the Craigslist lock once the canary is used', async () => {
  const { sb, store, calls } = loadBackground({ mode: 'canary' });
  store.fasClCanary = { at: Date.now() - HOUR, itemId: 'x' };
  store.fasEditPending = { CRAIGSLIST: CL_Q(), FACEBOOK: [{ id: 'f1', priceDrift: true, price: 7 }] };
  await sb.fasEditPump();
  assert.deepStrictEqual(calls.run, ['FACEBOOK:1']); assert.deepStrictEqual(calls.claim, []);
  assert.strictEqual(store.fasEditPending.CRAIGSLIST.length, 4, 'left pending');
});
test('canary: a failed edit is recorded as NOT verified, still uses up the day, and the record is written before the edit starts', async () => {
  let seenAtStart = null;
  const h = loadBackground({ mode: 'canary', realRun: true, applyResult: (e) => { seenAtStart = JSON.parse(JSON.stringify(h.store.fasClCanary || null)); return { state: 'fail', code: 'listing_title_mismatch', reason: 'title guard', scratch: { postingId: null }, details: {}, trail: [], diags: [] }; } });
  await h.sb.fasEditRunPlatform('CRAIGSLIST', CL_Q().slice(0, 2));
  assert.strictEqual(seenAtStart.itemId, 'i1'); assert.strictEqual(seenAtStart.outcome, 'started');
  assert.strictEqual(h.store.fasClCanary.outcome, 'fail'); assert.strictEqual(h.store.fasClCanary.verified, false); assert.strictEqual(h.store.fasClCanary.code, 'listing_title_mismatch');
  assert.strictEqual(h.store.fasClCanary.postingId, '7980221088', 'falls back to the stored id');
  const line = h.calls.fasLog.find((l) => l.source === 'cl_canary_edit');
  assert.strictEqual(line.lvl, 'warn'); assert.match(line.msg, /NOT verified \(listing_title_mismatch\)/);
  assert.strictEqual(await h.sb.fasEditRunPlatform('CRAIGSLIST', CL_Q()), 'canary_used_today');
});
test('canary: no plain price change queued -> nothing edited and the day is not used', async () => {
  const { sb, store, calls } = loadBackground({ mode: 'canary', realRun: true });
  const r = await sb.fasEditRunPlatform('CRAIGSLIST', [{ id: 'q1', priceDrift: false, quantityDrift: true, quantity: 2 }]);
  assert.match(r, /acknowledged_1|nothing_due/);
  assert.deepStrictEqual(calls.apply, []); assert.strictEqual(store.fasClCanary, undefined);
});
test('on: per-run cap still applies (LIMITS.CRAIGSLIST.perRun, never above CL_ON_RUN_CAP), no canary record', async () => {
  const { sb, store, calls } = loadBackground({ mode: 'on', realRun: true });
  const many = Array.from({ length: 40 }, (_, i) => ({ id: 'm' + i, title: 'Item number ' + i + ' for sale', priceDrift: true, price: 3 + i }));
  await sb.fasEditRunPlatform('CRAIGSLIST', many);
  assert.strictEqual(calls.apply.length, Math.min(Core.LIMITS.CRAIGSLIST.perRun, Core.CL_ON_RUN_CAP));
  assert.strictEqual(store.fasClCanary, undefined);
  assert.ok(!calls.fasLog.some((l) => l.source === 'cl_canary_edit'));
});
test('paused-note is logged at most once per hour', () => {
  const { sb, calls } = loadBackground({ mode: 'paused' });
  sb.fasClPriceEditsPausedNote(3); sb.fasClPriceEditsPausedNote(3); sb.fasClPriceEditsPausedNote(4);
  assert.strictEqual(calls.log.filter((l) => l.code === 'cl_price_edits_paused').length, 1);
});
test('scope: removal, renew and the stale-flag reconcile never go through the edit pump / the price-edit mode', () => {
  const bg = read('background.js');
  const hits = bg.split('\n').filter((l) => /FAS_CL_PRICE_EDIT_MODE|isEditPausedByConfig|nextEditPlatform|clEditGate|fasClPriceEditsPausedNote/.test(l));
  assert.ok(hits.length > 0 && hits.length < 12, 'mode is referenced in only a few places: ' + hits.length);
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
test('identity: the new failure code survives the diagnostics builder and the manifest/version is at least 1.0.86', () => {
  const d = Core.buildDiag({ platform: 'CRAIGSLIST', itemId: 'x', title: 'T', outcome: 'failed', code: 'posting_identity_unverified', reason: 'r', details: { blockedClick: 'publish' } }, { version: '1.0.24' });
  assert.strictEqual(d.code, 'posting_identity_unverified'); assert.strictEqual(d.v, '1.0.24');
  assert.ok(require('./_version').atLeast(JSON.parse(read('manifest.json')).version, '1.0.86'));
  for (const f of ['background.js', 'config.js', 'fas-edit-core.js', 'fas-edit-engine.js', 'fas-cl-guard.js', 'tests/fas-cl-pause.test.js']) assert.ok(!fs.readFileSync(path.join(root, f)).includes(0), f + ' has NUL bytes');
});
