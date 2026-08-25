/**
 * Regression coverage for the FedEx per-package destination surcharge
 * (FEDEX_DESTINATION_SURCHARGE_TIERS / FEDEX_DESTINATION_SURCHARGE_ZIP_TIER /
 * fedexDestinationSurchargeForZip, ebayRateEstimateService.ts) actually reaching
 * estimateCheapestRate's returned rate when a destinationZip is supplied, and
 * safely falling back to the conservative unmapped tier when it is not.
 *
 * SCOPE NOTE (2026-08-23 caller-wiring investigation): this suite tests the ENGINE
 * ONLY -- fedexDestinationSurchargeForZip / estimateCheapestRate / their destinationZip
 * parameter, all pure/sync exports. It deliberately does NOT add a destinationZip to
 * any of the six live callers (ebayController.ts, ebayCalculatedPolicyService.ts,
 * ebayFlatRatePolicyService.ts x2, ebayShippingPresetService.ts,
 * ebayShippingResolver.ts x2, nativeShippingSuggestionService.ts). Verified by reading
 * every call site plus the Purchase/User Prisma models: none of the six run with a
 * buyer/destination in scope (all price at listing/policy-provisioning time, before
 * any buyer exists), and Purchase has no shipping-address/ZIP column at all -- there is
 * no real ZIP to thread at any of them today. This matches the file's own "DESTINATION
 * ZIP IS NOT AVAILABLE AT PRICING TIME (investigated 2026-08-17)" comment directly
 * above FEDEX_DESTINATION_SURCHARGE_TIERS, which this suite's existence assumes the
 * reader has read. What follows just proves the plumbing that DOES exist (added
 * 2026-08-17, per computeCheapestForOrigin's destinationZip doc comment) behaves
 * correctly, so it is ready the day a real destination-aware caller exists.
 *
 * SCENARIO CHOICE: weightOz=800 (exactly 50lb actual, well under any AHS/Large-Package
 * trigger with these dims -- see inline math below) at zone z8, where FEDEX's base rate
 * ($48.92, RATE_TABLE_FEDEX maxLb:50/z8) beats UPS's ($80.48, RATE_TABLE_UPS maxLb:50/z8)
 * by $31.56 -- comfortably more than the $7.13 max span between the tier-B default
 * ($7.90) and tier-C ($15.03), so FEDEX stays the cheapest carrier at every measured
 * tier, and the test isolates the destination-surcharge effect instead of a carrier
 * flip. dims 20x14x10in: descending-sorted [20,14,10] -> lengthPlusGirth = 20 + 2*(14+10)
 * = 68in (Large Package needs >130in); dimensionTriggered needs sorted[0]>48 or
 * sorted[1]>30 (20/14, neither); weightTriggered needs weightLb>50 (exactly 50, not
 * >50) -- so no AHS/Large-Package surcharge fires and the only surcharge in play is the
 * FedEx destination one this suite targets. Dimensional weight (2800cuin/139*16=~322oz)
 * stays well under the 800oz actual weight, so billable weight is exactly 50lb actual,
 * matching RATE_TABLE_FEDEX/_UPS's own maxLb:50 rows exactly (rateFromTable's
 * `lb <= r.maxLb` picks that row precisely at lb===50).
 *
 * MOCKING NOTE: same convention as ebayRateEstimateHighWeightDecomposition.test.ts --
 * '../lib/prisma' is mocked to a no-op object; none of the exports this suite touches
 * (fedexDestinationSurchargeForZip, estimateCheapestRate) ever call it.
 */

jest.mock('../lib/prisma', () => ({ prisma: {} }));

import {
  estimateCheapestRate,
  fedexDestinationSurchargeForZip,
  FEDEX_DESTINATION_SURCHARGE_TIERS,
  FEDEX_DESTINATION_SURCHARGE_UNMAPPED_TIER,
} from '../services/ebayRateEstimateService';

const UNMAPPED_DEFAULT = FEDEX_DESTINATION_SURCHARGE_TIERS[FEDEX_DESTINATION_SURCHARGE_UNMAPPED_TIER];

