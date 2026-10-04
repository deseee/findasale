/**
 * U4 knock-on fixes (one condition vocabulary):
 *   1. ebayController mapConditionGradeToEbayId(condition, grade) (CSV export + ebay-preview) maps through
 *      desiredEbayCondition to the universal numeric ids only, so a USED grade A item is no longer exported as New.
 *   2. depreciation.applyConditionFactor resolves the condition through normalizeCondition first; canonical outputs
 *      are unchanged from before the fix (golden), legacy and mixed-case values land on the canonical factor.
 * Prisma and token crypto are mocks; no network.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../utils/tokenCrypto', () => ({ encryptToken: (x: string) => x, decryptToken: (x: string) => x }));

import * as fs from 'fs';
import * as path from 'path';
import { mapConditionGradeToEbayId } from '../controllers/ebayController';
import { applyConditionFactor } from '../services/pricingEngine/depreciation';

const GRADES: Array<string | null> = [null, 'S', 'A', 'B', 'C', 'D'];

describe('mapConditionGradeToEbayId (CSV / preview condition id)', () => {
  it('NEW is 1000 for every grade (a NEW item with grade B or C is no longer exported as Used)', () => {
    for (const g of GRADES) expect(mapConditionGradeToEbayId('NEW', g)).toBe('1000');
  });

  it('USED is the universal Used id 3000 for every grade (A and B no longer export as New, D no longer as parts)', () => {
    for (const g of GRADES) expect(mapConditionGradeToEbayId('USED', g)).toBe('3000');
  });

  it('REFURBISHED is 2500 for every grade (the id ebayController already maps to SELLER_REFURBISHED)', () => {
    for (const g of GRADES) expect(mapConditionGradeToEbayId('REFURBISHED', g)).toBe('2500');
  });

  it('PARTS_OR_REPAIR is 7000 for every grade', () => {
    for (const g of GRADES) expect(mapConditionGradeToEbayId('PARTS_OR_REPAIR', g)).toBe('7000');
  });

  it('no condition: used goods by grade, all 3000, including no grade (the old null fallback)', () => {
    for (const c of [null, undefined, '']) {
      for (const g of GRADES) expect(mapConditionGradeToEbayId(c, g)).toBe('3000');
    }
    expect(mapConditionGradeToEbayId(undefined, undefined)).toBe('3000');
  });

  it('unknown grade or unknown condition falls back to 3000', () => {
    expect(mapConditionGradeToEbayId('USED', 'Z')).toBe('3000');
    expect(mapConditionGradeToEbayId('mystery', 'A')).toBe('3000');
    expect(mapConditionGradeToEbayId('USED', '')).toBe('3000');
  });

  it('the headline regression: grade A / S no longer export as New unless the condition is NEW', () => {
    expect(mapConditionGradeToEbayId('USED', 'A')).not.toBe('1000');
    expect(mapConditionGradeToEbayId(null, 'S')).not.toBe('1000');
    expect(mapConditionGradeToEbayId('NEW', 'A')).toBe('1000');
  });

  it('only universal ids are ever produced', () => {
    const conds: Array<string | null> = [null, 'NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR', 'LIKE_NEW', 'good', 'Poor'];
    for (const c of conds) for (const g of GRADES) {
      expect(['1000', '2500', '3000', '7000']).toContain(mapConditionGradeToEbayId(c, g));
    }
  });

  it('legacy and mixed-case values resolve through normalizeCondition', () => {
    expect(mapConditionGradeToEbayId('new', 'C')).toBe('1000');
    expect(mapConditionGradeToEbayId('Like New', null)).toBe('3000'); // USED with hint grade A
    expect(mapConditionGradeToEbayId('LIKE_NEW', 'D')).toBe('3000');
    expect(mapConditionGradeToEbayId('seller refurbished', 'B')).toBe('2500');
    expect(mapConditionGradeToEbayId('POOR', 'A')).toBe('7000');
    expect(mapConditionGradeToEbayId('for parts', null)).toBe('7000');
    expect(mapConditionGradeToEbayId('NEW_OTHER', null)).toBe('1000');
  });

  it('grade casing and whitespace are tolerated', () => {
    expect(mapConditionGradeToEbayId('new', ' a ')).toBe('1000');
    expect(mapConditionGradeToEbayId('USED', 'd')).toBe('3000');
  });
});

describe('ebayController source contract for the CSV and preview callers', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'ebayController.ts'), 'utf8');

  it('both callers pass the item condition and the grade', () => {
    expect(src.match(/mapConditionGradeToEbayId\(item\.condition, item\.conditionGrade\)/g)?.length).toBe(2);
    expect(src).not.toMatch(/mapConditionGradeToEbayId\(item\.conditionGrade\)/);
  });

  it('the CSV item select, the CSV item type and the preview select all carry condition', () => {
    expect(src).toContain('    condition?: string | null;\n    conditionGrade: string | null;\n    ebayCategoryId: string | null;');
    expect(src).toContain('            condition: true,\n            conditionGrade: true,\n            ebayCategoryId: true,');
    expect(src).toContain('        description: true,\n        condition: true,\n        conditionGrade: true,\n        category: true,');
  });
});

describe('applyConditionFactor (depreciation)', () => {
  // Golden: outputs measured on the pre-fix implementation (price 1000). The canonical four, null and undefined must not move.
  it('canonical four, null and undefined are unchanged', () => {
    expect(applyConditionFactor(1000, 'NEW')).toBe(1000);
    expect(applyConditionFactor(1000, 'USED')).toBe(700);
    expect(applyConditionFactor(1000, 'REFURBISHED')).toBe(850);
    expect(applyConditionFactor(1000, 'PARTS_OR_REPAIR')).toBe(300);
    expect(applyConditionFactor(1000, undefined)).toBe(1000);
    expect(applyConditionFactor(1000, '')).toBe(1000);
    expect(applyConditionFactor(1234, 'NEW')).toBe(1234);
    expect(applyConditionFactor(333, 'USED')).toBe(Math.round(333 * 0.7));
    expect(applyConditionFactor(333, 'REFURBISHED')).toBe(Math.round(333 * 0.85));
  });

  it('mixed-case and padded canonical values resolve to the canonical factor', () => {
    expect(applyConditionFactor(1000, 'new')).toBe(1000);
    expect(applyConditionFactor(1000, 'Used')).toBe(700);
    expect(applyConditionFactor(1000, ' refurbished ')).toBe(850);
    expect(applyConditionFactor(1000, 'parts_or_repair')).toBe(300);
    expect(applyConditionFactor(1000, 'Parts or Repair')).toBe(300);
  });

  it('legacy values resolve through normalizeCondition', () => {
    expect(applyConditionFactor(1000, 'SELLER_REFURBISHED')).toBe(850); // was 700 (fell to the fallback)
    expect(applyConditionFactor(1000, 'POOR')).toBe(300); // was 700
    expect(applyConditionFactor(1000, 'PARTS')).toBe(300); // was 700
    expect(applyConditionFactor(1000, 'FOR_PARTS_OR_NOT_WORKING')).toBe(300); // was 700
    expect(applyConditionFactor(1000, 'NEW_OTHER')).toBe(1000); // was 700
    expect(applyConditionFactor(1000, 'GOOD')).toBe(700);
    expect(applyConditionFactor(1000, 'USED_GOOD')).toBe(700);
    // LIKE_NEW and FAIR were 0.95 and 0.50 in the old table; both are USED in the one vocabulary (LIKE_NEW carries a grade-A hint only).
    expect(applyConditionFactor(1000, 'LIKE_NEW')).toBe(700); // was 950
    expect(applyConditionFactor(1000, 'FAIR')).toBe(700); // was 500
    expect(applyConditionFactor(1000, 'like new')).toBe(700);
    expect(applyConditionFactor(1000, 'EXCELLENT')).toBe(700);
  });

  it('unknown values keep the 0.70 fallback', () => {
    expect(applyConditionFactor(1000, 'junk')).toBe(700);
    expect(applyConditionFactor(1000, '  ')).toBe(700);
    expect(applyConditionFactor(1000, 'S')).toBe(700); // a grade letter is not a condition
  });
});
