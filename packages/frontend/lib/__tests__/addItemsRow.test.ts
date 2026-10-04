/**
 * addItemsRow: Add Items row quick editor (condition normalization, PUT fields) and failed-push badge visibility.
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EBAY_FAILED_BADGE_ARIA_LABEL,
  EBAY_FAILED_BADGE_TEXT,
  buildConditionPutFields,
  buildRowConditionState,
  failedPushCount,
  readRowGrade,
  rowGradeOptions,
  showEbayFailedBadge,
  showRowGradePicker,
} from '../addItemsRow';

test('legacy conditions display normalized', () => {
  assert.deepEqual(buildRowConditionState({ condition: 'LIKE_NEW' }), {
    condition: 'USED', conditionGrade: 'A', conditionInitial: 'USED', conditionGradeInitial: 'A',
  });
  assert.equal(buildRowConditionState({ condition: 'GOOD' }).condition, 'USED');
  assert.equal(buildRowConditionState({ condition: 'FAIR' }).condition, 'USED');
  assert.equal(buildRowConditionState({ condition: 'POOR' }).condition, 'PARTS_OR_REPAIR');
  assert.equal(buildRowConditionState({ condition: 'poor' }).condition, 'PARTS_OR_REPAIR');
  assert.equal(buildRowConditionState({ condition: 'EXCELLENT' }).conditionGrade, 'A');
  assert.equal(buildRowConditionState({ condition: 'GOOD' }).conditionGrade, '');
});

test('canonical, empty and unrecognized conditions', () => {
  for (const c of ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR']) {
    assert.equal(buildRowConditionState({ condition: c }).condition, c);
  }
  assert.equal(buildRowConditionState({ condition: '' }).condition, '');
  assert.equal(buildRowConditionState({ condition: null }).condition, '');
  assert.equal(buildRowConditionState({ condition: 'MINT' }).condition, '');
  assert.equal(buildRowConditionState(undefined).condition, '');
  assert.equal(buildRowConditionState(null).conditionGrade, '');
});

test('a stored grade wins over the legacy hint, and a stored S stays S', () => {
  assert.equal(buildRowConditionState({ condition: 'LIKE_NEW', conditionGrade: 'C' }).conditionGrade, 'C');
  assert.equal(buildRowConditionState({ condition: 'USED', conditionGrade: 'b' }).conditionGrade, 'B');
  assert.equal(buildRowConditionState({ condition: 'USED', conditionGrade: 'S' }).conditionGrade, 'S');
  assert.equal(buildRowConditionState({ condition: 'USED', conditionGrade: ' s ' }).conditionGrade, 'S');
  assert.equal(readRowGrade('Z'), '');
  assert.equal(readRowGrade(null), '');
  assert.equal(readRowGrade(undefined), '');
});

test('a stored grade is kept on non-used goods (never silently cleared)', () => {
  assert.equal(buildRowConditionState({ condition: 'NEW', conditionGrade: 'B' }).conditionGrade, 'B');
});

test('the legacy hint grade applies to used goods only', () => {
  // POOR is never hinted; LIKE_NEW is USED so the hint applies.
  assert.equal(buildRowConditionState({ condition: 'POOR' }).conditionGrade, '');
});

test('untouched row sends no condition keys, even for legacy values (no silent re-save)', () => {
  for (const raw of ['LIKE_NEW', 'GOOD', 'FAIR', 'POOR', 'USED', 'NEW', '', null, 'MINT']) {
    const state = buildRowConditionState({ condition: raw as string | null, conditionGrade: raw === 'LIKE_NEW' ? null : 'S' });
    assert.deepEqual(buildConditionPutFields(state), {}, String(raw));
  }
});

test('re-selecting the value already shown is not a change', () => {
  const state = { ...buildRowConditionState({ condition: 'GOOD' }), condition: 'USED' };
  assert.deepEqual(buildConditionPutFields(state), {});
});

test('only the field the organizer changed is sent', () => {
  const base = buildRowConditionState({ condition: 'GOOD', conditionGrade: 'C' });
  assert.deepEqual(buildConditionPutFields({ ...base, condition: 'REFURBISHED' }), { condition: 'REFURBISHED' });
  assert.deepEqual(buildConditionPutFields({ ...base, conditionGrade: 'A' }), { conditionGrade: 'A' });
  assert.deepEqual(buildConditionPutFields({ ...base, condition: 'NEW', conditionGrade: 'D' }), { condition: 'NEW', conditionGrade: 'D' });
});

test('clearing a value is a change and sends an empty string', () => {
  const base = buildRowConditionState({ condition: 'USED', conditionGrade: 'B' });
  assert.deepEqual(buildConditionPutFields({ ...base, conditionGrade: '' }), { conditionGrade: '' });
  assert.deepEqual(buildConditionPutFields({ ...base, condition: '' }), { condition: '' });
});

test('changing S to a real grade sends that grade', () => {
  const base = buildRowConditionState({ condition: 'USED', conditionGrade: 'S' });
  assert.deepEqual(buildConditionPutFields({ ...base, conditionGrade: 'A' }), { conditionGrade: 'A' });
});

test('grade picker shows for used goods only, legacy values normalized first', () => {
  assert.equal(showRowGradePicker('USED'), true);
  assert.equal(showRowGradePicker('LIKE_NEW'), true);
  assert.equal(showRowGradePicker('GOOD'), true);
  assert.equal(showRowGradePicker('NEW'), false);
  assert.equal(showRowGradePicker('REFURBISHED'), false);
  assert.equal(showRowGradePicker('PARTS_OR_REPAIR'), false);
  assert.equal(showRowGradePicker('POOR'), false);
  assert.equal(showRowGradePicker(''), false);
  assert.equal(showRowGradePicker(null), false);
});

test('grade options: A to D, with S (legacy) only for an item that has S', () => {
  assert.deepEqual(rowGradeOptions('B', 'B').map((o) => o.value), ['A', 'B', 'C', 'D']);
  assert.deepEqual(rowGradeOptions('', '').map((o) => o.value), ['A', 'B', 'C', 'D']);
  assert.deepEqual(rowGradeOptions('S', 'S').map((o) => o.value), ['S', 'A', 'B', 'C', 'D']);
  // Still offered after the organizer picks another grade, so they can go back.
  assert.deepEqual(rowGradeOptions('S', 'B').map((o) => o.value), ['S', 'A', 'B', 'C', 'D']);
  assert.equal(rowGradeOptions('S', 'S')[0].label, 'S (legacy)');
  assert.deepEqual(rowGradeOptions('', '').map((o) => o.label), ['A - Very good', 'B - Very good', 'C - Good', 'D - Acceptable']);
});

test('badge shows only when the failed count is above zero', () => {
  assert.equal(showEbayFailedBadge({ marketplacePushFailedCount: 1 }), true);
  assert.equal(showEbayFailedBadge({ marketplacePushFailedCount: 12 }), true);
  assert.equal(showEbayFailedBadge({ marketplacePushFailedCount: 0 }), false);
  assert.equal(showEbayFailedBadge({ marketplacePushFailedCount: -1 }), false);
  assert.equal(showEbayFailedBadge({}), false);
  assert.equal(showEbayFailedBadge({ marketplacePushFailedCount: undefined }), false);
  assert.equal(showEbayFailedBadge({ marketplacePushFailedCount: null }), false);
  assert.equal(showEbayFailedBadge({ marketplacePushFailedCount: NaN }), false);
  assert.equal(showEbayFailedBadge({ marketplacePushFailedCount: '2' }), false);
  assert.equal(showEbayFailedBadge({ marketplacePushFailedCount: true }), false);
  assert.equal(showEbayFailedBadge(null), false);
  assert.equal(showEbayFailedBadge(undefined), false);
  assert.equal(failedPushCount({ marketplacePushFailedCount: 2.7 }), 2);
  assert.equal(failedPushCount({ marketplacePushFailedCount: 3 }), 3);
});

test('badge copy: no em dash, no banned words', () => {
  for (const s of [EBAY_FAILED_BADGE_TEXT, EBAY_FAILED_BADGE_ARIA_LABEL]) {
    assert.equal(s.includes('—'), false);
    assert.equal(/\bAI\b/.test(s), false);
  }
  assert.equal(EBAY_FAILED_BADGE_TEXT, 'eBay update failed');
  assert.equal(EBAY_FAILED_BADGE_ARIA_LABEL, 'eBay update failed, open to review');
});
