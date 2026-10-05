/**
 * Review page selection helpers (Smart Review Queue bulk actions).
 * Run: npx tsx --test lib/__tests__/reviewSelection.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toggleSelection,
  selectAllVisible,
  pruneSelection,
  allVisibleSelected,
  selectedCountText,
  itemsCountText,
  parseBulkPriceInput,
  bulkPriceButtonText,
  bulkCategoryButtonText,
} from '../reviewSelection';

test('toggleSelection adds an absent id and removes a present one without mutating the input', () => {
  const start = new Set(['a']);
  const added = toggleSelection(start, 'b');
  assert.deepEqual(Array.from(added).sort(), ['a', 'b']);
  assert.deepEqual(Array.from(start), ['a']);
  const removed = toggleSelection(added, 'a');
  assert.deepEqual(Array.from(removed), ['b']);
  assert.notEqual(removed, added);
});

test('selectAllVisible selects exactly the visible ids', () => {
  assert.deepEqual(Array.from(selectAllVisible(['a', 'b', 'c'])), ['a', 'b', 'c']);
  assert.equal(selectAllVisible([]).size, 0);
});

test('selectAllVisible replaces the selection (a stale id is not kept)', () => {
  const all = selectAllVisible(['a', 'b']);
  assert.equal(all.has('stale'), false);
});

test('pruneSelection drops ids that left the queue', () => {
  const pruned = pruneSelection(new Set(['a', 'b', 'c']), ['a', 'c']);
  assert.deepEqual(Array.from(pruned).sort(), ['a', 'c']);
});

test('pruneSelection returns the same Set when nothing was dropped', () => {
  const prev = new Set(['a', 'b']);
  assert.equal(pruneSelection(prev, ['a', 'b', 'c']), prev);
  const empty = new Set<string>();
  assert.equal(pruneSelection(empty, []), empty);
});

test('pruneSelection with nothing visible empties the selection', () => {
  assert.equal(pruneSelection(new Set(['a']), []).size, 0);
});

test('allVisibleSelected needs at least one visible id and all of them selected', () => {
  assert.equal(allVisibleSelected(new Set(['a', 'b']), ['a', 'b']), true);
  assert.equal(allVisibleSelected(new Set(['a']), ['a', 'b']), false);
  assert.equal(allVisibleSelected(new Set(), []), false);
  assert.equal(allVisibleSelected(new Set(['a', 'x']), ['a']), true);
});

test('count text', () => {
  assert.equal(selectedCountText(0), '0 selected');
  assert.equal(selectedCountText(3), '3 selected');
  assert.equal(itemsCountText(1), '1 item');
  assert.equal(itemsCountText(2), '2 items');
  assert.equal(itemsCountText(0), '0 items');
});

test('parseBulkPriceInput accepts a positive amount and rounds to cents', () => {
  assert.equal(parseBulkPriceInput('12.5'), 12.5);
  assert.equal(parseBulkPriceInput(' 7 '), 7);
  assert.equal(parseBulkPriceInput('1.999'), 2);
  assert.equal(parseBulkPriceInput('0.99'), 0.99);
});

test('parseBulkPriceInput rejects empty, zero, negative, non-numeric and values that round to zero', () => {
  for (const bad of ['', '   ', '0', '0.00', '-5', 'abc', '1e999', 'Infinity', '0.004']) {
    assert.equal(parseBulkPriceInput(bad), null, `"${bad}" should be rejected`);
  }
});

test('button text names the amount and the number of items', () => {
  assert.equal(bulkPriceButtonText(12.5, 3), 'Set price to $12.50 on 3 items');
  assert.equal(bulkPriceButtonText(5, 1), 'Set price to $5.00 on 1 item');
  assert.equal(bulkPriceButtonText(null, 2), 'Set price on 2 items');
  assert.equal(bulkCategoryButtonText(1), 'Apply category to 1 item');
  assert.equal(bulkCategoryButtonText(4), 'Apply category to 4 items');
});
