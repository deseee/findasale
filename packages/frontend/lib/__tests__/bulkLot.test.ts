/**
 * bulkLot (ADR-136, roadmap #659): input parsing, formatting, error wording and copy lint for the bulk lot screens.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BULK_COPY,
  BULK_ERROR_COPY,
  MAX_LOT_CARDS,
  allBulkCopy,
  cartLabelForLot,
  describeBulkError,
  formatCardCount,
  parseCardCount,
  parseLotTotal,
  parsePricePerThousand,
  readBulkStatus,
} from '../bulkLot';

// Every code the backend can send (services/bulkLot/bulkLotService.ts BulkLotErrorCode, plus the route-level codes).
const BACKEND_CODES = [
  'BULK_DISABLED', 'BULK_VALIDATION', 'BULK_NOT_FOUND', 'BULK_NOT_LOT', 'BULK_ALREADY_LOT', 'BULK_NOT_ELIGIBLE', 'BULK_HAS_SALES',
  'BULK_TOTAL_BELOW_SOLD', 'BULK_QUANTITY_REQUIRED', 'BULK_CHECK_FAILED', 'BULK_CHANNEL_UNSUPPORTED', 'BAD_QUANTITY', 'BAD_PRICE',
  'QUANTITY_TOO_SMALL', 'NOT_AVAILABLE', 'INSUFFICIENT_STOCK', 'PRICE_CHANGED', 'NOT_YOUR_SALE', 'SALE_NOT_FOUND', 'RATE_LIMITED',
  'SERVER_ERROR',
];

test('copy lint: no "AI", no "estate sale", no em dashes, no placeholder text', () => {
  const all = allBulkCopy();
  assert.ok(all.length > 60, 'expected the full set of strings');
  for (const text of all) {
    assert.equal(typeof text, 'string');
    assert.ok(text.trim().length > 0, 'empty string in copy');
    assert.equal(text, text.trim(), `stray whitespace: "${text}"`);
    assert.ok(!/\bAI\b/.test(text), `"AI" in: ${text}`);
    assert.ok(!/artificial intelligence/i.test(text), `automation wording in: ${text}`);
    assert.ok(!/estate\s*sale/i.test(text), `"estate sale" in: ${text}`);
    assert.ok(!text.includes('—'), `em dash in: ${text}`);
    assert.ok(!text.includes('–'), `en dash in: ${text}`);
    assert.ok(!/ -- /.test(text), `double hyphen dash in: ${text}`);
    assert.ok(!/lorem|todo|tbd|\[[^\]]*\]|\{\{|<[a-z/][^>]*>/i.test(text), `placeholder-like text in: ${text}`);
  }
});

test('every backend error code has plain wording that ends in a full stop', () => {
  for (const code of BACKEND_CODES) {
    const text = BULK_ERROR_COPY[code];
    assert.ok(text, `missing wording for ${code}`);
    assert.ok(/[.]$/.test(text), `${code} wording must end with a full stop`);
  }
});

test('parseCardCount accepts whole numbers with commas and spaces', () => {
  assert.equal(parseCardCount('1500'), 1500);
  assert.equal(parseCardCount('1,500'), 1500);
  assert.equal(parseCardCount(' 4 200 '), 4200);
  assert.equal(parseCardCount('1'), 1);
  assert.equal(parseCardCount('1000000'), 1_000_000);
});

test('parseCardCount rejects zero, negatives, decimals, exponents, words and out-of-range values', () => {
  for (const bad of ['', ' ', '0', '-5', '1.5', '1e3', 'abc', '12abc', '1000001', '9999999999', '+5', '0x10']) {
    assert.equal(parseCardCount(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('parseLotTotal needs at least 2 cards', () => {
  assert.equal(parseLotTotal('1'), null);
  assert.equal(parseLotTotal('2'), 2);
  assert.equal(parseLotTotal('4,200'), 4200);
  assert.equal(parseLotTotal(String(MAX_LOT_CARDS + 1)), null);
});

test('parsePricePerThousand accepts dollars with up to 2 decimals', () => {
  assert.equal(parsePricePerThousand('8'), 8);
  assert.equal(parsePricePerThousand('8.5'), 8.5);
  assert.equal(parsePricePerThousand('$8.00'), 8);
  assert.equal(parsePricePerThousand('0.01'), 0.01);
  assert.equal(parsePricePerThousand('1,250.25'), 1250.25);
});

test('parsePricePerThousand rejects zero, negatives, extra decimals and junk', () => {
  for (const bad of ['', '0', '0.00', '-1', '8.123', 'abc', '8.', '.5', '1e2', '100001', '8 dollars']) {
    assert.equal(parsePricePerThousand(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('formatCardCount groups thousands with commas', () => {
  assert.equal(formatCardCount(0), '0');
  assert.equal(formatCardCount(999), '999');
  assert.equal(formatCardCount(1000), '1,000');
  assert.equal(formatCardCount(4200), '4,200');
  assert.equal(formatCardCount(1_000_000), '1,000,000');
  assert.equal(formatCardCount(Number.NaN), '0');
});

test('cartLabelForLot names the quantity', () => {
  assert.equal(cartLabelForLot('Commons and uncommons', 1500), 'Commons and uncommons (1,500 cards)');
});

test('readBulkStatus treats anything unexpected as off', () => {
  assert.deepEqual(readBulkStatus(null), { enabled: false, vocabulary: null });
  assert.deepEqual(readBulkStatus({}), { enabled: false, vocabulary: null });
  assert.deepEqual(readBulkStatus({ data: { enabled: 'true' } }), { enabled: false, vocabulary: null });
  const on = readBulkStatus({
    data: { enabled: true, vocabulary: { kinds: ['BULK_COMMON'], labels: { BULK_COMMON: 'Bulk commons' }, defaultKind: 'BULK_COMMON', defaultGame: 'MTG' } },
  });
  assert.equal(on.enabled, true);
  assert.equal(on.vocabulary?.defaultKind, 'BULK_COMMON');
  assert.equal(on.vocabulary?.labels.BULK_COMMON, 'Bulk commons');
});

test('describeBulkError prefers the server text, then the code wording, then a generic line', () => {
  assert.equal(describeBulkError(new Error('boom')).message, BULK_COPY.errorNetwork);
  const withText = describeBulkError({ response: { status: 409, data: { error: 'Custom text.', code: 'INSUFFICIENT_STOCK' } } });
  assert.equal(withText.message, 'Custom text.');
  assert.equal(withText.code, 'INSUFFICIENT_STOCK');
  const codeOnly = describeBulkError({ response: { status: 409, data: { code: 'PRICE_CHANGED' } } });
  assert.equal(codeOnly.message, BULK_ERROR_COPY.PRICE_CHANGED);
  const cashStyle = describeBulkError({ response: { status: 400, data: { message: 'Insufficient cash received' } } });
  assert.equal(cashStyle.message, 'Insufficient cash received');
  const unknown = describeBulkError({ response: { status: 500, data: {} } });
  assert.equal(unknown.message, BULK_COPY.errorGeneric);
});
