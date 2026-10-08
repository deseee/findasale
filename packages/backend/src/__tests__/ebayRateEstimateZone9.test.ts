/**
 * Zone 9 (HI/AK/PR/USVI) measured USPS Ground Advantage rates -- USPS_ZONE9_WEIGHT_RATES,
 * USPS_ZONE9_CUBIC_RATES, uspsZone9Rate (ebayRateEstimateService.ts). Source: live eBay
 * calculator, origin 49079, 2026-10-07.
 * RATE_TABLE (z8) is not exported, so the weight-row "z8 + step" assertion is omitted; the
 * cubic step pattern IS checked against the exported USPS_CUBIC_RATE_TABLE z8 column.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));

import {
  USPS_ZONE9_WEIGHT_RATES,
  USPS_ZONE9_CUBIC_RATES,
  USPS_CUBIC_RATE_TABLE,
  uspsZone9Rate,
} from '../services/ebayRateEstimateService';

const rateAt = (lb: number) => USPS_ZONE9_WEIGHT_RATES.find((r) => r.maxLb === lb)?.rate;

describe('USPS_ZONE9_WEIGHT_RATES', () => {
  it('has 4 sub-1lb rows plus 1..70 lb, strictly ascending maxLb', () => {
    expect(USPS_ZONE9_WEIGHT_RATES).toHaveLength(74);
    for (let i = 1; i < USPS_ZONE9_WEIGHT_RATES.length; i++) {
      expect(USPS_ZONE9_WEIGHT_RATES[i].maxLb).toBeGreaterThan(USPS_ZONE9_WEIGHT_RATES[i - 1].maxLb);
    }
  });

  it('sub-1lb rows are all 8.95', () => {
    for (const mx of [0.25, 0.5, 0.75, 0.9999]) expect(rateAt(mx)).toBe(8.95);
  });

  it('matches measured literals', () => {
    expect(rateAt(1)).toBe(11.22);
    expect(rateAt(10)).toBe(26.39);
    expect(rateAt(20)).toBe(42.14);
    expect(rateAt(25)).toBe(79.94);
    expect(rateAt(30)).toBe(104.30);
    expect(rateAt(50)).toBe(157.97);
    expect(rateAt(70)).toBe(199.01);
  });

  it('is non-decreasing in weight', () => {
    for (let i = 1; i < USPS_ZONE9_WEIGHT_RATES.length; i++) {
      expect(USPS_ZONE9_WEIGHT_RATES[i].rate).toBeGreaterThanOrEqual(USPS_ZONE9_WEIGHT_RATES[i - 1].rate);
    }
  });
});

describe('USPS_ZONE9_CUBIC_RATES', () => {
  it('uses the same tier labels/maxCuFt as USPS_CUBIC_RATE_TABLE', () => {
    expect(USPS_ZONE9_CUBIC_RATES.map((r) => [r.maxCuFt, r.tierLabel])).toEqual(
      USPS_CUBIC_RATE_TABLE.map((r) => [r.maxCuFt, r.tierLabel])
    );
  });

  it('equals z8 cubic plus the observed step (0.55 / 1.05 / 1.75) within 0.01', () => {
    USPS_ZONE9_CUBIC_RATES.forEach((r, i) => {
      const step = i < 3 ? 0.55 : i < 9 ? 1.05 : 1.75;
      expect(Math.abs(r.rate - (USPS_CUBIC_RATE_TABLE[i].z8 + step))).toBeLessThanOrEqual(0.011);
    });
  });
});

describe('uspsZone9Rate', () => {
  it('returns the weight price for a cubic-ineligible 5lb box (longest side > 22in)', () => {
    expect(uspsZone9Rate({ length: 30, width: 6, height: 6 }, 80)).toBe(rateAt(5));
  });

  it('returns the cheaper of weight and cubic', () => {
    // 6x6x6 -> Cubic 0.2 (12.39) vs 1lb weight (11.22): weight cheaper
    expect(uspsZone9Rate({ length: 6, width: 6, height: 6 }, 16)).toBe(11.22);
    // 9lb, 12x12x10 (0.833 cu ft -> Cubic 0.9 = 24.94) vs 9lb weight 25.14: cubic cheaper
    expect(uspsZone9Rate({ length: 12, width: 12, height: 10 }, 144)).toBe(24.94);
    // 8lb weight (23.95) beats the same cubic tier (24.94)
    expect(uspsZone9Rate({ length: 12, width: 12, height: 10 }, 128)).toBe(23.95);
  });

  it('sub-1lb light package prices at 8.95', () => {
    expect(uspsZone9Rate({ length: 6, width: 4, height: 2 }, 8)).toBe(8.95);
  });

  it('returns null when billable weight exceeds 70 lb', () => {
    expect(uspsZone9Rate({ length: 30, width: 20, height: 20 }, 71 * 16)).toBeNull();
  });
});