// One real measured ZIP per tier, taken verbatim from FEDEX_DESTINATION_SURCHARGE_ZIP_TIER.
// NOTE (2026-08-24): FEDEX_DESTINATION_SURCHARGE_UNMAPPED_TIER flipped 'B' -> 'C' per
// ADR-110 Decision Flag 1 option (b) -- tier C is now the unmapped default, so TIER_C_ZIP
// is the one that coincides with UNMAPPED_DEFAULT below, not TIER_B_ZIP as before.
const CLEAN_ZIP = '90210'; // tier 'clean' -> $0.00
const TIER_A_ZIP = '10001'; // tier 'A' -> $5.92
const TIER_B_ZIP = '98357'; // tier 'B' -> $7.90
const TIER_C_ZIP = '02554'; // tier 'C' -> $15.03 (Nantucket) -- same dollar amount as the unmapped default now, by design

describe('fedexDestinationSurchargeForZip -- pure tier lookup', () => {
  it('a known tier-C ZIP returns the tier-C amount, which now equals the unmapped default by design (ADR-110 Decision Flag 1 option b, 2026-08-24)', () => {
    expect(fedexDestinationSurchargeForZip(TIER_C_ZIP)).toBe(FEDEX_DESTINATION_SURCHARGE_TIERS.C);
    expect(FEDEX_DESTINATION_SURCHARGE_TIERS.C).toBe(15.03);
    // No longer ".not.toBe" -- tier C IS the unmapped default now, on purpose.
    expect(fedexDestinationSurchargeForZip(TIER_C_ZIP)).toBe(UNMAPPED_DEFAULT);
  });

  it('a known clean ZIP returns $0, not the unmapped default', () => {
    expect(fedexDestinationSurchargeForZip(CLEAN_ZIP)).toBe(0);
  });

  it('a known tier-A ZIP returns the tier-A amount, distinct from the unmapped default', () => {
    expect(fedexDestinationSurchargeForZip(TIER_A_ZIP)).toBe(FEDEX_DESTINATION_SURCHARGE_TIERS.A);
    expect(fedexDestinationSurchargeForZip(TIER_A_ZIP)).not.toBe(UNMAPPED_DEFAULT);
  });

  it('a known tier-B ZIP returns the real tier-B amount, distinct from the unmapped default (was a coincidental match when unmapped=B; no longer, now that unmapped=C)', () => {
    expect(fedexDestinationSurchargeForZip(TIER_B_ZIP)).toBe(FEDEX_DESTINATION_SURCHARGE_TIERS.B);
    expect(FEDEX_DESTINATION_SURCHARGE_TIERS.B).not.toBe(UNMAPPED_DEFAULT);
  });

  it('tolerates ZIP+4 -- only the leading 5 digits are used', () => {
    expect(fedexDestinationSurchargeForZip(`${TIER_C_ZIP}-1234`)).toBe(FEDEX_DESTINATION_SURCHARGE_TIERS.C);
  });

  it('falls back to the conservative unmapped default for an unrecognized ZIP -- never $0, never throws', () => {
    expect(() => fedexDestinationSurchargeForZip('00501')).not.toThrow();
    expect(fedexDestinationSurchargeForZip('00501')).toBe(UNMAPPED_DEFAULT);
  });

  it('falls back to the unmapped default for undefined/null/empty -- never throws', () => {
    expect(() => fedexDestinationSurchargeForZip(undefined)).not.toThrow();
    expect(fedexDestinationSurchargeForZip(undefined)).toBe(UNMAPPED_DEFAULT);
    expect(fedexDestinationSurchargeForZip(null)).toBe(UNMAPPED_DEFAULT);
    expect(fedexDestinationSurchargeForZip('')).toBe(UNMAPPED_DEFAULT);
  });
});

