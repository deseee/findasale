/**
 * Review page re-sync after the All details sheet (Wave 3 round 2, F3), plus the grade picker rules.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceInputFromServer, typedPriceDiffersFromSaved, mergeEditStateFromServer } from '../reviewSheetSync';
import { gradePickerFor } from '../reviewGradePicker';

test('priceInputFromServer: positive numbers become text, everything else is empty', () => {
  assert.equal(priceInputFromServer(12.5), '12.5');
  assert.equal(priceInputFromServer('7.99'), '7.99');
  assert.equal(priceInputFromServer(0), '');
  assert.equal(priceInputFromServer(null), '');
  assert.equal(priceInputFromServer(undefined), '');
  assert.equal(priceInputFromServer(NaN), '');
  assert.equal(priceInputFromServer(-3), '');
});

test('typedPriceDiffersFromSaved', () => {
  assert.equal(typedPriceDiffersFromSaved('12.5', 12.5), false);
  assert.equal(typedPriceDiffersFromSaved('12.50', 12.5), false);
  assert.equal(typedPriceDiffersFromSaved('12.51', 12.5), true);
  assert.equal(typedPriceDiffersFromSaved('', null), false);
  assert.equal(typedPriceDiffersFromSaved(undefined, 0), false);
  assert.equal(typedPriceDiffersFromSaved('', 12), true); // organizer emptied a saved price
  assert.equal(typedPriceDiffersFromSaved('5', null), true); // organizer typed a price, none saved
  assert.equal(typedPriceDiffersFromSaved('abc', null), false);
});

test('mergeEditStateFromServer: server values win except fields with unsaved card edits', () => {
  const fresh = { title: 'Server title', description: 'Server desc', category: 'Art', tags: ['a'] };
  const current = { title: 'My title', description: 'Old desc', category: 'Home', tags: ['x', 'y'] };
  assert.deepEqual(mergeEditStateFromServer(fresh, current, []), fresh);
  assert.deepEqual(mergeEditStateFromServer(fresh, current, ['title', 'tags']), {
    title: 'My title',
    description: 'Server desc',
    category: 'Art',
    tags: ['x', 'y'],
  });
  assert.deepEqual(mergeEditStateFromServer(fresh, undefined, ['title']), fresh);
  assert.deepEqual(mergeEditStateFromServer(fresh, current, ['nope']), fresh);
  assert.equal(fresh.title, 'Server title'); // inputs not mutated
  assert.equal(current.title, 'My title');
});

test('grade picker: used goods show A to D', () => {
  const p = gradePickerFor('USED', 'B');
  assert.equal(p.show, true);
  assert.deepEqual(p.options.map((o) => o.value), ['A', 'B', 'C', 'D']);
  assert.deepEqual(p.options.map((o) => o.label), ['A', 'B', 'C', 'D']);
  assert.equal(p.options[0].title, 'A - Very good');
  assert.equal(p.options[2].title, 'C - Good');
  assert.equal(p.options[3].title, 'D - Acceptable');
});

test('grade picker: S appears as "S (legacy)" only for an item that already has S', () => {
  assert.deepEqual(gradePickerFor('USED', 'S').options.map((o) => o.label), ['A', 'B', 'C', 'D', 'S (legacy)']);
  assert.deepEqual(gradePickerFor('USED', ' s ').options.map((o) => o.value), ['A', 'B', 'C', 'D', 'S']);
  for (const g of [undefined, null, '', 'A', 'D']) {
    assert.ok(!gradePickerFor('USED', g).options.some((o) => o.value === 'S'), String(g));
  }
});

test('grade picker: hidden unless the condition is used (legacy values read through conditionModel)', () => {
  for (const c of ['NEW', 'REFURBISHED', 'PARTS_OR_REPAIR', '', null, undefined, 'A', 'whatever']) {
    const p = gradePickerFor(c as any, 'B');
    assert.equal(p.show, false, String(c));
    assert.deepEqual(p.options, []);
  }
  for (const c of ['used', 'GOOD', 'FAIR', 'LIKE_NEW', 'excellent', 'USED_GOOD', ' Used ']) {
    assert.equal(gradePickerFor(c, '').show, true, c);
  }
});

test('user-facing strings have no em dash, no "AI"', () => {
  const p = gradePickerFor('USED', 'S');
  for (const o of p.options) {
    assert.ok(!/[—–]/.test(o.title + o.label) && !/\bAI\b/.test(o.title + o.label));
  }
});
