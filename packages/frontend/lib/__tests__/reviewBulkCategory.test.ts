/**
 * Review page bulk category helpers (Wave 3, F3).
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planBulkCategoryOps,
  bulkCategoryFailureMessage,
  bulkCategoryPartialItemsMessage,
} from '../reviewBulkCategory';

test('plan: category first, then eBay id, then eBay name', () => {
  assert.deepEqual(
    planBulkCategoryOps({ l1CategoryName: 'Collectibles', leafCategoryId: '12345', leafCategoryName: 'Cards' }),
    [
      { operation: 'category', value: 'Collectibles' },
      { operation: 'ebayCategoryId', value: '12345' },
      { operation: 'ebayCategoryName', value: 'Cards' },
    ],
  );
});

test('plan: values are trimmed', () => {
  assert.deepEqual(
    planBulkCategoryOps({ l1CategoryName: ' Art ', leafCategoryId: ' 99 ', leafCategoryName: ' Prints ' }),
    [
      { operation: 'category', value: 'Art' },
      { operation: 'ebayCategoryId', value: '99' },
      { operation: 'ebayCategoryName', value: 'Prints' },
    ],
  );
});

test('plan: the eBay id must be 1 to 10 digits (backend rule), otherwise it is not sent', () => {
  const ops = (id: string) =>
    planBulkCategoryOps({ l1CategoryName: 'Art', leafCategoryId: id, leafCategoryName: 'Prints' }).map((o) => o.operation);
  assert.deepEqual(ops('1234567890'), ['category', 'ebayCategoryId', 'ebayCategoryName']);
  assert.deepEqual(ops('12345678901'), ['category', 'ebayCategoryName']);
  assert.deepEqual(ops('12a'), ['category', 'ebayCategoryName']);
  assert.deepEqual(ops(''), ['category', 'ebayCategoryName']);
});

test('plan: a cleared picker plans nothing', () => {
  assert.deepEqual(planBulkCategoryOps({ l1CategoryName: '', leafCategoryId: '', leafCategoryName: '' }), []);
  assert.deepEqual(planBulkCategoryOps({ l1CategoryName: '  ', leafCategoryId: ' ', leafCategoryName: ' ' }), []);
});

test('plan: an over-long or control-character eBay name is not sent', () => {
  const longName = 'x'.repeat(201);
  assert.deepEqual(
    planBulkCategoryOps({ l1CategoryName: 'Art', leafCategoryId: '1', leafCategoryName: longName }).map((o) => o.operation),
    ['category', 'ebayCategoryId'],
  );
  assert.deepEqual(
    planBulkCategoryOps({ l1CategoryName: 'Art', leafCategoryId: '1', leafCategoryName: 'bad\u0007name' }).map((o) => o.operation),
    ['category', 'ebayCategoryId'],
  );
  assert.equal(
    planBulkCategoryOps({ l1CategoryName: 'Art', leafCategoryId: '1', leafCategoryName: 'x'.repeat(200) }).length,
    3,
  );
});

test('plan: one operation per field, never duplicated', () => {
  const ops = planBulkCategoryOps({ l1CategoryName: 'Art', leafCategoryId: '1', leafCategoryName: 'Prints' });
  assert.equal(new Set(ops.map((o) => o.operation)).size, ops.length);
});

test('failure message: category rejected first leaves everything unchanged', () => {
  const msg = bulkCategoryFailureMessage(
    'category',
    [],
    ['category', 'ebayCategoryId', 'ebayCategoryName'],
    'Invalid category. Allowed values: furniture, decor',
  );
  assert.equal(
    msg,
    'No categories were changed. Invalid category. Allowed values: furniture, decor. You can still set the category on each item.',
  );
});

test('failure message: a later step failing lists what was and was not applied', () => {
  const msg = bulkCategoryFailureMessage(
    'ebayCategoryId',
    ['category'],
    ['category', 'ebayCategoryId', 'ebayCategoryName'],
    'ebayCategoryId must be 1 to 10 digits.',
  );
  assert.equal(
    msg,
    'Only part of the category change was applied. Changed: category. Not changed: eBay category ID, eBay category name. ebayCategoryId must be 1 to 10 digits.',
  );
});

test('failure message: a missing server message gets a plain fallback', () => {
  assert.equal(
    bulkCategoryFailureMessage('ebayCategoryName', [], ['ebayCategoryName'], undefined),
    'No categories were changed. The update failed.',
  );
  assert.equal(
    bulkCategoryFailureMessage('ebayCategoryName', [], ['ebayCategoryName'], '   '),
    'No categories were changed. The update failed.',
  );
});

test('partial items message: null when none failed, otherwise counts and the first reason', () => {
  assert.equal(bulkCategoryPartialItemsMessage({ failed: [] }, 3), null);
  assert.equal(bulkCategoryPartialItemsMessage({}, 3), null);
  assert.equal(bulkCategoryPartialItemsMessage(undefined, 3), null);
  assert.equal(
    bulkCategoryPartialItemsMessage({ failed: [{ itemId: 'x', reason: 'Item has been sold and cannot be modified.' }] }, 3),
    'Category updated for 3 items. 1 item was not changed: Item has been sold and cannot be modified.',
  );
  assert.equal(
    bulkCategoryPartialItemsMessage({ failed: [{ itemId: 'x' }, { itemId: 'y' }] }, 1),
    'Category updated for 1 item. 2 items were not changed: Not changed',
  );
});

test('user-facing strings have no em dash, no "AI", no banned phrases', () => {
  const strings = [
    bulkCategoryFailureMessage('category', [], ['category'], 'x'),
    bulkCategoryFailureMessage('ebayCategoryId', ['category'], ['category', 'ebayCategoryId'], 'x'),
    bulkCategoryPartialItemsMessage({ failed: [{ itemId: 'x', reason: 'r' }] }, 2) as string,
  ];
  for (const s of strings) {
    assert.ok(!/[—–]/.test(s), s);
    assert.ok(!/\bAI\b/.test(s), s);
    assert.ok(!/garage sale|estate sale/i.test(s), s);
  }
});
