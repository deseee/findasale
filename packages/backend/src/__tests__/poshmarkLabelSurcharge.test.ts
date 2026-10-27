/**
 * 2026-10-27 (Patrick): Poshmark's label upgrade deducted from earnings. Up to 5 lb included; 5-10 lb $5; 10-15 lb $10;
 * 15-25 lb $15; over 25 lb the full USPS cost (estimated from this codebase's own rate tables). Pure, synthetic data.
 * KEEP IN SYNC with extension/tests/fas-posh-label-cost.test.js (same edges).
 */
import {
  poshmarkOverweightSurchargeUsd, poshmarkLabelInfo, poshmarkLabelNoteText, resolvePoshmarkWeight, resolvePoshmarkDims,
  uspsLabelEstimateUsd, lengthPlusGirth,
} from '../services/poshmarkLabelSurcharge';

describe('poshmarkOverweightSurchargeUsd tier edges', () => {
  const cases: Array<[number, number | null, boolean]> = [
    [80, 0, false], [80.01, 5, false], [160, 5, false], [160.01, 10, false],
    [240, 10, false], [240.01, 15, false], [400, 15, false],
  ];
  it.each(cases)('%p oz -> $%p', (oz, usd, full) => {
    const r = poshmarkOverweightSurchargeUsd(oz, null, { source: 'organizer' });
    expect(r.surchargeUsd).toBe(usd);
    expect(r.fullLabelCost).toBe(full);
    expect(r.source).toBe('organizer');
  });
  it('400.01 oz -> the full label cost: the caller estimate, else unknown (null)', () => {
    expect(poshmarkOverweightSurchargeUsd(400.01, null, { fullCostUsd: 43.1 })).toMatchObject({ surchargeUsd: 43.1, fullLabelCost: true });
    expect(poshmarkOverweightSurchargeUsd(400.01, null)).toMatchObject({ surchargeUsd: null, fullLabelCost: true });
  });
  it('400.01 oz with a zone uses the USPS estimate from the rate tables', () => {
    const r = poshmarkOverweightSurchargeUsd(400.01, { length: 20, width: 14, height: 10 }, { zone: 'z8' });
    expect(r.fullLabelCost).toBe(true);
    expect(typeof r.surchargeUsd).toBe('number');
    expect(r.surchargeUsd!).toBeGreaterThan(15);
    expect(r.surchargeUsd).toBe(uspsLabelEstimateUsd(400.01, { length: 20, width: 14, height: 10 }, 'z8'));
  });
  it('no weight -> null, source none', () => {
    for (const w of [null, undefined, 0, -3, NaN]) expect(poshmarkOverweightSurchargeUsd(w as number, null)).toEqual({ surchargeUsd: null, fullLabelCost: false, weightOz: null, weightLb: null, source: 'none' });
  });
  it('USPS cannot ship over 70 lb -> null estimate, never throws', () => {
    expect(uspsLabelEstimateUsd(80 * 16, null, 'z5')).toBeNull();
  });
});

describe('weight and size sources', () => {
  it('organizer weight wins over the estimate', () => {
    expect(resolvePoshmarkWeight({ packageWeightOz: 100, aiPackageWeightOz: 300 })).toEqual({ weightOz: 100, source: 'organizer' });
    expect(resolvePoshmarkWeight({ aiPackageWeightOz: 300 })).toEqual({ weightOz: 300, source: 'estimate' });
    expect(resolvePoshmarkWeight({})).toEqual({ weightOz: null, source: 'none' });
  });
  it('organizer dimensions (all three) win over the estimate; malformed estimates are ignored', () => {
    expect(resolvePoshmarkDims({ packageLengthIn: 10, packageWidthIn: 8, packageHeightIn: 2, aiPackageDimsJson: { length: 30, width: 30, height: 30 } })).toEqual({ length: 10, width: 8, height: 2 });
    expect(resolvePoshmarkDims({ packageLengthIn: 10, aiPackageDimsJson: { length: 30, width: 30, height: 30 } })).toEqual({ length: 30, width: 30, height: 30 });
    for (const bad of [null, 'x', [1, 2, 3], { length: 30 }, { length: 0, width: 5, height: 5 }]) expect(resolvePoshmarkDims({ aiPackageDimsJson: bad })).toBeNull();
    expect(lengthPlusGirth({ length: 6, width: 40, height: 14 })).toBe(80);
  });
});

