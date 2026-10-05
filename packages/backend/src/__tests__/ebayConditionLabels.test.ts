/**
 * eBay condition wording pins (wording only; no eBay enum or id mapping changes).
 *   1. getConditionLabel returns eBay's own display name for every conditionId.
 *   2. ebayDescriptionGradeLine: the grade line eBay receives in conditionDescription (S reads as A).
 *   3. desiredEbayCondition outputs are unchanged for a grid of condition and grade inputs.
 *   4. ebayController wires the helper and no longer carries the dead grade-to-id map.
 * Prisma and token crypto are mocks; no network.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../utils/tokenCrypto', () => ({ encryptToken: (x: string) => x, decryptToken: (x: string) => x }));

import * as fs from 'fs';
import * as path from 'path';
import { getConditionLabel } from '../controllers/ebayController';
import { desiredEbayCondition, ebayDescriptionGradeLine } from '../utils/conditionMapping';

describe('getConditionLabel (eBay condition-id-values display names)', () => {
  const EBAY_NAMES: Record<string, string> = {
    '1000': 'New',
    '1500': 'New other (see details)',
    '1750': 'New with defects',
    '2000': 'Certified Refurbished',
    '2010': 'Excellent - Refurbished',
    '2020': 'Very Good - Refurbished',
    '2030': 'Good - Refurbished',
    '2500': 'Seller refurbished',
    '2750': 'Like New',
    '3000': 'Used',
    '4000': 'Very Good',
    '5000': 'Good',
    '6000': 'Acceptable',
    '7000': 'For parts or not working',
  };

  for (const [id, name] of Object.entries(EBAY_NAMES)) {
    it(`${id} is "${name}"`, () => {
      expect(getConditionLabel(id)).toBe(name);
    });
  }

  it('an id eBay does not list is Unknown', () => {
    expect(getConditionLabel('9999')).toBe('Unknown');
    expect(getConditionLabel('')).toBe('Unknown');
  });
});

describe('ebayDescriptionGradeLine', () => {
  it('A, B, C, D use the organizer-facing grade words', () => {
    expect(ebayDescriptionGradeLine('A')).toBe('Grade A: Excellent condition');
    expect(ebayDescriptionGradeLine('B')).toBe('Grade B: Very good condition');
    expect(ebayDescriptionGradeLine('C')).toBe('Grade C: Good condition');
    expect(ebayDescriptionGradeLine('D')).toBe('Grade D: Acceptable condition');
  });

  it('S is retired and reads as A (same text, never Mint)', () => {
    expect(ebayDescriptionGradeLine('S')).toBe('Grade A: Excellent condition');
    expect(ebayDescriptionGradeLine('S')).toBe(ebayDescriptionGradeLine('A'));
    expect(ebayDescriptionGradeLine('S')).not.toMatch(/mint/i);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(ebayDescriptionGradeLine('a')).toBe('Grade A: Excellent condition');
    expect(ebayDescriptionGradeLine(' b ')).toBe('Grade B: Very good condition');
    expect(ebayDescriptionGradeLine('s')).toBe('Grade A: Excellent condition');
  });

  it('an unknown non-empty grade falls back to "Grade <value>" exactly as given', () => {
    expect(ebayDescriptionGradeLine('X')).toBe('Grade X');
    expect(ebayDescriptionGradeLine('E')).toBe('Grade E');
    expect(ebayDescriptionGradeLine('AA')).toBe('Grade AA');
  });

  it('a missing or empty grade has no line', () => {
    expect(ebayDescriptionGradeLine(null)).toBeUndefined();
    expect(ebayDescriptionGradeLine(undefined)).toBeUndefined();
    expect(ebayDescriptionGradeLine('')).toBeUndefined();
  });

  it('no grade line uses the word "AI" or an em dash', () => {
    for (const g of ['S', 'A', 'B', 'C', 'D', 'X']) {
      const line = ebayDescriptionGradeLine(g) as string;
      expect(line).not.toMatch(/\bAI\b/);
      expect(line).not.toContain(String.fromCharCode(8212));
    }
  });
});

describe('desiredEbayCondition is unchanged (golden grid)', () => {
  const GRADES: Array<string | null> = [null, 'S', 'A', 'B', 'C', 'D'];

  it('NEW is NEW for every grade', () => {
    for (const g of GRADES) expect(desiredEbayCondition('NEW', g)).toBe('NEW');
  });

  it('REFURBISHED is SELLER_REFURBISHED for every grade', () => {
    for (const g of GRADES) expect(desiredEbayCondition('REFURBISHED', g)).toBe('SELLER_REFURBISHED');
  });

  it('PARTS_OR_REPAIR is FOR_PARTS_OR_NOT_WORKING for every grade', () => {
    for (const g of GRADES) expect(desiredEbayCondition('PARTS_OR_REPAIR', g)).toBe('FOR_PARTS_OR_NOT_WORKING');
  });

  it('USED by grade: S, A, B -> USED_VERY_GOOD; C -> USED_GOOD; D -> USED_ACCEPTABLE; none -> USED_GOOD', () => {
    expect(desiredEbayCondition('USED', 'S')).toBe('USED_VERY_GOOD');
    expect(desiredEbayCondition('USED', 'A')).toBe('USED_VERY_GOOD');
    expect(desiredEbayCondition('USED', 'B')).toBe('USED_VERY_GOOD');
    expect(desiredEbayCondition('USED', 'C')).toBe('USED_GOOD');
    expect(desiredEbayCondition('USED', 'D')).toBe('USED_ACCEPTABLE');
    expect(desiredEbayCondition('USED', null)).toBe('USED_GOOD');
    expect(desiredEbayCondition('USED', undefined)).toBe('USED_GOOD');
  });

  it('no condition reads as used goods, decided by grade', () => {
    expect(desiredEbayCondition(null, 'A')).toBe('USED_VERY_GOOD');
    expect(desiredEbayCondition(null, 'C')).toBe('USED_GOOD');
    expect(desiredEbayCondition(null, 'D')).toBe('USED_ACCEPTABLE');
    expect(desiredEbayCondition(null, null)).toBe('USED_GOOD');
  });
});

describe('ebayController wiring (source pins)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'ebayController.ts'), 'utf8');

  it('buildConditionDescription uses the shared condition description builder, not a local label map', () => {
    expect(src).toContain('buildEbayConditionDescription(item)');
    expect(src).not.toContain('ebayDescriptionGradeLine(');
    expect(src).not.toContain('Mint condition');
    expect(src).not.toContain('gradeLabels');
  });

  it('the dead grade-to-conditionId map is gone', () => {
    expect(src).not.toContain('CONDITION_ID_MAP');
  });
});
