// Node tests for extension 1.0.24: (A) Mercari Smart Pricing turn-off re-queries the live button (React replaces the node), (B) Vinted reports listing_not_found
// after a COMPLETE wardrobe read with zero exact matches. Run: node --test extension/tests/fas-mercari-vinted-1024.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const W = require('../fas-mercari-weight.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const noSleep = async () => {};

// ---- A: a stubbed DOM whose click can REPLACE the node ----
function makeNode(p) { const n = { isConnected: true, _p: p, getAttribute: (a) => (a === 'aria-pressed' ? n._p : null) }; return n; }
// flipOn: click number that turns it OFF (0 = never). replace: the click swaps in a NEW node (old one stays 'true' + disconnected).
// missingPolls: after a replacing click, getBtn() returns null this many times first.
function world({ flipOn, replace, missingPolls = 0 }) {
  const w = { cur: makeNode('true'), clicks: 0, queries: 0, missing: 0, clicked: [] };
  w.getBtn = () => { w.queries++; if (w.missing > 0) { w.missing--; return null; } return w.cur; };
  w.click = async (node) => {
    w.clicks++; w.clicked.push(node);
    if (!flipOn || w.clicks < flipOn) return;
    if (replace) { const old = w.cur; old.isConnected = false; w.cur = makeNode('false'); w.missing = missingPolls; }
    else w.cur._p = 'false';
  };
  return w;
}
test('replaced node: ONE click, ok, and the detached old node is still aria-pressed=true', async () => {
  const w = world({ flipOn: 1, replace: true }); const old = w.cur;
  const r = await W.setToggleOff(w.getBtn, { click: w.click, sleep: noSleep });
  assert.deepStrictEqual([r.ok, r.attempts, r.state, w.clicks], [true, 1, 'false', 1]);
  assert.strictEqual(old.isConnected, false); assert.strictEqual(old._p, 'true');
  assert.strictEqual(w.clicked[0], old);
});
test('never flips: gives up after exactly 3 clicks, every click lands on the live node', async () => {
  const w = world({ flipOn: 0, replace: true });
  const r = await W.setToggleOff(w.getBtn, { click: w.click, sleep: noSleep });
  assert.deepStrictEqual([r.ok, r.attempts, r.state, w.clicks], [false, 3, 'true', 3]);
  assert.ok(w.clicked.every((n) => n === w.cur && n.isConnected));
});
test('flips only on the 2nd click (node replaced): ok after exactly 2 clicks, no third click', async () => {
  const w = world({ flipOn: 2, replace: true });
  const r = await W.setToggleOff(w.getBtn, { click: w.click, sleep: noSleep });
  assert.deepStrictEqual([r.ok, r.attempts, w.clicks], [true, 2, 2]);
});
test('new node briefly missing after the click: waits, then ok with a single click', async () => {
  const w = world({ flipOn: 1, replace: true, missingPolls: 5 });
  const r = await W.setToggleOff(w.getBtn, { click: w.click, sleep: noSleep });
  assert.deepStrictEqual([r.ok, r.attempts, r.state, w.clicks], [true, 1, 'false', 1]);
});
test('node missing for longer than the wait is NOT clicked blind and reports failure', async () => {
  const w = world({ flipOn: 1, replace: true, missingPolls: 100000 });
  const r = await W.setToggleOff(w.getBtn, { click: w.click, sleep: noSleep });
  assert.deepStrictEqual([r.ok, w.clicks, r.state], [false, 1, null]);
});
test('already OFF on the live node: zero clicks; a plain element is still accepted', async () => {
  const w = world({ flipOn: 1, replace: true }); w.cur._p = 'false';
  assert.deepStrictEqual((({ ok, attempts }) => [ok, attempts])(await W.setToggleOff(w.getBtn, { click: w.click, sleep: noSleep })), [true, 0]);
  assert.strictEqual(w.clicks, 0);
  const el = makeNode('false');
  assert.strictEqual((await W.setToggleOff(el, { click: w.click, sleep: noSleep })).ok, true);
});
test('late flip seen on the re-query right before the 2nd click: exactly 1 click total', async () => {
  const w = world({ flipOn: 0, replace: false });
  let polls = 0; const get = () => { polls++; if (polls === 14) w.cur._p = 'false'; return w.cur; };   // 1 settle + 1 pre + 11 post-click polls = 13; poll 14 is the pre-click re-query of attempt 2
  const r = await W.setToggleOff(get, { click: w.click, sleep: noSleep }, { waitMs: 100, stepMs: 10 });
  assert.deepStrictEqual([r.ok, r.attempts, w.clicks], [true, 1, 1]);
});
test('source pin: turnOffMercariSmartPricing passes a getter, not a held node, and fas-mercari.js holds no SmartPricingButton reference', () => {
  const src = read('fas-mercari.js');
  const i = src.indexOf('async function turnOffMercariSmartPricing'); const seg = src.slice(i, i + 4600);
  assert.ok(seg.indexOf('setToggleOff(getBtn,') !== -1);
  assert.ok(seg.indexOf("getAttribute('aria-pressed')") === -1);
  assert.strictEqual((src.match(/SmartPricingButton/g) || []).length, 2); // doc comment + getBtn selector (the DIAG line uses SmartPricingFloorPrice)
});

