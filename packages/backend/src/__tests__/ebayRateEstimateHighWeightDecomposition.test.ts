/**
 * Regression coverage for the FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION re-anchor
 * (2026-08-22, extended 2026-08-24) in services/ebayRateEstimateService.ts.
 *
 * WHAT THIS SUITE EXISTS FOR
 *
 *   FEDEX_HIGH_WEIGHT_TOTAL_TABLE (>=70lb FedEx pricing) used to hold only real eBay
 *   TOTALS with accessorials baked in invisibly, unlike the <70lb tables which were
 *   already re-anchored to "base rate + itemized accessorial surcharges" so surcharge
 *   changes compose cleanly. The 2026-08-22 pass added
 *   FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION, itemizing the maxLb:70 row into a real
 *   `base` (RATE_TABLE_FEDEX's own 70lb row) and an exact `surcharge` residual, while
 *   deliberately leaving maxLb:90/110/130/150 undecomposed (`base: null, surcharge: null`)
 *   because no independent FedEx base freight figure existed above 70lb anywhere in this
 *   file at the time.
 *
 *   The 2026-08-24 pass closed that gap AS AN ESTIMATE, not a live measurement: it fetched
 *   fedex.com/ratetools/documents2/GroundNoSvc.pdf (FedEx's own published Ground rate card,
 *   1-150lb x zones 2-8) and used it, combined with the one real negotiated-vs-published
 *   ratio this file has (from the 70lb row), to model base/surcharge for 90/110/130/150lb
 *   too. See the "RE-ANCHOR OF FEDEX_HIGH_WEIGHT_TOTAL_TABLE" header comment directly above
 *   FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION in the service file for the full method and
 *   its stated confidence level (REAL for maxLb:70, MODELLED -- not real-anchored, not a
 *   live A/B -- for maxLb:90/110/130/150).
 *
 *   Three things must hold and are asserted here:
 *     1. PURE DECOMPOSITION, NOT A PRICING CHANGE -- base+surcharge must sum back to
 *        FEDEX_HIGH_WEIGHT_TOTAL_TABLE's existing total, to the penny, at every zone, for
 *        EVERY row (70/90/110/130/150), not just the real-anchored one.
 *     2. NO NEW SHORTFALL -- surcharge (the residual) must never be negative anywhere;
 *        a negative residual would mean the modelled base exceeded the real observed
 *        total, i.e. the estimate would be internally inconsistent.
 *     3. REGRESSION SAFETY -- FEDEX_HIGH_WEIGHT_TOTAL_TABLE's own literal values (the
 *        numbers estimateCheapestRate actually charges organizers) are byte-for-byte
 *        identical to what they were before this pass, for every maxLb/zone combination
 *        in the table. Nothing about the shipped price changed -- this is a decomposition
 *        of existing numbers, never a repricing.
 *
 * MOCKING NOTE: ebayRateEstimateService.ts unconditionally imports the shared Prisma
 * singleton (`import { prisma } from '../lib/prisma'`), even though none of the exports
 * this suite touches ever call it. '../lib/prisma' is mocked to a no-op object so this
 * suite runs as a pure-data test with no database, no network, no environment setup --
 * matching utils/__tests__/ebayPolicyParser.standardEnvelope.test.ts's "pure functions
 * only" convention for this kind of table/constant test.
 */

jest.mock('../lib/prisma', () => ({ prisma: {} }));

import {
  FEDEX_HIGH_WEIGHT_TOTAL_TABLE,
  FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION,
} from '../services/ebayRateEstimateService';
import type { ZoneKey } from '../services/ebayRateEstimateService';

const ZONES: ZoneKey[] = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z8'];

/**
 * Snapshot of FEDEX_HIGH_WEIGHT_TOTAL_TABLE as it stood immediately before the 2026-08-22
 * pass (verbatim from the file, unedited by either the 2026-08-22 or 2026-08-24 pass). If a
 * future edit to the real table ever changes one of these numbers, this test should fail
 * loudly -- that is the point: this decomposition work must never be the thing that
 * silently moves a shipped price.
 */
const PRE_CHANGE_FEDEX_HIGH_WEIGHT_TOTAL_TABLE = [
  { maxLb: 70, z1: 77.51, z2: 83.44, z3: 87.24, z4: 90.81, z5: 103.70, z6: 103.70, z7: 117.09, z8: 124.99 },
  { maxLb: 90, z1: 90.96, z2: 96.88, z3: 97.32, z4: 100.75, z5: 111.61, z6: 111.61, z7: 129.52, z8: 129.52 },
  { maxLb: 110, z1: 101.30, z2: 107.22, z3: 106.66, z4: 109.37, z5: 119.50, z6: 119.50, z7: 135.43, z8: 135.43 },
  { maxLb: 130, z1: 359.76, z2: 365.68, z3: 383.70, z4: 387.56, z5: 442.72, z6: 442.72, z7: 468.81, z8: 468.81 },
  { maxLb: 150, z1: 367.95, z2: 373.88, z3: 393.42, z4: 398.09, z5: 453.60, z6: 453.60, z7: 477.83, z8: 477.83 },
];

