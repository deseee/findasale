/**
 * 2026-10-27 (Patrick): Poshmark no longer excludes anything by weight or size; the label cost is a non-blocking note
 * (services/poshmarkLabelSurcharge.ts). The original 2026-10-14 header follows for history.
 * (2026-10-14, Patrick "gate Poshmark") New Poshmark listings are kept off when the item is over 15 lb, over 30"
 * on a side, over 108" length plus girth, or has no package weight or size at all. The size and no-data limits
 * apply only to NEW listings (forNewListing: true) so they never queue removal of a listing already live, and no
 * other marketplace is affected. Pure function, synthetic data only.
 */
import { checkEligibility, lengthPlusGirthIn, buildListingEligibilityItem, EligibilityCheckItem } from '../services/marketplaceEligibilityRules';

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

describe('Poshmark new-listing gate (2026-10-27: nothing blocked by weight or size, only noted)', () => {
  const gate = (extra: Partial<EligibilityCheckItem>) => checkEligibility('POSHMARK', { ...base, forNewListing: true, ...extra });

  it('allows a small measured item with no note', () => {
    expect(gate({ packageWeightOz: 12, packageLengthIn: 12, packageWidthIn: 10, packageHeightIn: 3 })).toEqual({ eligible: true, reason: null });
  });
  it('no longer blocks by weight: 15 lb, 25 lb and 40 lb stay eligible, new or live', () => {
    for (const oz of [241, 400, 640]) {
      expect(gate({ packageWeightOz: oz }).eligible).toBe(true);
      expect(checkEligibility('POSHMARK', { ...base, packageWeightOz: oz })).toEqual({ eligible: true, reason: null });
    }
  });
  it('no longer blocks by size: a 48 inch side or 150 inches length plus girth stays eligible, with a size note', () => {
    const r = gate({ packageWeightOz: 40, packageLengthIn: 48, packageWidthIn: 14, packageHeightIn: 5 });
    expect(r.eligible).toBe(true);
    expect(gate({ packageWeightOz: 40, packageLengthIn: 30, packageWidthIn: 30, packageHeightIn: 30 })).toEqual({
      eligible: true, reason: null, note: "May be too big for Poshmark's label (over 108 inches length plus girth).",
    });
    // exactly 108 is fine: no note
    expect(gate({ packageWeightOz: 40, packageLengthIn: 30, packageWidthIn: 24, packageHeightIn: 15 })).toEqual({ eligible: true, reason: null });
  });
  it('the size note falls back to the photo estimate (aiPackageDimsJson); organizer dimensions win', () => {
    expect(gate({ packageWeightOz: 40, aiPackageDimsJson: { length: 28, width: 25, height: 16 } }).note).toMatch(/over 108 inches length plus girth/);
    expect(gate({ packageWeightOz: 40, packageLengthIn: 12, packageWidthIn: 10, packageHeightIn: 4, aiPackageDimsJson: { length: 28, width: 25, height: 16 } }).note).toBeUndefined();
  });
  it('still blocks an item with no package weight or size recorded (unchanged), unless the photo estimate has a size', () => {
    const r = gate({});
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/no package weight or size/i);
    expect(gate({ packageWeightOz: null, aiPackageWeightOz: null }).eligible).toBe(false);
    expect(gate({ aiPackageDimsJson: { length: 10, width: 8, height: 4 } }).eligible).toBe(true);
    expect(gate({ aiPackageDimsJson: { length: 10 } }).eligible).toBe(false);
  });
  it('allows an item with only a weight, or only a measured side', () => {
    expect(gate({ packageWeightOz: 16 }).eligible).toBe(true);
    expect(gate({ aiPackageWeightOz: 16 }).eligible).toBe(true);
    expect(gate({ packageLengthIn: 12 }).eligible).toBe(true);
  });
  it('the label note says the exact deduction and where the weight came from', () => {
    expect(gate({ packageWeightOz: 178 }).note).toBe('Poshmark will deduct $10.00 from your earnings for the heavier label (11.1 lb, from your saved package weight).');
    expect(gate({ aiPackageWeightOz: 96 }).note).toBe('Poshmark will deduct $5.00 from your earnings for the heavier label (6.0 lb, estimated).');
    expect(gate({ packageWeightOz: 300 }).note).toBe('Poshmark will deduct $15.00 from your earnings for the heavier label (18.8 lb, from your saved package weight). Over 15 lb, ship it in more than one box if you can.');
    expect(gate({ packageWeightOz: 80 }).note).toBeUndefined();
    expect(gate({ packageWeightOz: 500, packageLengthIn: 20, packageWidthIn: 14, packageHeightIn: 10 }).note).toMatch(/^Over 25 lb: Poshmark deducts the full shipping cost from your earnings, about \$\d+\.\d\d \(USPS estimate\) \(31\.3 lb, from your saved package weight\)\. Ship it in more than one box if you can\.$/);
  });
  it('a blocking reason always wins over the note, and the note is never added for the live takedown check', () => {
    expect(gate({ packageWeightOz: 178, price: 1 })).toEqual({ eligible: false, reason: expect.stringMatching(/under \$5/) });
    expect(checkEligibility('POSHMARK', { ...base, packageWeightOz: 178 })).toEqual({ eligible: true, reason: null });
  });
  it('buildListingEligibilityItem passes aiPackageDimsJson through', () => {
    const it = buildListingEligibilityItem({ category: 'Home', title: 'Lamp', packageWeightOz: 40, aiPackageDimsJson: { length: 28, width: 25, height: 16 } }, { forNewListing: true });
    expect(it.aiPackageDimsJson).toEqual({ length: 28, width: 25, height: 16 });
    expect(checkEligibility('POSHMARK', it).note).toMatch(/108 inches/);
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
    expect(checkEligibility('MERCARI', { ...base, forNewListing: true, packageWeightOz: 100, packageLengthIn: 33 })).toEqual({ eligible: true, reason: null });
  });
});