describe('note text', () => {
  const note = (oz: number, source: 'organizer' | 'estimate' = 'organizer', lg: number | null = null, full?: number | null) =>
    poshmarkLabelNoteText(poshmarkOverweightSurchargeUsd(oz, null, { source, fullCostUsd: full }), lg);
  it('nothing at 80 oz and under', () => { expect(note(80)).toBe(''); });
  it('$5 just over 5 lb, estimated weight says so', () => {
    expect(note(80.01, 'estimate')).toBe('Poshmark will deduct $5.00 from your earnings for the heavier label (5.0 lb, estimated).');
  });
  it('$10 at 160.01 oz', () => {
    expect(note(160.01)).toBe('Poshmark will deduct $10.00 from your earnings for the heavier label (10.0 lb, from your saved package weight).');
  });
  it('$15 over 15 lb adds the more-than-one-box advice; 240 oz does not', () => {
    expect(note(240)).not.toMatch(/more than one box/);
    expect(note(240.01)).toBe('Poshmark will deduct $15.00 from your earnings for the heavier label (15.0 lb, from your saved package weight). Over 15 lb, ship it in more than one box if you can.');
  });
  it('over 25 lb: full cost with the USPS estimate, or plain "full USPS shipping cost" when unknown', () => {
    expect(note(400.01, 'organizer', null, 43.1)).toBe('Over 25 lb: Poshmark deducts the full shipping cost from your earnings, about $43.10 (USPS estimate) (25.0 lb, from your saved package weight). Ship it in more than one box if you can.');
    expect(note(400.01, 'organizer', null, null)).toBe('Over 25 lb: Poshmark deducts the full USPS shipping cost from your earnings (25.0 lb, from your saved package weight). Ship it in more than one box if you can.');
  });
  it('over 108 inches length plus girth adds the size warning', () => {
    expect(note(40, 'organizer', 109)).toBe("May be too big for Poshmark's label (over 108 inches length plus girth).");
    expect(note(40, 'organizer', 108)).toBe('');
  });
  it('plain English: no em dashes and never "AI"', () => {
    for (const oz of [80.01, 160.01, 240.01, 400.01]) {
      const t = note(oz, 'estimate', 120, 40);
      expect(t).not.toMatch(/\u2014/);
      expect(t).not.toMatch(/\bAI\b/);
    }
  });
  it('poshmarkLabelInfo puts it together from an item row', () => {
    const r = poshmarkLabelInfo({ aiPackageWeightOz: 178, aiPackageDimsJson: { length: 30, width: 30, height: 30 } });
    expect(r).toMatchObject({ surchargeUsd: 10, weightLb: 11.1, source: 'estimate', lengthPlusGirthIn: 150, fullLabelCost: false });
    expect(r.note).toBe("Poshmark will deduct $10.00 from your earnings for the heavier label (11.1 lb, estimated). May be too big for Poshmark's label (over 108 inches length plus girth).");
  });
});

describe('wiring: the extension gets the server-computed label cost on every item', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const src: string = require('fs').readFileSync(require('path').join(__dirname, '..', 'controllers', 'extensionController.ts'), 'utf8');
  it('getAutolistQueue and getExtensionItems both send poshmarkLabel (with the sale ZIP for the USPS zone)', () => {
    expect(src.match(/poshmarkLabel: poshmarkLabelPayload\(it, saleLocationById\.get\(it\.saleId \|\| ''\)\?\.zip \|\| null\),/g)?.length).toBe(2);
    const q = src.slice(src.indexOf('export const getAutolistQueue'));
    expect(q).toMatch(/aiPackageDimsJson: true/);
    expect(q).toMatch(/const eligibilityItem = \{ \.\.\.buildListingEligibilityItem\(it, \{ forNewListing: true \}\), originZip:/);
  });
  it('the payload carries surchargeUsd, weightLb and source', () => {
    expect(src).toMatch(/return \{ surchargeUsd: r\.surchargeUsd, fullLabelCost: r\.fullLabelCost, weightLb: r\.weightLb, source: r\.source, lengthPlusGirthIn: r\.lengthPlusGirthIn, note: r\.note \};/);
  });
});
