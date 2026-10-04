/**
 * itemConstants: condition constants stay consistent with lib/conditionModel.ts, and the legacy display map reads
 * old values the way the backend does. Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONDITIONS, CONDITION_LABELS, CONDITION_MAP, formatCondition } from '../itemConstants';
import { CONDITION_GRADE_LABELS, normalizeCondition } from '../conditionModel';
import { SALE_SUBTYPES } from '../sale-subtypes';

test('every legacy and canonical condition word in CONDITION_MAP agrees with the condition model', () => {
  const words = ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR', 'LIKE_NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'FOR_PARTS'];
  for (const w of words) {
    const canonical = normalizeCondition(w).condition;
    assert.notEqual(canonical, null, w);
    assert.equal(CONDITION_MAP[w], CONDITION_LABELS[canonical!], w);
  }
});

test('CONDITION_MAP grade letters use the approved grade wording', () => {
  for (const g of ['A', 'B', 'C', 'D'] as const) assert.equal(CONDITION_MAP[g], CONDITION_GRADE_LABELS[g], g);
  assert.equal(CONDITION_MAP.S, 'Very good (legacy)');
});

test('formatCondition', () => {
  assert.equal(formatCondition(null), 'Not specified');
  assert.equal(formatCondition(''), 'Not specified');
  assert.equal(formatCondition('LIKE_NEW'), 'Used');
  assert.equal(formatCondition('POOR'), 'Parts / Repair');
  assert.equal(formatCondition('like new'), 'Used');
  assert.equal(formatCondition('Used - Good'), 'Used');
  assert.equal(formatCondition('MINT'), 'MINT');
  assert.equal(formatCondition('B'), 'Very good');
});

test('the four canonical conditions are exported unchanged', () => {
  assert.deepEqual([...CONDITIONS], ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR']);
});

test('yard sale subtype label has no "Garage Sale" wording', () => {
  const labels = Object.values(SALE_SUBTYPES).flat().map((o) => o.label);
  assert.equal(labels.includes('Yard Sale'), true);
  for (const l of labels) assert.equal(/garage/i.test(l), false, l);
});
