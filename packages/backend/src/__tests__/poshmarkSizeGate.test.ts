/**
 * (2026-10-14, Patrick "gate Poshmark") New Poshmark listings are kept off when the item is over 15 lb, over 30"
 * on a side, over 108" length plus girth, or has no package weight or size at all. The size and no-data limits
 * apply only to NEW listings (forNewListing: true) so they never queue removal of a listing already live, and no
 * other marketplace is affected. Pure function, synthetic data only.
 */
import { checkEligibility, lengthPlusGirthIn, EligibilityCheckItem } from '../services/marketplaceEligibilityRules';

const base = { category: 'Women > Tops', title: 'Blouse' };

describe('lengthPlusGirthIn', () => {
  it('uses the longest side plus twice the two shorter sides', () => {
    expect(lengthPlusGirthIn({ packageLengthIn: 40, packageWidthIn: 14, packageHeightIn: 6 })).toBe(40 + 2 * (14 + 6));
    expect(lengthPlusGirthIn({ packageLengthIn: 6, packageWidthIn: 40, packageHeightIn: 14 })).toBe(80);
  });
  it('returns null unless all three dimensions are present', () => {
    expect(lengthPlusGirthIn({ packageLengthIn: 40, packageWidthIn: 14 })).toBeNull();
    expect(lengthPlusGirthIn({})).toBeNull();
  });
});

describe('Poshmark new-listing gate', () => {
  const gate = (extra: Partial<EligibilityCheckItem>) => checkEligibility('POSHMARK', { ...base, forNewListing: true, ...extra });

  it('allows a small measured item', () => {
    expect(gate({ packageWeightOz: 12, packageLengthIn: 12, packageWidthIn: 10, packageHeightIn: 3 }).eligible).toBe(true);
  });
  it('blocks over 15 lb (240 oz), with or without forNewListing (existing rule, unchanged)', () => {
    expect(gate({ packageWeightOz: 241 }).eligible).toBe(false);
    expect(checkEligibility('POSHMARK', { ...base, packageWeightOz: 241 }).eligible).toBe(false);
    expect(gate({ packageWeightOz: 240 }).eligible).toBe(true);
  });
  it('blocks a longest side over 30 in (a bass guitar case)', () => {
    const r = gate({ packageWeightOz: 120, packageLengthIn: 48, packageWidthIn: 14, packageHeightIn: 5 });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/too large/i);
  });
  it('allows exactly 30 in on a side', () => {
    expect(gate({ packageWeightOz: 100, packageLengthIn: 30, packageWidthIn: 10, packageHeightIn: 8 }).eligible).toBe(true);
  });
  it('blocks length plus girth over 108 in even when no side is over 30 in', () => {
    // 30 + 2 * (30 + 30) = 150
    expect(gate({ packageWeightOz: 100, packageLengthIn: 30, packageWidthIn: 30, packageHeightIn: 30 }).eligible).toBe(false);
  });
  it('allows length plus girth at exactly 108 in', () => {
    // 30 + 2 * (24 + 15) = 108
    expect(gate({ packageWeightOz: 100, packageLengthIn: 30, packageWidthIn: 24, packageHeightIn: 15 }).eligible).toBe(true);
  });
  it('blocks an item with no package weight or size recorded, with a reason that says so', () => {
    const r = gate({});
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/no package weight or size/i);
    expect(gate({ packageWeightOz: null, aiPackageWeightOz: null }).eligible).toBe(false);
  });
  it('allows an item with only a weight, or only a measured side', () => {
    expect(gate({ packageWeightOz: 16 }).eligible).toBe(true);
    expect(gate({ aiPackageWeightOz: 16 }).eligible).toBe(true);
    expect(gate({ packageLengthIn: 12 }).eligible).toBe(true);
  });
  it('never applies the size or no-data limits without forNewListing (already-live takedown check)', () => {
    expect(checkEligibility('POSHMARK', { ...base }).eligible).toBe(true);
    expect(checkEligibility('POSHMARK', { ...base, packageWeightOz: 120, packageLengthIn: 48, packageWidthIn: 14, packageHeightIn: 5 }).eligible).toBe(true);
  });
  it('leaves every other marketplace alone (same answer with and without forNewListing, oversize or unmeasured)', () => {
    const big = { packageWeightOz: 120, packageLengthIn: 48, packageWidthIn: 14, packageHeightIn: 5 };
    for (const platform of ['FACEBOOK', 'CRAIGSLIST', 'GUMTREE_AU', 'GRAILED', 'VINTED'] as const) {
      expect(checkEligibility(platform, { ...base, forNewListing: true }).eligible).toBe(checkEligibility(platform, { ...base }).eligible);
      expect(checkEligibility(platform, { ...base, forNewListing: true, ...big }).eligible).toBe(checkEligibility(platform, { ...base, ...big }).eligible);
    }
    // Mercari keeps its own, unchanged ceilings: 34 in longest side blocks, an unmeasured item is still eligible.
    expect(checkEligibility('MERCARI', { ...base, forNewListing: true }).eligible).toBe(true);
    expect(checkEligibility('MERCARI', { ...base, forNewListing: true, packageWeightOz: 100, packageLengthIn: 48 }).eligible).toBe(false);
    expect(checkEligibility('MERCARI', { ...base, forNewListing: true, packageWeightOz: 100, packageLengthIn: 33 }).eligible).toBe(true);
  });
});