describe('FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION -- base + surcharge re-anchor', () => {
  it('every row (70/90/110/130/150) -- base + surcharge sums back to the existing total, to the penny, at every zone', () => {
    for (const maxLb of [70, 90, 110, 130, 150]) {
      const row = FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION.find((r) => r.maxLb === maxLb);
      expect(row).toBeDefined();
      expect(row!.base).not.toBeNull();
      expect(row!.surcharge).not.toBeNull();

      const totalRow = FEDEX_HIGH_WEIGHT_TOTAL_TABLE.find((r) => r.maxLb === maxLb)!;

      for (const zone of ZONES) {
        const base = row!.base![zone];
        const surcharge = row!.surcharge![zone];
        const recombined = Math.round((base + surcharge) * 100) / 100;
        expect(recombined).toBe(totalRow[zone]);
      }
    }
  });

  it('every row -- surcharge residual is never negative (no internally-inconsistent estimate, no new shortfall)', () => {
    for (const maxLb of [70, 90, 110, 130, 150]) {
      const row = FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION.find((r) => r.maxLb === maxLb)!;
      for (const zone of ZONES) {
        expect(row.surcharge![zone]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('maxLb:90/110/130/150 base is monotonically non-decreasing with weight, at every zone (sanity check on the modelled estimate)', () => {
    const weights = [90, 110, 130, 150];
    for (const zone of ZONES) {
      let prevBase = -Infinity;
      for (const maxLb of weights) {
        const row = FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION.find((r) => r.maxLb === maxLb)!;
        const base = row.base![zone];
        expect(base).toBeGreaterThanOrEqual(prevBase);
        prevBase = base;
      }
    }
  });

  it('representative maxLb:90/110/130/150 weight/zone points match the values derived from GroundNoSvc.pdf this pass', () => {
    // Spot-checks 3 representative points across the newly-modelled rows (one per zone
    // family: a low zone, a mid zone, and a high zone at two different weights) against
    // the exact base/surcharge this pass computed from fedex.com/ratetools/documents2/
    // GroundNoSvc.pdf's published 90/110/130/150lb rows and RATE_TABLE_FEDEX's real 70lb
    // row (see the service file's header comment for the full derivation).
    const samples: Array<{ maxLb: number; zone: ZoneKey; base: number; surcharge: number }> = [
      { maxLb: 90, zone: 'z1', base: 43.30, surcharge: 47.66 },
      { maxLb: 110, zone: 'z5', base: 57.61, surcharge: 61.89 },
      { maxLb: 130, zone: 'z8', base: 90.64, surcharge: 378.17 },
      { maxLb: 150, zone: 'z4', base: 82.11, surcharge: 315.98 },
    ];

    for (const { maxLb, zone, base, surcharge } of samples) {
      const row = FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION.find((r) => r.maxLb === maxLb)!;
      expect(row.base![zone]).toBe(base);
      expect(row.surcharge![zone]).toBe(surcharge);
    }
  });

  it('covers every row of FEDEX_HIGH_WEIGHT_TOTAL_TABLE exactly once, in the same maxLb order', () => {
    const decompositionMaxLbs = FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION.map((r) => r.maxLb);
    const tableMaxLbs = FEDEX_HIGH_WEIGHT_TOTAL_TABLE.map((r) => r.maxLb);
    expect(decompositionMaxLbs).toEqual(tableMaxLbs);
  });

  describe('regression safety -- FEDEX_HIGH_WEIGHT_TOTAL_TABLE itself is unchanged', () => {
    it.each(PRE_CHANGE_FEDEX_HIGH_WEIGHT_TOTAL_TABLE.map((row) => [row.maxLb, row]))(
      'maxLb:%s row matches the pre-decomposition snapshot at every zone',
      (_maxLb, expectedRow) => {
        const actualRow = FEDEX_HIGH_WEIGHT_TOTAL_TABLE.find(
          (r) => r.maxLb === (expectedRow as typeof PRE_CHANGE_FEDEX_HIGH_WEIGHT_TOTAL_TABLE[number]).maxLb,
        );
        expect(actualRow).toEqual(expectedRow);
      },
    );

    it('sample weight/zone combinations produce the identical FINAL total as before this change', () => {
      // Anchor weights only (70/90/110/130/150) -- interpolateHighWeightTotal is a private
      // helper not exported by the service, but it is a pure function of
      // FEDEX_HIGH_WEIGHT_TOTAL_TABLE's literal values, which the assertions above already
      // pin byte-for-byte to their pre-change snapshot. Identical table => identical
      // interpolation output for any weight, anchor or interpolated.
      const samples: Array<{ maxLb: number; zone: ZoneKey; expected: number }> = [
        { maxLb: 70, zone: 'z1', expected: 77.51 },
        { maxLb: 70, zone: 'z8', expected: 124.99 },
        { maxLb: 90, zone: 'z4', expected: 100.75 },
        { maxLb: 110, zone: 'z7', expected: 135.43 },
        { maxLb: 130, zone: 'z5', expected: 442.72 },
        { maxLb: 150, zone: 'z2', expected: 373.88 },
      ];

      for (const { maxLb, zone, expected } of samples) {
        const row = FEDEX_HIGH_WEIGHT_TOTAL_TABLE.find((r) => r.maxLb === maxLb)!;
        expect(row[zone]).toBe(expected);
      }
    });
  });
});
