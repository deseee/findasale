/**
 * conditionModel: local mirror of the backend condition mapping (item editor unification, U4).
 * Run: npm test   (node:test through tsx, no extra dependencies)
 *
 * Contains the unified table (every condition and grade combination), legacy normalization coverage, and a
 * parity test that compares the mirror with packages/backend/src/utils/conditionMapping.ts when that file is
 * present on disk (it is a pure module, so it can be loaded directly). If it is absent the parity test is
 * skipped and the literal tables below still pin the behavior.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CANONICAL_CONDITIONS,
  CANONICAL_CONDITION_LABELS,
  CONDITION_GRADES,
  CONDITION_GRADE_LABELS,
  CONDITION_GRADE_OPTIONS,
  EBAY_CONDITION_ENUMS,
  EBAY_CONDITION_LABELS,
  desiredEbayCondition,
  eBayConditionPreview,
  gradeApplies,
  normalizeCondition,
  normalizeGrade,
  readConditionForForm,
} from '../conditionModel';
import { CONDITIONS, CONDITION_LABELS } from '../itemConstants';

type Row = [condition: string | null, grade: string | null, expected: string];

// Same table as the backend parity test: 5 conditions (including none) x 6 grades (including none and S).
const UNIFIED_TABLE: Row[] = [
  ['NEW', null, 'NEW'], ['NEW', 'S', 'NEW'], ['NEW', 'A', 'NEW'], ['NEW', 'B', 'NEW'], ['NEW', 'C', 'NEW'], ['NEW', 'D', 'NEW'],
  ['PARTS_OR_REPAIR', null, 'FOR_PARTS_OR_NOT_WORKING'], ['PARTS_OR_REPAIR', 'S', 'FOR_PARTS_OR_NOT_WORKING'],
  ['PARTS_OR_REPAIR', 'A', 'FOR_PARTS_OR_NOT_WORKING'], ['PARTS_OR_REPAIR', 'B', 'FOR_PARTS_OR_NOT_WORKING'],
  ['PARTS_OR_REPAIR', 'C', 'FOR_PARTS_OR_NOT_WORKING'], ['PARTS_OR_REPAIR', 'D', 'FOR_PARTS_OR_NOT_WORKING'],
  ['REFURBISHED', null, 'SELLER_REFURBISHED'], ['REFURBISHED', 'S', 'SELLER_REFURBISHED'],
  ['REFURBISHED', 'A', 'SELLER_REFURBISHED'], ['REFURBISHED', 'B', 'SELLER_REFURBISHED'],
  ['REFURBISHED', 'C', 'SELLER_REFURBISHED'], ['REFURBISHED', 'D', 'SELLER_REFURBISHED'],
  ['USED', null, 'USED_GOOD'], ['USED', 'S', 'USED_VERY_GOOD'], ['USED', 'A', 'USED_VERY_GOOD'],
  ['USED', 'B', 'USED_VERY_GOOD'], ['USED', 'C', 'USED_GOOD'], ['USED', 'D', 'USED_ACCEPTABLE'],
  [null, null, 'USED_GOOD'], [null, 'S', 'USED_VERY_GOOD'], [null, 'A', 'USED_VERY_GOOD'],
  [null, 'B', 'USED_VERY_GOOD'], [null, 'C', 'USED_GOOD'], [null, 'D', 'USED_ACCEPTABLE'],
];

test('constants: canonical vocabularies and labels', () => {
  assert.deepEqual([...CANONICAL_CONDITIONS], ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR']);
  assert.deepEqual([...CONDITION_GRADES], ['A', 'B', 'C', 'D']);
  assert.deepEqual(CONDITION_GRADE_LABELS, { A: 'Excellent', B: 'Very good', C: 'Good', D: 'Acceptable' });
  assert.deepEqual(CONDITION_GRADE_OPTIONS.map((o) => o.value), ['A', 'B', 'C', 'D']);
  assert.deepEqual(CONDITION_GRADE_OPTIONS.map((o) => o.label), ['A - Excellent', 'B - Very good', 'C - Good', 'D - Acceptable']);
});

test('constants: same condition values and labels as lib/itemConstants.ts', () => {
  assert.deepEqual([...CANONICAL_CONDITIONS], [...CONDITIONS]);
  assert.deepEqual(CANONICAL_CONDITION_LABELS, CONDITION_LABELS);
});

test('every table value is a listed eBay enum with a label', () => {
  for (const [, , expected] of UNIFIED_TABLE) {
    assert.equal((EBAY_CONDITION_ENUMS as readonly string[]).includes(expected), true, expected);
    assert.equal(typeof (EBAY_CONDITION_LABELS as Record<string, string>)[expected], 'string');
  }
  assert.equal(Object.keys(EBAY_CONDITION_LABELS).length, EBAY_CONDITION_ENUMS.length);
});

test("EBAY_CONDITION_LABELS use eBay's own condition names", () => {
  assert.deepEqual(EBAY_CONDITION_LABELS, {
    NEW: 'New',
    USED_VERY_GOOD: 'Very Good',
    USED_GOOD: 'Good',
    USED_ACCEPTABLE: 'Acceptable',
    SELLER_REFURBISHED: 'Seller refurbished',
    FOR_PARTS_OR_NOT_WORKING: 'For parts or not working',
  });
});

test('desiredEbayCondition: unified table, every combination', () => {
  assert.equal(UNIFIED_TABLE.length, 30);
  for (const [c, g, expected] of UNIFIED_TABLE) {
    assert.equal(desiredEbayCondition(c, g), expected, `condition ${c}, grade ${g}`);
  }
});

test('desiredEbayCondition: case, whitespace, unknown values and legacy strings', () => {
  assert.equal(desiredEbayCondition(' used ', ' b '), 'USED_VERY_GOOD');
  assert.equal(desiredEbayCondition('new', 'd'), 'NEW');
  assert.equal(desiredEbayCondition('USED', ''), 'USED_GOOD');
  assert.equal(desiredEbayCondition('USED', 'Z'), 'USED_GOOD');
  assert.equal(desiredEbayCondition(undefined, undefined), 'USED_GOOD');
  assert.equal(desiredEbayCondition('SOMETHING_ELSE', 'D'), 'USED_ACCEPTABLE');
  assert.equal(desiredEbayCondition('GOOD', 'C'), 'USED_GOOD');
  assert.equal(desiredEbayCondition('POOR', null), 'FOR_PARTS_OR_NOT_WORKING');
  assert.equal(desiredEbayCondition('SELLER_REFURBISHED', null), 'SELLER_REFURBISHED');
  assert.equal(desiredEbayCondition('NEW_OTHER', null), 'NEW');
});

test('desiredEbayCondition: LIKE_NEW and EXCELLENT read as used with hint grade A; a stored grade wins', () => {
  assert.equal(desiredEbayCondition('LIKE_NEW', null), 'USED_VERY_GOOD');
  assert.equal(desiredEbayCondition('EXCELLENT', undefined), 'USED_VERY_GOOD');
  assert.equal(desiredEbayCondition('LIKE_NEW', 'C'), 'USED_GOOD');
  assert.equal(desiredEbayCondition('EXCELLENT', 'D'), 'USED_ACCEPTABLE');
});

test('eBayConditionPreview: the label eBay shows for each case', () => {
  assert.equal(eBayConditionPreview('NEW', null), 'New');
  assert.equal(eBayConditionPreview('NEW', 'D'), 'New');
  assert.equal(eBayConditionPreview('PARTS_OR_REPAIR', 'A'), 'For parts or not working');
  assert.equal(eBayConditionPreview('REFURBISHED', 'C'), 'Seller refurbished');
  assert.equal(eBayConditionPreview('USED', 'A'), 'Very Good');
  assert.equal(eBayConditionPreview('USED', 'B'), 'Very Good');
  assert.equal(eBayConditionPreview('USED', 'S'), 'Very Good');
  assert.equal(eBayConditionPreview('USED', 'C'), 'Good');
  assert.equal(eBayConditionPreview('USED', 'D'), 'Acceptable');
  assert.equal(eBayConditionPreview('USED', null), 'Good');
  assert.equal(eBayConditionPreview(null, null), 'Good');
  assert.equal(eBayConditionPreview('', ''), 'Good');
  assert.equal(eBayConditionPreview('LIKE_NEW', ''), 'Very Good');
});

test('gradeApplies: only used goods (legacy values normalized first)', () => {
  assert.equal(gradeApplies('USED'), true);
  assert.equal(gradeApplies('used'), true);
  assert.equal(gradeApplies('GOOD'), true);
  assert.equal(gradeApplies('LIKE_NEW'), true);
  assert.equal(gradeApplies('NEW'), false);
  assert.equal(gradeApplies('REFURBISHED'), false);
  assert.equal(gradeApplies('PARTS_OR_REPAIR'), false);
  assert.equal(gradeApplies('POOR'), false);
  assert.equal(gradeApplies(''), false);
  assert.equal(gradeApplies(null), false);
  assert.equal(gradeApplies(undefined), false);
  assert.equal(gradeApplies('SOMETHING_ELSE'), false);
});

test('normalizeGrade: trims, uppercases, folds S into A, rejects the rest', () => {
  assert.equal(normalizeGrade('a'), 'A');
  assert.equal(normalizeGrade(' c '), 'C');
  assert.equal(normalizeGrade('S'), 'A');
  assert.equal(normalizeGrade('s'), 'A');
  assert.equal(normalizeGrade('D'), 'D');
  for (const bad of ['', '  ', 'Z', 'AB', null, undefined, 3, {}]) {
    assert.equal(normalizeGrade(bad), null, String(bad));
  }
});

test('normalizeCondition: canonical values pass through unchanged', () => {
  for (const c of CANONICAL_CONDITIONS) {
    assert.deepEqual(normalizeCondition(c), { condition: c, changed: false });
  }
});

test('normalizeCondition: legacy mapping table', () => {
  const rows: Array<[string, string, string | undefined]> = [
    // raw, condition, hintGrade
    ['used', 'USED', undefined],
    ['  New ', 'NEW', undefined],
    ['GOOD', 'USED', undefined],
    ['Fair', 'USED', undefined],
    ['USED_GOOD', 'USED', undefined],
    ['USED_EXCELLENT', 'USED', undefined],
    ['USED_VERY_GOOD', 'USED', undefined],
    ['NEW_OTHER', 'NEW', undefined],
    ['LIKE_NEW', 'USED', 'A'],
    ['Like New', 'USED', 'A'],
    ['like-new', 'USED', 'A'],
    ['EXCELLENT', 'USED', 'A'],
    ['excellent', 'USED', 'A'],
    ['REFURBISHED', 'REFURBISHED', undefined],
    ['SELLER_REFURBISHED', 'REFURBISHED', undefined],
    ['MANUFACTURER_REFURBISHED', 'REFURBISHED', undefined],
    ['REFURBISHED_GOOD', 'REFURBISHED', undefined],
    ['POOR', 'PARTS_OR_REPAIR', undefined],
    ['PARTS', 'PARTS_OR_REPAIR', undefined],
    ['PARTS_ONLY', 'PARTS_OR_REPAIR', undefined],
    ['FOR_PARTS', 'PARTS_OR_REPAIR', undefined],
    ['For parts or not working', 'PARTS_OR_REPAIR', undefined],
    ['parts or repair', 'PARTS_OR_REPAIR', undefined],
  ];
  for (const [raw, condition, hint] of rows) {
    const got = normalizeCondition(raw);
    assert.equal(got.condition, condition, raw);
    assert.equal(got.hintGrade, hint, raw);
    assert.equal(got.changed, raw !== condition, raw);
  }
});

test('normalizeCondition: unrecognized, empty and non-string inputs give a null condition', () => {
  for (const raw of ['', '   ', 'S', 'A', 'B', 'C', 'D', 'WHATEVER', 'NEWISH', null, undefined, 5, {}, []]) {
    assert.deepEqual(normalizeCondition(raw), { condition: null, changed: false }, String(raw));
  }
});

test('readConditionForForm: loads stored values for the form', () => {
  assert.deepEqual(readConditionForForm('USED', 'B'), { condition: 'USED', conditionGrade: 'B' });
  assert.deepEqual(readConditionForForm('used', 's'), { condition: 'USED', conditionGrade: 'A' });
  assert.deepEqual(readConditionForForm('LIKE_NEW', null), { condition: 'USED', conditionGrade: 'A' });
  assert.deepEqual(readConditionForForm('LIKE_NEW', 'C'), { condition: 'USED', conditionGrade: 'C' });
  assert.deepEqual(readConditionForForm('GOOD', ''), { condition: 'USED', conditionGrade: '' });
  assert.deepEqual(readConditionForForm('', ''), { condition: '', conditionGrade: '' });
  assert.deepEqual(readConditionForForm('WHATEVER', 'C'), { condition: '', conditionGrade: 'C' });
  // A stored grade on non-used goods is kept, so re-saving never silently clears it.
  assert.deepEqual(readConditionForForm('NEW', 'A'), { condition: 'NEW', conditionGrade: 'A' });
  assert.deepEqual(readConditionForForm('NEW', null), { condition: 'NEW', conditionGrade: '' });
});

// ---------------------------------------------------------------------------------------------
// Parity with the backend module (skipped when the backend source is not on disk)
// ---------------------------------------------------------------------------------------------
const BACKEND_FILE =
  typeof __dirname === 'string'
    ? path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'utils', 'conditionMapping.ts')
    : '';
const backendPresent = BACKEND_FILE !== '' && fs.existsSync(BACKEND_FILE);

test('parity with backend utils/conditionMapping.ts', { skip: backendPresent ? false : 'backend source not present' }, async () => {
  const backend: any = await import(BACKEND_FILE);

  assert.deepEqual([...CANONICAL_CONDITIONS], [...backend.CANONICAL_CONDITIONS]);
  assert.deepEqual([...EBAY_CONDITION_ENUMS], [...backend.EBAY_CONDITION_ENUMS]);
  // The backend also lists S; the frontend picker list is the same set without it.
  assert.deepEqual(['S', ...CONDITION_GRADES], [...backend.CONDITION_GRADES]);

  const conditions: unknown[] = [
    null, undefined, '', '   ', 'NEW', 'new', ' New ', 'USED', 'used', 'REFURBISHED', 'PARTS_OR_REPAIR',
    'LIKE_NEW', 'Like New', 'like-new', 'EXCELLENT', 'excellent', 'GOOD', 'Good', 'FAIR', 'POOR', 'poor',
    'USED_GOOD', 'USED_EXCELLENT', 'USED_VERY_GOOD', 'USED_ACCEPTABLE', 'NEW_OTHER', 'NEW_WITH_TAGS',
    'SELLER_REFURBISHED', 'MANUFACTURER_REFURBISHED', 'REFURBISHED_GOOD', 'PARTS', 'PARTS_ONLY', 'FOR_PARTS',
    'FOR_PARTS_OR_NOT_WORKING', 'For parts or not working', 'S', 'A', 'WHATEVER', 'NEWISH', 7, {}, [],
  ];
  const grades: unknown[] = [null, undefined, '', '  ', 'S', 's', 'A', 'a', 'B', 'C', 'D', ' d ', 'Z', 'AB', 3];

  for (const c of conditions) {
    assert.deepEqual(normalizeCondition(c), backend.normalizeCondition(c), `normalizeCondition(${JSON.stringify(c)})`);
    for (const g of grades) {
      assert.equal(
        desiredEbayCondition(c as string | null | undefined, g as string | null | undefined),
        backend.desiredEbayCondition(c, g),
        `desiredEbayCondition(${JSON.stringify(c)}, ${JSON.stringify(g)})`,
      );
    }
  }

  // normalizeGrade differs only in folding S into A; every other input agrees exactly.
  for (const g of grades) {
    const mine = normalizeGrade(g);
    const theirs = backend.normalizeGrade(g);
    assert.equal(mine, theirs === 'S' ? 'A' : theirs, `normalizeGrade(${JSON.stringify(g)})`);
  }

  // The 30-row table agrees with the backend too.
  for (const [c, g, expected] of UNIFIED_TABLE) {
    assert.equal(backend.desiredEbayCondition(c, g), expected);
  }
});