describe('Poshmark $5 minimum price (new listings only)', () => {
  const small = { packageWeightOz: 8, packageLengthIn: 6, packageWidthIn: 4, packageHeightIn: 1 };
  const gate = (price: number | null) => checkEligibility('POSHMARK', { ...base, ...small, forNewListing: true, price });

  it('blocks $1, $2 and $4 (flat $2.95 fee leaves almost nothing)', () => {
    expect(gate(1).eligible).toBe(false);
    expect(gate(2).eligible).toBe(false);
    expect(gate(4).eligible).toBe(false);
    expect(gate(1).reason).toMatch(/under \$5/i);
  });
  it('allows exactly $5 and up; anything under $5 is blocked, with no rounding (2026-10-23: $4.99 used to round up and pass)', () => {
    expect(gate(5).eligible).toBe(true);
    expect(gate(5.0).eligible).toBe(true);
    expect(gate(5.01).eligible).toBe(true);
    expect(gate(4.99).eligible).toBe(false);
    expect(gate(4.6).eligible).toBe(false);
    expect(gate(4.4).eligible).toBe(false);
    expect(gate(25).eligible).toBe(true);
  });
  it('does not block when the price is unknown', () => {
    expect(gate(null).eligible).toBe(true);
  });
  it('never applies without forNewListing, so an already-live cheap listing is not queued for takedown', () => {
    expect(checkEligibility('POSHMARK', { ...base, ...small, price: 1 }).eligible).toBe(true);
  });
  it('leaves other marketplaces alone', () => {
    expect(checkEligibility('MERCARI', { ...base, forNewListing: true, price: 3 }).eligible).toBe(true);
    expect(checkEligibility('VINTED', { ...base, forNewListing: true, price: 1 }).eligible).toBe(
      checkEligibility('VINTED', { ...base, forNewListing: true }).eligible
    );
  });
});
