/**
 * Bulk lot packs (ADR-136 Addendum E, roadmap #659): the pack price preview, input parsing, pack wording and copy lint.
 * The golden table below is the SAME table as packages/backend/src/__tests__/bulkLotPacks.test.ts (PACK_GOLDEN). If the two ever
 * disagree, the server is right and this preview is the one to fix.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BULK_COPY,
  BULK_ERROR_COPY,
  MAX_PACKS_PER_LINE,
  PACK_SIZE_MAX,
  PACK_SIZE_MIN,
  PACK_SIZE_PRESETS,
  allBulkCopy,
  cartLabelForPack,
  formatCentsLabel,
  lotHasPackOffer,
  newPackClientToken,
  packLineText,
  packNameLabel,
  packOfferText,
  packPriceCentsPreview,
  packTotalCents,
  packsAvailablePreview,
  packsLeftText,
  packSampleCopy,
  parsePackCountInput,
  parsePackSizeInput,
} from '../bulkLot';

// [pack size in cards, price per 1,000 in cents, expected pack price in cents]
const PACK_GOLDEN: ReadonlyArray<readonly [number, number, number]> = [
  [100, 800, 80],
  [250, 800, 200],
  [500, 800, 400],
  [1000, 800, 800],
  [2500, 800, 2000],
  [5000, 800, 4000],
  [333, 750, 250],
  [1000, 750, 750],
  [4999, 750, 3749],
  [100, 99, 10],
  [250, 99, 25],
  [101, 333, 34],
  [100, 5, 1],
  [100, 4, 0],
];

const PACK_CODES = [
  'BULK_PACK_INVALID', 'BULK_PACK_COUNT', 'BULK_PACK_ONLY', 'BULK_NOT_PACK', 'BULK_PACK_LOCKED', 'BULK_PACK_TOO_PRICEY',
  'BULK_PACK_PICKUP_ONLY', 'BULK_PACK_NO_DISCOUNT', 'BULK_PACK_TOO_CHEAP', 'BULK_PACK_CART_UNSUPPORTED', 'BULK_PACK_RETRY_TOKEN',
  'BULK_PACK_DUPLICATE_PAYMENT', 'BULK_RECORD_FAILED',
];

test('pack price preview matches the backend golden table', () => {
  for (const [size, perThousandCents, cents] of PACK_GOLDEN) {
    const expected = cents > 0 ? cents : null;
    assert.equal(packPriceCentsPreview(size, perThousandCents / 100), expected, `${size} cards at ${perThousandCents} cents per 1,000`);
  }
});

test('pack price preview is null for sizes and prices it cannot use', () => {
  assert.equal(packPriceCentsPreview(99, 8), null);
  assert.equal(packPriceCentsPreview(5001, 8), null);
  assert.equal(packPriceCentsPreview(1000.5, 8), null);
  assert.equal(packPriceCentsPreview(1000, 0), null);
  assert.equal(packPriceCentsPreview(1000, -1), null);
  assert.equal(packPriceCentsPreview(1000, Number.NaN), null);
  assert.equal(packPriceCentsPreview(1000, Number.POSITIVE_INFINITY), null);
});

test('pack price preview refuses a pack over the $99,999.99 ceiling', () => {
  assert.equal(packPriceCentsPreview(5000, 25000), null);
});

test('parsePackSizeInput accepts 100 to 5,000 with commas and rejects the rest', () => {
  assert.equal(parsePackSizeInput('100'), 100);
  assert.equal(parsePackSizeInput('1,000'), 1000);
  assert.equal(parsePackSizeInput(' 5000 '), 5000);
  for (const bad of ['', '99', '5001', '0', '-100', '1.5', '1e3', 'abc', '1000 cards']) {
    assert.equal(parsePackSizeInput(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('parsePackCountInput accepts 1 to 50 and rejects the rest', () => {
  assert.equal(parsePackCountInput('1'), 1);
  assert.equal(parsePackCountInput(' 50 '), 50);
  for (const bad of ['', '0', '51', '-1', '1.5', 'two', '1e1', '010x']) {
    assert.equal(parsePackCountInput(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('pack limits and presets are inside the allowed range', () => {
  assert.equal(PACK_SIZE_MIN, 100);
  assert.equal(PACK_SIZE_MAX, 5000);
  assert.equal(MAX_PACKS_PER_LINE, 50);
  for (const p of PACK_SIZE_PRESETS) assert.ok(p >= PACK_SIZE_MIN && p <= PACK_SIZE_MAX, `preset ${p}`);
});

test('packsAvailablePreview is whole packs only', () => {
  assert.equal(packsAvailablePreview(4500, 1000), 4);
  assert.equal(packsAvailablePreview(999, 1000), 0);
  assert.equal(packsAvailablePreview(0, 1000), 0);
  assert.equal(packsAvailablePreview(5000, 0), 0);
});

test('packTotalCents is N times the server price for one pack', () => {
  assert.equal(packTotalCents(3, 34), 102);
  assert.equal(packTotalCents(1, 800), 800);
  assert.equal(packTotalCents(0, 800), 0);
  assert.equal(packTotalCents(2, 0), 0);
  assert.equal(packTotalCents(1.5, 800), 0);
});

test('pack wording reads plainly', () => {
  assert.equal(packNameLabel(1000), '1,000-card pack');
  assert.equal(formatCentsLabel(800), '$8.00');
  assert.equal(packOfferText(1000, 800), '1,000-card pack, $8.00');
  assert.equal(packsLeftText(0), 'No packs left');
  assert.equal(packsLeftText(1), '1 pack available');
  assert.equal(packsLeftText(4), '4 packs available');
  assert.equal(packLineText(1, 1000), '1 pack of 1,000 cards');
  assert.equal(packLineText(3, 250), '3 packs of 250 cards');
  assert.equal(cartLabelForPack('Commons', 2, 1000), 'Commons (2 packs of 1,000 cards)');
});

test('lotHasPackOffer needs a size, a price and a pack on sale', () => {
  assert.equal(lotHasPackOffer({ packSize: 1000, packCents: 800, packAvailable: true }), true);
  assert.equal(lotHasPackOffer({ packSize: 1000, packCents: 800, packAvailable: false }), false);
  assert.equal(lotHasPackOffer({ packSize: null, packCents: null, packAvailable: false }), false);
  assert.equal(lotHasPackOffer({ packSize: 1000, packCents: null, packAvailable: true }), false);
  assert.equal(lotHasPackOffer({}), false);
});

test('the retry token is 8 to 100 characters and different each time', () => {
  const a = newPackClientToken();
  const b = newPackClientToken();
  assert.ok(a.length >= 8 && a.length <= 100, a);
  assert.notEqual(a, b);
});

test('every pack error code has plain wording that ends in a full stop', () => {
  for (const code of PACK_CODES) {
    const text = BULK_ERROR_COPY[code];
    assert.ok(text, `missing wording for ${code}`);
    assert.ok(/[.]$/.test(text), `${code} wording must end with a full stop`);
  }
});

test('copy lint over every pack string: no "AI", no "estate sale", no dashes, no placeholders', () => {
  const all = [...allBulkCopy(), ...packSampleCopy(), ...Object.values(BULK_COPY)];
  assert.ok(all.length > 100, 'expected the full set of strings');
  for (const text of all) {
    assert.equal(typeof text, 'string');
    assert.ok(text.trim().length > 0, 'empty string in copy');
    assert.equal(text, text.trim(), `stray whitespace: "${text}"`);
    assert.ok(!/\bAI\b/.test(text), `"AI" in: ${text}`);
    assert.ok(!/estate\s*sale/i.test(text), `"estate sale" in: ${text}`);
    assert.ok(!text.includes('—'), `em dash in: ${text}`);
    assert.ok(!text.includes('–'), `en dash in: ${text}`);
    assert.ok(!/ -- /.test(text), `double hyphen dash in: ${text}`);
    assert.ok(!/lorem|todo|tbd|\[[^\]]*\]|\{\{|<[a-z/][^>]*>/i.test(text), `placeholder-like text in: ${text}`);
  }
});
