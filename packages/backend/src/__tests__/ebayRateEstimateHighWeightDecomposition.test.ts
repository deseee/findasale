/**
 * Regression coverage for the FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION re-anchor
 * (2026-08-22) in services/ebayRateEstimateService.ts.
 *
 * WHAT THIS SUITE EXISTS FOR
 *
 *   FEDEX_HIGH_WEIGHT_TOTAL_TABLE (>=70lb FedEx pricing) used to hold only real eBay
 *   TOTALS with accessorials baked in invisibly, unlike the <70lb tables which were
 *   already re-anchored to "base rate + itemized accessorial surcharges" so surcharge
 *   changes compose cleanly. This pass adds FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION,
 *   which itemizes the maxLb:70 row into a real `base` (RATE_TABLE_FEDEX's own 70lb row)
 *   and an exact `surcharge` residual -- but deliberately leaves maxLb:90/110/130/150
 *   undecomposed (`base: null, surcharge: null`), because no independent FedEx base
 *   freight figure exists above 70lb anywhere in this file, and the file's own
 *   2026-08-17 audit (the "ANCHOR STATUS OF THIS TABLE" comment directly above
 *   FEDEX_HIGH_WEIGHT_TOTAL_TABLE) explicitly rejects fabricating one as worse than
 *   leaving those rows composed.
 *
 *   Two things must hold and are asserted here:
 *     1. PURE DECOMPOSITION, NOT A PRICING CHANGE -- base+surcharge must sum back to
 *        FEDEX_HIGH_WEIGHT_TOTAL_TABLE's existing 70lb total, to the penny, at every
 *        zone. This is the "components sum back to the same numbers" requirement.
 *     2. REGRESSION SAFETY -- FEDEX_HIGH_WEIGHT_TOTAL_TABLE's own literal values (the
 *        numbers estimateCheapestRate actually charges organizers) are byte-for-byte
 *        identical to what they were before this pass, for every maxLb/zone combination
 *        in the table. Nothing about the shipped price changed.
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
 * Snapshot of FEDEX_HIGH_WEIGHT_TOTAL_TABLE as it stood immediately before this pass
 * (verbatim from the file, unedited by this change). If a future edit to the real table
 * ever changes one of these numbers, this test should fail loudly -- that is the point:
 * this decomposition pass must never be the thing that silently moves a shipped price.
 */
const PRE_CHANGE_FEDEX_HIGH_WEIGHT_TOTAL_TABLE = [
  { maxLb: 70, z1: 77.51, z2: 83.44, z3: 87.24, z4: 90.81, z5: 103.70, z6: 103.70, z7: 117.09, z8: 124.99 },
  { maxLb: 90, z1: 90.96, z2: 96.88, z3: 97.32, z4: 100.75, z5: 111.61, z6: 111.61, z7: 129.52, z8: 129.52 },
  { maxLb: 110, z1: 101.30, z2: 107.22, z3: 106.66, z4: 109.37, z5: 119.50, z6: 119.50, z7: 135.43, z8: 135.43 },
  { maxLb: 130, z1: 359.76, z2: 365.68, z3: 383.70, z4: 387.56, z5: 442.72, z6: 442.72, z7: 468.81, z8: 468.81 },
  { maxLb: 150, z1: 367.95, z2: 373.88, z3: 393.42, z4: 398.09, z5: 453.60, z6: 453.60, z7: 477.83, z8: 477.83 },
];

describe('FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION -- base + surcharge re-anchor', () => {
  it('maxLb:70 -- base + surcharge sums back to the existing total, to the penny, at every zone', () => {
    const row70 = FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION.find((r) => r.maxLb === 70);
    expect(row70).toBeDefined();
    expect(row70!.base).not.toBeNull();
    expect(row70!.surcharge).not.toBeNull();

    const totalRow = FEDEX_HIGH_WEIGHT_TOTAL_TABLE.find((r) => r.maxLb === 70)!;

    for (const zone of ZONES) {
      const base = row70!.base![zone];
      const surcharge = row70!.surcharge![zone];
      const recombined = Math.round((base + surcharge) * 100) / 100;
      expect(recombined).toBe(totalRow[zone]);
    }
  });

  it('maxLb:90/110/130/150 -- explicitly left undecomposed (base/surcharge null), not fabricated', () => {
    const undecomposedRows = [90, 110, 130, 150];
    for (const maxLb of undecomposedRows) {
      const row = FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION.find((r) => r.maxLb === maxLb);
      expect(row).toBeDefined();
      expect(row!.base).toBeNull();
      expect(row!.surcharge).toBeNull();
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
