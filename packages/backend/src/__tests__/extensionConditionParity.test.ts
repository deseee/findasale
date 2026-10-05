/**
 * The browser extension's fas-condition.js mirrors normalizeCondition and normalizeGrade from
 * utils/conditionMapping.ts. This test pins the two together over a grid of canonical, legacy, spaced, hyphenated,
 * mixed-case and junk values, and checks that the extension's effective {condition, grade} reaches the same eBay
 * condition as desiredEbayCondition. Also pins each platform's output so a wording change is deliberate.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ext = require('../../../../extension/fas-condition.js');

import { normalizeCondition, normalizeGrade, desiredEbayCondition } from '../utils/conditionMapping';

const CONDITION_INPUTS: unknown[] = [
  'NEW', 'new', ' New ', 'USED', 'used', 'Used', 'REFURBISHED', 'refurbished', 'PARTS_OR_REPAIR', 'parts or repair',
  'Parts-or-Repair', 'LIKE_NEW', 'like new', 'Like-New', 'LIKE NEW', 'EXCELLENT', 'excellent', 'GOOD', 'good',
  'FAIR', 'fair', 'POOR', 'poor', 'PARTS', 'parts', 'PARTS_ONLY', 'FOR_PARTS', 'for parts', 'FOR_PARTS_OR_NOT_WORKING',
  'USED_EXCELLENT', 'USED_GOOD', 'used - good', 'Used - Like New', 'Used - Fair', 'USED_ACCEPTABLE', 'USED_VERY_GOOD',
  'NEW_WITH_TAGS', 'new with tags', 'NEW_OTHER', 'SELLER_REFURBISHED', 'seller refurbished', 'MANUFACTURER_REFURBISHED',
  'REFURBISHED_GRADE_A', 'refurbished - excellent', 'NEWER', 'NEWISH', 'RENEWED', 'USEDISH', 'A', 'B', 'S', 'D',
  'garbage', 'unknown', '', '   ', null, undefined, 0, 1, true, {}, [], ['NEW'],
];

const GRADE_INPUTS: unknown[] = [
  'S', 's', 'A', 'a', ' b ', 'B', 'C', 'c', 'D', 'd', 'E', 'AA', 'LIKE_NEW', '', '  ', null, undefined, 0, {}, ['A'],
];

describe('extension fas-condition.js parity with conditionMapping.ts', () => {
  it.each(CONDITION_INPUTS.map((v) => [JSON.stringify(v) ?? 'undefined', v]))('normalizeCondition %s', (_label, raw) => {
    expect(ext.normalizeCondition(raw)).toEqual(normalizeCondition(raw));
  });

  it.each(GRADE_INPUTS.map((v) => [JSON.stringify(v) ?? 'undefined', v]))('normalizeGrade %s', (_label, raw) => {
    expect(ext.normalizeGrade(raw)).toBe(normalizeGrade(raw));
  });

  it('reaches the same eBay condition as desiredEbayCondition through normalize()', () => {
    const usedGradeToEbay = (g: string | null) => (g === 'C' ? 'USED_GOOD' : g === 'D' ? 'USED_ACCEPTABLE' : g ? 'USED_VERY_GOOD' : 'USED_GOOD');
    const viaExtension = (condition: unknown, grade: unknown) => {
      const n = ext.normalize({ conditionRaw: condition, conditionGrade: grade });
      switch (n.condition) {
        case 'NEW': return 'NEW';
        case 'PARTS_OR_REPAIR': return 'FOR_PARTS_OR_NOT_WORKING';
        case 'REFURBISHED': return 'SELLER_REFURBISHED';
        default: return usedGradeToEbay(n.grade);
      }
    };
    for (const c of CONDITION_INPUTS) {
      for (const g of GRADE_INPUTS) {
        // desiredEbayCondition takes strings; skip non-string junk (the extension reads null for those).
        const cs = typeof c === 'string' ? c : null;
        const gs = typeof g === 'string' ? g : null;
        expect(viaExtension(cs, gs)).toBe(desiredEbayCondition(cs, gs));
      }
    }
  });
});

describe('extension fas-condition.js platform values', () => {
  const v = (platform: string, conditionRaw: unknown, conditionGrade: unknown = null) =>
    ext.platformValue(platform, { conditionRaw, conditionGrade });

  it('returns null when the item carries nothing usable, so scripts keep their old behavior', () => {
    for (const p of ['mercari', 'poshmark', 'vinted', 'grailed', 'craigslist']) {
      expect(v(p, null)).toBeNull();
      expect(v(p, '')).toBeNull();
      expect(v(p, 'garbage')).toBeNull();
      expect(ext.platformValue(p, undefined)).toBeNull();
      expect(ext.platformValue(p, {})).toBeNull();
    }
    expect(v('nowhere', 'NEW')).toBeNull();
  });

  it('maps canonical condition and grade to each platform option', () => {
    const table: Record<string, Record<string, string>> = {
      mercari:    { NEW: 'New', A: 'Like New', B: 'Good', C: 'Good', D: 'Fair', USED: 'Good', REFURBISHED: 'Like New', PARTS_OR_REPAIR: 'Poor' },
      poshmark:   { NEW: 'New With Tags (NWT)', A: 'Like New', B: 'Good', C: 'Good', D: 'Fair', USED: 'Good', REFURBISHED: 'Like New', PARTS_OR_REPAIR: 'Fair' },
      vinted:     { NEW: 'New', A: 'Like new', B: 'Very good', C: 'Good', D: 'Satisfactory', USED: 'Good', REFURBISHED: 'Like new', PARTS_OR_REPAIR: 'Needs repair (electronics only)' },
      grailed:    { NEW: 'New/Never Worn', A: 'Gently Used', B: 'Gently Used', C: 'Used', D: 'Used', USED: 'Used', REFURBISHED: 'Gently Used', PARTS_OR_REPAIR: 'Very Worn' },
      craigslist: { NEW: '10', A: '20', B: '30', C: '40', D: '50', USED: '40', REFURBISHED: '20', PARTS_OR_REPAIR: '60' },
    };
    for (const [platform, row] of Object.entries(table)) {
      expect(v(platform, 'NEW', 'A')).toBe(row.NEW);
      expect(v(platform, 'REFURBISHED', 'D')).toBe(row.REFURBISHED);
      expect(v(platform, 'PARTS_OR_REPAIR', 'A')).toBe(row.PARTS_OR_REPAIR);
      expect(v(platform, 'USED', null)).toBe(row.USED);
      for (const g of ['A', 'B', 'C', 'D']) expect(v(platform, 'USED', g)).toBe(row[g]);
    }
  });

  it('reads legacy values: LIKE_NEW and EXCELLENT are used grade A, a stored grade wins, S reads as A', () => {
    expect(v('mercari', 'LIKE_NEW')).toBe('Like New');
    expect(v('vinted', 'excellent')).toBe('Like new');
    expect(v('vinted', 'LIKE_NEW', 'C')).toBe('Good');
    expect(v('vinted', 'USED', 's')).toBe('Like new');
    expect(v('poshmark', 'GOOD')).toBe('Good');
    expect(v('poshmark', 'FAIR')).toBe('Good');
    expect(v('mercari', 'POOR')).toBe('Poor');
    expect(v('craigslist', 'seller refurbished')).toBe('20');
  });

  it('treats a missing condition with a valid grade as used, like desiredEbayCondition', () => {
    expect(v('mercari', null, 'D')).toBe('Fair');
    expect(v('mercari', null, null)).toBeNull();
  });
});