// ---- B: Vinted resolver, extracted from the real source and run against a stubbed wardrobe API ----
function extractFn(src, name) {
  const m = new RegExp('(?:async )?function ' + name + '\\(').exec(src); assert.ok(m, name + ' not found');
  let i = src.indexOf('{', m.index), depth = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (!depth) return src.slice(m.index, j + 1); } }
  throw new Error('unbalanced ' + name);
}
function loadResolver({ pages, cards = [] }) {
  const src = read('fas-vinted.js');
  const code = ['fasFoldTitle', 'vintRemNorm', 'vintRemMemberIdFromLocation', 'vintRemFetchWardrobePage', 'vintRemFetchWardrobeMatchIds', 'vintRemCardMatchIds', 'resolveVintedListingIdByTitle']
    .map((n) => extractFn(src, n)).join('\n') +
    '\nconst VINT_REM_MIN_SAFE_TITLE_LEN = 8, VINT_REM_API_PER_PAGE = 20, VINT_REM_API_MAX_PAGES = 25;' +
    '\nfunction vintRemParseCardTitle(t){return t?vintRemNorm(String(t).split(", brand:")[0]):null;} function vintRemItemIdFromHref(h){var m=/items\\/(\\d+)/.exec(h||"");return m?m[1]:null;}';
  const sb = {
    location: { origin: 'https://www.vinted.com', pathname: '/member/123-me' },
    sleep: async () => {}, console: { log() {}, warn() {} }, Math, Promise, Set, Array, Date, encodeURIComponent, Number, String, RegExp,
    document: { querySelector: () => (cards.length ? {} : null), querySelectorAll: () => cards },
    fetch: async (url) => {
      const pg = Number(/page=(\d+)/.exec(url)[1]); const items = pages[pg - 1];
      if (!items) return { ok: false, status: 500 };
      return { ok: true, status: 200, json: async () => ({ items, pagination: { total_pages: pages.length } }) };
    },
  };
  vm.createContext(sb);
  vm.runInContext(code + '\nthis.resolve = resolveVintedListingIdByTitle;', sb);
  return sb.resolve;
}
const it = (id, title) => ({ id, title });
test('vinted: COMPLETE wardrobe read + 0 exact matches -> listing_not_found (bare reason, apiComplete)', async () => {
  const resolve = loadResolver({ pages: [[it(1, 'Hortilux 600W bulb'), it(2, 'Hortilux 400W lamp')]] });
  const r = await resolve('Hortilux 1000W Super HPS Bulb');
  assert.deepStrictEqual([r.id, r.reason, r.apiComplete], [null, 'listing_not_found', true]);
});
test('vinted: INCOMPLETE read (page cap / unusable API) never concludes not-found', async () => {
  const resolve = loadResolver({ pages: [] });   // page 1 -> HTTP 500: unusable API, cards empty
  const r = await resolve('Hortilux 1000W Super HPS Bulb');
  assert.strictEqual(r.reason, 'wardrobe_read_incomplete');
  assert.notStrictEqual(r.reason, 'listing_not_found');
});
test('vinted: 2 exact matches -> ambiguous_duplicate_title (not listing_not_found); 1 match -> id', async () => {
  const dup = loadResolver({ pages: [[it(1, 'Cigar Mold Large'), it(2, 'cigar mold large')]] });
  assert.strictEqual((await dup('Cigar Mold Large')).reason, 'ambiguous_duplicate_title');
  const one = loadResolver({ pages: [[it(7, 'Cigar Mold Large')]] });
  assert.deepStrictEqual([(await one('Cigar Mold Large')).id], ['7']);
});
test('vinted: a too-short title keeps no_confident_listing_match (absence is not proven)', async () => {
  const resolve = loadResolver({ pages: [[it(1, 'x')]] });
  assert.strictEqual((await resolve('abc')).reason, 'no_confident_listing_match');
});
test('vinted caller: listing_not_found is signalled as crossPlatformRemovalSkipped with the bare reason; incomplete stays an attempt-failed; background passes it through to confirmedGone logic', () => {
  const v = read('fas-vinted.js');
  assert.ok(v.indexOf("match.reason === 'listing_not_found' ? 'listing_not_found'") !== -1);
  assert.ok(v.indexOf("vintRemSignalBackground('crossPlatformRemovalSkipped', item, reasonText)") !== -1);
  const b = read('background.js');
  assert.ok(b.indexOf("confirmedGone: resyncActive && msg.reason === 'listing_not_found'") !== -1);
});
