/**
 * Review page price-input helpers (Wave 3, F3): bulk price re-seed and typed-price readiness.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reseedPriceInputs,
  bulkPriceWrittenIds,
  bulkPriceSkippedMessage,
  typedPriceForReadiness,
} from '../reviewPriceInputs';
import { computeItemReadiness, type ReadinessItem } from '../itemReadiness';

test('reseedPriceInputs: affected ids get the new price, others and the input Map are untouched', () => {
  const prev = new Map([
    ['a', '10'],
    ['b', '20'],
    ['c', '30'],
  ]);
  const next = reseedPriceInputs(prev, ['a', 'c'], 12.5);
  assert.deepEqual(Array.from(next.entries()), [['a', '12.5'], ['b', '20'], ['c', '12.5']]);
  assert.deepEqual(Array.from(prev.entries()), [['a', '10'], ['b', '20'], ['c', '30']]);
  assert.notStrictEqual(next, prev);
});

test('reseedPriceInputs: an id with no entry yet is added', () => {
  const next = reseedPriceInputs(new Map(), ['x'], 5);
  assert.equal(next.get('x'), '5');
});

test('reseedPriceInputs: a zero or invalid price empties the input so Approve asks for a price', () => {
  const prev = new Map([['a', '10']]);
  assert.equal(reseedPriceInputs(prev, ['a'], 0).get('a'), '');
  assert.equal(reseedPriceInputs(prev, ['a'], -3).get('a'), '');
  assert.equal(reseedPriceInputs(prev, ['a'], NaN).get('a'), '');
});

test('reseedPriceInputs: a later Approve reads the bulk price, not the stale seed', () => {
  // Seed from the saved price, then a bulk price of 7.99 lands.
  const seeded = new Map([['a', '25']]);
  const after = reseedPriceInputs(seeded, ['a'], 7.99);
  const approveValue = parseFloat(after.get('a') ?? '');
  assert.equal(approveValue, 7.99);
});

test('bulkPriceWrittenIds: uses the response succeeded list, limited to requested ids', () => {
  assert.deepEqual(
    bulkPriceWrittenIds({ succeeded: ['a', 'b', 'zzz'] }, 207, ['a', 'b', 'c']),
    ['a', 'b'],
  );
  // eBay-floor skipped items are not in succeeded, so they are not re-seeded.
  assert.deepEqual(
    bulkPriceWrittenIds({ succeeded: ['a'], skipped: [{ itemId: 'b', reason: 'eBay minimum price is $0.99' }] }, 207, ['a', 'b']),
    ['a'],
  );
  assert.deepEqual(bulkPriceWrittenIds({ succeeded: [] }, 200, ['a']), []);
});

test('bulkPriceWrittenIds: without a succeeded list only a plain 200 counts as all written', () => {
  assert.deepEqual(bulkPriceWrittenIds({}, 200, ['a', 'b']), ['a', 'b']);
  assert.deepEqual(bulkPriceWrittenIds(undefined, 200, ['a']), ['a']);
  assert.deepEqual(bulkPriceWrittenIds({}, 207, ['a', 'b']), []);
  assert.deepEqual(bulkPriceWrittenIds(null, undefined, ['a']), []);
});

test('bulkPriceSkippedMessage: wording and null when nothing was skipped', () => {
  assert.equal(bulkPriceSkippedMessage({}), null);
  assert.equal(bulkPriceSkippedMessage({ skipped: [] }), null);
  assert.equal(bulkPriceSkippedMessage(undefined), null);
  assert.equal(
    bulkPriceSkippedMessage({ skipped: [{ itemId: 'b', reason: 'eBay minimum price is $0.99' }] }),
    '1 item kept the old price. eBay minimum price is $0.99.',
  );
  assert.equal(
    bulkPriceSkippedMessage({
      skipped: [
        { itemId: 'b', reason: 'eBay minimum price is $0.99' },
        { itemId: 'c', reason: 'eBay minimum price is $0.99' },
      ],
    }),
    '2 items kept the old price. eBay minimum price is $0.99.',
  );
  const msg = bulkPriceSkippedMessage({ skipped: [{ itemId: 'b' }] }) as string;
  assert.ok(!/[—–]/.test(msg) && !/\bAI\b/.test(msg));
});

test('typedPriceForReadiness: entry present (even empty) counts, no entry means undefined', () => {
  const m = new Map([['a', '12'], ['b', '']]);
  assert.equal(typedPriceForReadiness(m, 'a'), '12');
  assert.equal(typedPriceForReadiness(m, 'b'), '');
  assert.equal(typedPriceForReadiness(m, 'zzz'), undefined);
});

const fullItem = (over: Partial<ReadinessItem> = {}): ReadinessItem => ({
  title: 'Brass lamp',
  price: 30,
  photoUrls: ['https://example.com/a.jpg'],
  category: 'Home',
  condition: 'USED',
  description: 'Works well',
  packageWeightOz: null,
  ...over,
});

test('readiness follows the typed price (the review page wiring)', () => {
  const item = fullItem({ price: 30 });
  const edit = { price: 30 };
  // Seeded and unchanged: green.
  assert.equal(computeItemReadiness(item, edit, typedPriceForReadiness(new Map([['a', '30']]), 'a'), false), 'green');
  // Organizer cleared the field: red, even though the saved price is 30.
  assert.equal(computeItemReadiness(item, edit, typedPriceForReadiness(new Map([['a', '']]), 'a'), false), 'red');
  // Organizer typed 0 or junk: red.
  assert.equal(computeItemReadiness(item, edit, typedPriceForReadiness(new Map([['a', '0']]), 'a'), false), 'red');
  assert.equal(computeItemReadiness(item, edit, typedPriceForReadiness(new Map([['a', 'abc']]), 'a'), false), 'red');
  // Saved price is empty but the organizer typed one: green.
  assert.equal(
    computeItemReadiness(fullItem({ price: null }), { price: 0 }, typedPriceForReadiness(new Map([['a', '12.5']]), 'a'), false),
    'green',
  );
  // Before the seeding effect has run (no entry): falls back to the saved price, no red flash.
  assert.equal(computeItemReadiness(item, edit, typedPriceForReadiness(new Map(), 'a'), false), 'green');
  // Other chips unchanged: missing description is yellow, weight plus eBay is blue.
  assert.equal(computeItemReadiness(fullItem({ description: '' }), { description: '' }, '30', false), 'yellow');
  assert.equal(computeItemReadiness(fullItem({ packageWeightOz: 12 }), {}, '30', true), 'blue');
});
