import test from 'node:test';
import assert from 'node:assert/strict';
import { readEditCondition, untouchedConditionValue, untouchedGradeValue } from '../itemFormCondition';

test('readEditCondition: canonical values pass through', () => {
  assert.deepEqual(readEditCondition('USED', 'B'), { condition: 'USED', conditionGrade: 'B', legacyS: false });
  assert.deepEqual(readEditCondition('NEW', null), { condition: 'NEW', conditionGrade: '', legacyS: false });
  assert.deepEqual(readEditCondition('refurbished', ''), { condition: 'REFURBISHED', conditionGrade: '', legacyS: false });
  assert.deepEqual(readEditCondition('Parts or repair', 'D').condition, 'PARTS_OR_REPAIR');
});

test('readEditCondition: LIKE_NEW and EXCELLENT read as USED with grade A (same as the backend)', () => {
  assert.deepEqual(readEditCondition('LIKE_NEW', null), { condition: 'USED', conditionGrade: 'A', legacyS: false });
  assert.deepEqual(readEditCondition('Like New', ''), { condition: 'USED', conditionGrade: 'A', legacyS: false });
  assert.deepEqual(readEditCondition('EXCELLENT', null), { condition: 'USED', conditionGrade: 'A', legacyS: false });
});

test('readEditCondition: a stored grade wins over the legacy hint', () => {
  assert.equal(readEditCondition('LIKE_NEW', 'C').conditionGrade, 'C');
});

test('readEditCondition: other legacy values', () => {
  assert.equal(readEditCondition('GOOD', null).condition, 'USED');
  assert.equal(readEditCondition('FAIR', null).condition, 'USED');
  assert.equal(readEditCondition('POOR', null).condition, 'PARTS_OR_REPAIR');
  assert.equal(readEditCondition('nonsense', null).condition, '');
  assert.equal(readEditCondition(null, null).condition, '');
  assert.equal(readEditCondition(undefined, undefined).conditionGrade, '');
});

test('readEditCondition: grade S is kept and flagged legacy only when stored', () => {
  assert.deepEqual(readEditCondition('USED', 's'), { condition: 'USED', conditionGrade: 'S', legacyS: true });
  assert.equal(readEditCondition('USED', 'A').legacyS, false);
});

test('untouchedConditionValue: canonical form for canonical values, raw for legacy, empty when missing', () => {
  assert.equal(untouchedConditionValue('used'), 'USED');
  assert.equal(untouchedConditionValue(' Parts or Repair '), 'PARTS_OR_REPAIR');
  assert.equal(untouchedConditionValue('LIKE_NEW'), 'LIKE_NEW');
  assert.equal(untouchedConditionValue('Excellent'), 'Excellent');
  assert.equal(untouchedConditionValue(null), '');
  assert.equal(untouchedConditionValue(''), '');
  assert.equal(untouchedConditionValue(42), '');
});

test('untouchedGradeValue: exactly as stored, else empty', () => {
  assert.equal(untouchedGradeValue('S'), 'S');
  assert.equal(untouchedGradeValue(null), '');
  assert.equal(untouchedGradeValue(undefined), '');
});
