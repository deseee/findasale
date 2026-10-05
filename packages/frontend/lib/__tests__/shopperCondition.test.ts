/**
 * shopperCondition: shopper-facing condition wording and filter normalization.
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOPPER_CONDITION_FILTER_OPTIONS,
  SHOPPER_GRADE_WORDS,
  conditionFilterLabel,
  describeShopperCondition,
  normalizeConditionFilterValue,
  shopperConditionText,
} from '../shopperCondition';

test('shoppers are offered exactly the four canonical conditions with the new labels', () => {
  assert.deepEqual(
    SHOPPER_CONDITION_FILTER_OPTIONS.map((o) => [o.value, o.label]),
    [
      ['NEW', 'New'],
      ['USED', 'Used'],
      ['REFURBISHED', 'Refurbished'],
      ['PARTS_OR_REPAIR', 'Parts / Repair'],
    ],
  );
});

test('grade words are plain: A Excellent, B Very good, C Good, D Acceptable', () => {
  assert.deepEqual(SHOPPER_GRADE_WORDS, { A: 'Excellent', B: 'Very good', C: 'Good', D: 'Acceptable' });
});

test('canonical conditions read with the new labels', () => {
  assert.equal(describeShopperCondition('NEW')?.label, 'New');
  assert.equal(describeShopperCondition('USED')?.label, 'Used');
  assert.equal(describeShopperCondition('REFURBISHED')?.label, 'Refurbished');
  assert.equal(describeShopperCondition('PARTS_OR_REPAIR')?.label, 'Parts / Repair');
});

test('nothing to show for an empty condition', () => {
  for (const v of [null, undefined, '', '   ', 5]) assert.equal(describeShopperCondition(v), null);
  assert.equal(shopperConditionText(null, 'A'), '');
});

test('used goods show the grade in plain words when a grade is present', () => {
  assert.equal(describeShopperCondition('USED', 'A')?.text, 'Used - Excellent');
  assert.equal(describeShopperCondition('USED', 'B')?.text, 'Used - Very good');
  assert.equal(describeShopperCondition('USED', 'c')?.text, 'Used - Good');
  assert.equal(describeShopperCondition('USED', ' D ')?.text, 'Used - Acceptable');
  assert.equal(describeShopperCondition('USED', 'B')?.grade, 'B');
  assert.match(describeShopperCondition('USED', 'B')?.description ?? '', /grade B/);
});

test('no grade, or an unrecognized grade, shows the bare condition', () => {
  assert.equal(describeShopperCondition('USED')?.text, 'Used');
  assert.equal(describeShopperCondition('USED', null)?.text, 'Used');
  assert.equal(describeShopperCondition('USED', 'Z')?.text, 'Used');
});

test('the grade is only shown for used goods', () => {
  for (const c of ['NEW', 'REFURBISHED', 'PARTS_OR_REPAIR']) {
    const d = describeShopperCondition(c, 'A');
    assert.equal(d?.grade, null, c);
    assert.equal(d?.gradeWord, null, c);
  }
  assert.equal(describeShopperCondition('NEW', 'S')?.text, 'New'); // eBay imports store NEW with grade S
});

test('legacy values read through the canonical model', () => {
  assert.equal(describeShopperCondition('LIKE_NEW')?.text, 'Used - Excellent'); // legacy LIKE_NEW is Used grade A
  assert.equal(describeShopperCondition('EXCELLENT')?.text, 'Used - Excellent');
  assert.equal(describeShopperCondition('Like New')?.text, 'Used - Excellent');
  assert.equal(describeShopperCondition('GOOD')?.text, 'Used');
  assert.equal(describeShopperCondition('FAIR')?.text, 'Used');
  assert.equal(describeShopperCondition('POOR')?.text, 'Parts / Repair');
  assert.equal(describeShopperCondition('used')?.text, 'Used');
  assert.equal(describeShopperCondition('USED_GOOD')?.text, 'Used');
});

test('a stored grade wins over the hint a legacy value carries; legacy grade S reads as A', () => {
  assert.equal(describeShopperCondition('LIKE_NEW', 'C')?.text, 'Used - Good');
  assert.equal(describeShopperCondition('USED', 'S')?.text, 'Used - Excellent');
  assert.equal(describeShopperCondition('USED', 'S')?.grade, 'A');
});

test('an unrecognized stored value is shown as plain words, never raw upper-case tokens', () => {
  const d = describeShopperCondition('MINT_IN_BOX');
  assert.equal(d?.condition, null);
  assert.equal(d?.label, 'Mint in box');
  assert.equal(d?.description, null);
});

test('no shopper-facing wording uses the retired words', () => {
  const all: string[] = [];
  for (const c of ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR', 'LIKE_NEW', 'POOR', 'FAIR']) {
    for (const g of [undefined, 'A', 'B', 'C', 'D', 'S']) {
      const d = describeShopperCondition(c, g);
      all.push(d?.text ?? '', d?.description ?? '');
    }
  }
  for (const t of all) {
    assert.doesNotMatch(t, /like new|fair|poor|\bAI\b|\u2014/i, t);
  }
});

test('filter values: canonical, legacy and old bookmarked words normalize to the canonical condition', () => {
  for (const v of ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR']) assert.equal(normalizeConditionFilterValue(v), v);
  assert.equal(normalizeConditionFilterValue('used'), 'USED');
  assert.equal(normalizeConditionFilterValue('LIKE_NEW'), 'USED');
  for (const v of ['Excellent', 'excellent', 'Good', 'Fair', 'Very Good', 'mint']) assert.equal(normalizeConditionFilterValue(v), 'USED', v);
  assert.equal(normalizeConditionFilterValue('Poor'), 'PARTS_OR_REPAIR');
  assert.equal(normalizeConditionFilterValue('Parts / Repair'), 'PARTS_OR_REPAIR');
});

test('filter values: empty or unknown normalize to the empty string', () => {
  for (const v of ['', '  ', 'shiny', null, undefined, 3]) assert.equal(normalizeConditionFilterValue(v), '');
});

test('conditionFilterLabel', () => {
  assert.equal(conditionFilterLabel('USED'), 'Used');
  assert.equal(conditionFilterLabel('excellent'), 'Used');
  assert.equal(conditionFilterLabel('PARTS_OR_REPAIR'), 'Parts / Repair');
  assert.equal(conditionFilterLabel(' shiny '), 'shiny');
  assert.equal(conditionFilterLabel(undefined), '');
});
