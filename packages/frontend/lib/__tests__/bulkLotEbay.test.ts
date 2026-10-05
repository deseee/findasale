/**
 * bulkLotEbay (ADR-136 Addendum C, roadmap #659): input parsing, size lock, header reading, error wording and copy lint.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EBAY_BUNDLE_ERROR_COPY,
  allBundleCopy,
  describeBundleError,
  isBundleSizeLocked,
  parseBundleSize,
  parseMeasure,
  parsePercent,
  readBundleView,
  readSkippedLotCount,
} from '../bulkLotEbay';

const BACKEND_CODES = [
  'BUNDLE_DISABLED', 'BUNDLE_VALIDATION', 'BUNDLE_NOT_FOUND', 'BUNDLE_NOT_LOT', 'BUNDLE_NOT_ENABLED', 'BUNDLE_BELOW_ONE',
  'BUNDLE_PRICE_INVALID', 'BUNDLE_PRICE_TOO_HIGH', 'BUNDLE_PACKAGE_UNCONFIRMED', 'BUNDLE_NOT_CONNECTED', 'BUNDLE_EBAY_FAILED',
  'RATE_LIMITED', 'SERVER_ERROR',
];

test('copy lint: no "AI", no "estate sale", no em dashes, no placeholder text', () => {
  const all = allBundleCopy();
  assert.ok(all.length > 30, 'expected the full set of strings');
  for (const text of all) {
    assert.ok(text.trim().length > 0, 'empty string in copy');
    assert.equal(text, text.trim(), `stray whitespace: "${text}"`);
    assert.ok(!/\bAI\b/.test(text), `"AI" in: ${text}`);
    assert.ok(!/estate\s*sale/i.test(text), `"estate sale" in: ${text}`);
    assert.ok(!text.includes('—'), `em dash in: ${text}`);
    assert.ok(!text.includes('–'), `en dash in: ${text}`);
    assert.ok(!/ -- /.test(text), `double hyphen dash in: ${text}`);
    assert.ok(!/lorem|todo|tbd|\{\{|<[a-z/][^>]*>/i.test(text), `placeholder-like text in: ${text}`);
  }
});

test('every backend code has plain wording that ends in a full stop', () => {
  for (const code of BACKEND_CODES) {
    const text = EBAY_BUNDLE_ERROR_COPY[code];
    assert.ok(text, `missing wording for ${code}`);
    assert.ok(/[.]$/.test(text), `${code} wording must end with a full stop`);
  }
});

test('describeBundleError prefers the server text, then the code, then a generic line', () => {
  assert.equal(describeBundleError('BUNDLE_NOT_LOT', 'Server words.'), 'Server words.');
  assert.equal(describeBundleError('BUNDLE_NOT_LOT', ''), EBAY_BUNDLE_ERROR_COPY.BUNDLE_NOT_LOT);
  assert.equal(describeBundleError('NOPE', null), 'Something went wrong. Try again in a moment.');
  assert.equal(describeBundleError(null, undefined), 'Something went wrong. Try again in a moment.');
});

test('bundle size parsing accepts commas and spaces and enforces the server limits', () => {
  assert.equal(parseBundleSize('1,000', 100, 5000), 1000);
  assert.equal(parseBundleSize(' 500 ', 100, 5000), 500);
  assert.equal(parseBundleSize('99', 100, 5000), null);
  assert.equal(parseBundleSize('5001', 100, 5000), null);
  assert.equal(parseBundleSize('12.5', 100, 5000), null);
  assert.equal(parseBundleSize('', 100, 5000), null);
  assert.equal(parseBundleSize('abc', 100, 5000), null);
});

test('percent parsing: blank is 0, negative is a discount, bounds are enforced', () => {
  assert.equal(parsePercent('', -50, 100), 0);
  assert.equal(parsePercent('-10', -50, 100), -10);
  assert.equal(parsePercent('12.5', -50, 100), 12.5);
  assert.equal(parsePercent('-50.01', -50, 100), null);
  assert.equal(parsePercent('100.01', -50, 100), null);
  assert.equal(parsePercent('1.234', -50, 100), null);
  assert.equal(parsePercent('ten', -50, 100), null);
});

test('measure parsing needs a positive number inside the limits', () => {
  assert.equal(parseMeasure('4', 0.1, 100), 4);
  assert.equal(parseMeasure('15.38', 0.1, 100), 15.38);
  assert.equal(parseMeasure('0', 0.1, 100), null);
  assert.equal(parseMeasure('-3', 0.1, 100), null);
  assert.equal(parseMeasure('101', 0.1, 100), null);
});

test('the size lock follows the server rule', () => {
  const base = { hasOffer: true, isLive: true, endedForStock: false, listedQty: 3, listedPriceCents: 1000, lastSyncAt: null, lastSyncStatus: null, lastSyncError: null, nextAction: 'NONE', ebayUrl: null };
  assert.equal(isBundleSizeLocked({ listing: base }), true);
  assert.equal(isBundleSizeLocked({ listing: { ...base, hasOffer: false } }), false);
  assert.equal(isBundleSizeLocked({ listing: { ...base, endedForStock: true } }), false);
  assert.equal(isBundleSizeLocked({ listing: { ...base, listedQty: null } }), false);
  assert.equal(isBundleSizeLocked({ listing: { ...base, listedQty: 0 } }), true);
});

test('the skipped lot header is read from a plain object, any casing, and from a get() style header bag', () => {
  assert.equal(readSkippedLotCount({ 'x-skipped-bulk-lots': '2' }), 2);
  assert.equal(readSkippedLotCount({ 'X-Skipped-Bulk-Lots': '1' }), 1);
  assert.equal(readSkippedLotCount({ get: (n: string) => (n === 'x-skipped-bulk-lots' ? '4' : undefined) }), 4);
  assert.equal(readSkippedLotCount({ 'x-skipped-bulk-lots': '0' }), 0);
  assert.equal(readSkippedLotCount({ 'x-skipped-bulk-lots': 'many' }), 0);
  assert.equal(readSkippedLotCount({}), 0);
  assert.equal(readSkippedLotCount(null), 0);
});

test('readBundleView rejects a body that is not a view', () => {
  assert.equal(readBundleView(null), null);
  assert.equal(readBundleView({ data: { itemId: 'x' } }), null);
  const view = { itemId: 'x', bundleSize: 500, stock: {}, listing: {}, package: {}, limits: {} };
  assert.equal(readBundleView({ data: view })?.itemId, 'x');
});