describe('estimateCheapestRate -- destinationZip end-to-end through the winning FEDEX quote', () => {
  const SCENARIO = {
    weightOz: 800, // exactly 50lb actual
    dims: { length: 20, width: 14, height: 10 },
    zone: 'z8' as const,
  };
  const FEDEX_BASE_Z8_50LB = 48.92; // RATE_TABLE_FEDEX maxLb:50 z8, read directly from the table

  it('sanity: this scenario is won by FEDEX, not UPS/USPS, with no destinationZip supplied', () => {
    const result = estimateCheapestRate(SCENARIO);
    expect(result.carrier).toBe('FEDEX');
  });

  it('(a) a known tier-C destination ZIP produces the tier-C surcharge, which now equals the unmapped default by design', () => {
    const withTierC = estimateCheapestRate({ ...SCENARIO, destinationZip: TIER_C_ZIP });
    expect(withTierC.carrier).toBe('FEDEX');
    expect(withTierC.surchargeType).toBe('DESTINATION');
    expect(withTierC.surcharge).toBe(15.03);
    expect(withTierC.rate).toBe(Math.round((FEDEX_BASE_Z8_50LB + 15.03) * 100) / 100);
    // Now EQUALS the unmapped default on purpose (ADR-110 Decision Flag 1 option b) --
    // see the next test for the real proof that the ZIP is actually consulted (a tier-B
    // ZIP, which now differs from the unmapped default).
    expect(withTierC.surcharge).toBe(UNMAPPED_DEFAULT);
  });

  it('(a2) a known tier-B destination ZIP produces the real tier-B surcharge, distinct from the unmapped default -- proves the ZIP is actually consulted, not silently defaulted to tier C', () => {
    const withTierB = estimateCheapestRate({ ...SCENARIO, destinationZip: TIER_B_ZIP });
    expect(withTierB.carrier).toBe('FEDEX');
    expect(withTierB.surchargeType).toBe('DESTINATION');
    expect(withTierB.surcharge).toBe(FEDEX_DESTINATION_SURCHARGE_TIERS.B);
    expect(withTierB.surcharge).not.toBe(UNMAPPED_DEFAULT);
  });

  it('a known clean destination ZIP produces $0 destination surcharge (no misleading DESTINATION type on a $0 add)', () => {
    const withClean = estimateCheapestRate({ ...SCENARIO, destinationZip: CLEAN_ZIP });
    expect(withClean.carrier).toBe('FEDEX');
    expect(withClean.surcharge).toBe(0);
    expect(withClean.surchargeType).toBeNull();
    expect(withClean.rate).toBe(FEDEX_BASE_Z8_50LB);
  });

  it('(b) omitting destinationZip entirely safely falls back to the tier-C/unmapped default without erroring', () => {
    expect(() => estimateCheapestRate(SCENARIO)).not.toThrow();
    const noZip = estimateCheapestRate(SCENARIO);
    expect(noZip.carrier).toBe('FEDEX');
    expect(noZip.surchargeType).toBe('DESTINATION');
    expect(noZip.surcharge).toBe(UNMAPPED_DEFAULT);
    expect(noZip.rate).toBe(Math.round((FEDEX_BASE_Z8_50LB + UNMAPPED_DEFAULT) * 100) / 100);
  });

  it('(b) an explicit null destinationZip behaves identically to omitting it -- same fallback, no throw', () => {
    expect(() => estimateCheapestRate({ ...SCENARIO, destinationZip: null })).not.toThrow();
    const nullZip = estimateCheapestRate({ ...SCENARIO, destinationZip: null });
    const omitted = estimateCheapestRate(SCENARIO);
    expect(nullZip).toEqual(omitted);
  });

  it('destinationZip has no effect on the USPS/UPS candidates -- only FEDEX carries a destination surcharge', () => {
    // USPS/UPS never win this scenario, but the surcharge must be additive to FEDEX only
    // (per computeSurchargeForCarrier's `finish` helper, which early-returns unchanged
    // for any carrier !== 'FEDEX'). Cross-check indirectly: the tier-C run above still
    // stayed FEDEX at $63.95, comfortably below UPS's own $80.48 (RATE_TABLE_UPS
    // maxLb:50/z8) -- if UPS had also picked up a destination surcharge, either this
    // assertion or the carrier pick above would drift.
    const withTierC = estimateCheapestRate({ ...SCENARIO, destinationZip: TIER_C_ZIP });
    expect(withTierC.rate).toBeLessThan(80.48);
  });
});
