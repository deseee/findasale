// Node test (2026-10-25): the live case behind S-EXT-VINTED-HARD-STOP-REPROBE. Item cmuqvzky806pdsm41hd5izclz
// "Hortilux 1000 Watt Dual Arc Grow Lamp, Super HPS & Metal Halide" was SOLD via eBay; FindA.Sale still had its
// VINTED listing as POST/POSTED (no listing id captured). A complete read of the organizer's real wardrobe on
// 2026-10-25 (338 entries, 4 pages of 96) has no listing with that title -- only the similar "Hortilux Blue
// 600W ..." / "Hortilux Blue 400 Watt ..." / "Eiko LU1000 ..." ones. The current resolver must answer
// listing_not_found for that wardrobe (never pick a near-title), survive a 429 mid-read, and still find the
// listing when it IS present. Run: node --test extension/tests
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function extractFn(src, name) {
  const m = new RegExp('(?:async )?function ' + name + '\\(').exec(src); assert.ok(m, name + ' not found');
  let i = src.indexOf('{', m.index), depth = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (!depth) return src.slice(m.index, j + 1); } }
  throw new Error('unbalanced ' + name);
}
function loadResolver({ pages, failFirst = {} }) {
  const src = read('fas-vinted.js');
  const code = ['fasFoldTitle', 'vintRemNorm', 'vintRemMemberIdFromLocation', 'vintRemFetchWardrobePage', 'vintRemFetchWardrobeMatchIds', 'vintRemCardMatchIds', 'resolveVintedListingIdByTitle']
    .map((n) => extractFn(src, n)).join('\n') +
    '\nconst VINT_REM_MIN_SAFE_TITLE_LEN = 8, VINT_REM_API_PER_PAGE = 20, VINT_REM_API_MAX_PAGES = 25;' +
    '\nfunction vintRemParseCardTitle(t){return t?vintRemNorm(String(t).split(", brand:")[0]):null;} function vintRemItemIdFromHref(h){var m=/items\\/(\\d+)/.exec(h||"");return m?m[1]:null;}';
  const hits = {};
  const sb = {
    location: { origin: 'https://www.vinted.com', pathname: '/member/3177353083' },
    sleep: async () => {}, console: { log() {}, warn() {} }, Math, Promise, Set, Array, Date, encodeURIComponent, Number, String, RegExp,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    fetch: async (url) => {
      const pg = Number(/page=(\d+)/.exec(url)[1]);
      hits[pg] = (hits[pg] || 0) + 1;
      if (failFirst[pg] && hits[pg] <= failFirst[pg]) return { ok: false, status: 429 };
      const items = pages[pg - 1];
      if (!items) return { ok: false, status: 500 };
      return { ok: true, status: 200, json: async () => ({ items, pagination: { total_pages: pages.length } }) };
    },
  };
  vm.createContext(sb);
  vm.runInContext(code + '\nthis.resolve = resolveVintedListingIdByTitle;', sb);
  return sb.resolve;
}

const TITLE = 'Hortilux 1000 Watt Dual Arc Grow Lamp, Super HPS & Metal Halide';
// 338 listings across 17 pages of 20, with the real near-miss titles from the organizer's wardrobe mixed in.
function wardrobe(extra) {
  const all = [];
  for (let n = 0; n < 335; n++) all.push({ id: 10000000000 + n, title: 'Unrelated listing number ' + n });
  all.splice(40, 0, { id: 10220607597, title: 'Hortilux Blue 600W Metal Halide Grow Lamp Bulb, Daylight' });
  all.splice(160, 0, { id: 10220595725, title: 'Hortilux Blue 400 Watt Metal Halide Grow Lamp, Daylight' });
  all.splice(300, 0, { id: 10220610185, title: 'Eiko LU1000 ArcMaster High Pressure Sodium Bulb, 1000W' });
  if (extra) all.splice(250, 0, extra);
  const pages = [];
  for (let i = 0; i < all.length; i += 20) pages.push(all.slice(i, i + 20));
  return pages;
}

test('live wardrobe without the lamp: listing_not_found after a complete read (never a near-title)', async () => {
  const pages = wardrobe();
  assert.strictEqual(pages.length, 17);
  const r = await loadResolver({ pages })(TITLE);
  assert.deepStrictEqual([r.id, r.reason, r.apiComplete], [null, 'listing_not_found', true]);
});

test('a 429 on page 9 (seen live on this wardrobe) is retried, and the read still completes', async () => {
  const r = await loadResolver({ pages: wardrobe(), failFirst: { 9: 2 } })(TITLE);
  assert.deepStrictEqual([r.reason, r.apiComplete], ['listing_not_found', true]);
});

test('persistent 429 never concludes not-found', async () => {
  const r = await loadResolver({ pages: wardrobe(), failFirst: { 9: 99 } })(TITLE);
  assert.strictEqual(r.reason, 'wardrobe_read_incomplete');
});

test('when the lamp IS listed (comma and ampersand in the title) its id is found from the API', async () => {
  const r = await loadResolver({ pages: wardrobe({ id: 10220599999, title: TITLE }) })(TITLE);
  assert.deepStrictEqual([r.id, r.reason, r.source], ['10220599999', null, 'api']);
});
