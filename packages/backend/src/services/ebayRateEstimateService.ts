/**
 * ebayRateEstimateService — eBay-calibrated USPS Ground Advantage rate estimator.
 *
 * Fallback for when the eBay Logistics API is unavailable (e.g. organizer hasn't
 * re-authorized with sell.logistics scope). When a live token is available, callers
 * should prefer getEbayLiveShippingRate() in ebayController.ts.
 *
 * Rate table source: Pirate Ship USPS Ground Advantage, effective 2026-04-26.
 * Same tier as eBay negotiated rates (USPS Connect eCommerce / below-commercial).
 */

interface RateBucket {
  estimatedRate: number;
  basis: 'actual' | 'dimensional';
  service: string;
}

const memoryCache = new Map<string, RateBucket>();

export interface RateEstimateInput {
  weightOz: number;
  dims?: { length?: number | null; width?: number | null; height?: number | null } | null;
  fromZip?: string | null;
  toZip?: string | null;
  service?: string;
}

const DIM_DIVISOR = 166; // USPS dimensional divisor (cubic inches per pound)

/**
 * Pirate Ship USPS Ground Advantage rates, effective 2026-04-26 (below-commercial tier).
 * eBay uses the same USPS Connect eCommerce rate tier. These rates are ±5-10% of eBay
 * label costs. Zone columns are averages of USPS zones 1+2 (z12), 3+4 (z34), 5, 6, 7, 8.
 * maxLb = inclusive upper bound in pounds. All prices in USD.
 */
const RATE_TABLE: Array<{ maxLb: number; z12: number; z34: number; z5: number; z6: number; z7: number; z8: number }> = [
  { maxLb: 0.25,   z12: 5.54,  z34: 5.68,  z5: 5.83,   z6: 6.00,   z7: 6.13,   z8: 6.36  },  // 1–4 oz
  { maxLb: 0.5,    z12: 6.09,  z34: 6.24,  z5: 6.36,   z6: 6.44,   z7: 6.56,   z8: 6.74  },  // 5–8 oz
  { maxLb: 0.75,   z12: 6.21,  z34: 6.36,  z5: 6.52,   z6: 6.74,   z7: 6.90,   z8: 7.13  },  // 9–12 oz
  { maxLb: 0.9999, z12: 6.94,  z34: 7.38,  z5: 7.69,   z6: 7.86,   z7: 8.07,   z8: 8.40  },  // 13–15.99 oz
  { maxLb: 1,      z12: 7.65,  z34: 8.08,  z5: 8.74,   z6: 9.63,   z7: 9.98,   z8: 10.67 },  // 1 lb
  { maxLb: 2,      z12: 8.04,  z34: 8.39,  z5: 9.95,   z6: 11.58,  z7: 12.00,  z8: 12.87 },
  { maxLb: 3,      z12: 8.65,  z34: 9.41,  z5: 11.57,  z6: 13.59,  z7: 14.36,  z8: 15.75 },
  { maxLb: 5,      z12: 9.73,  z34: 10.58, z5: 13.48,  z6: 15.89,  z7: 17.12,  z8: 19.19 },
  { maxLb: 7,      z12: 9.99,  z34: 11.26, z5: 14.90,  z6: 17.65,  z7: 19.23,  z8: 21.83 },
  { maxLb: 10,     z12: 12.09, z34: 13.81, z5: 16.76,  z6: 19.94,  z7: 21.97,  z8: 25.34 },
  { maxLb: 14,     z12: 14.90, z34: 16.47, z5: 20.38,  z6: 24.14,  z7: 26.99,  z8: 31.53 },
  { maxLb: 20,     z12: 16.76, z34: 18.85, z5: 24.93,  z6: 30.32,  z7: 34.67,  z8: 40.39 },
  { maxLb: 30,     z12: 30.92, z34: 41.10, z5: 59.28,  z6: 71.88,  z7: 84.24,  z8: 96.60 },
  { maxLb: 50,     z12: 44.92, z34: 59.80, z5: 89.60,  z6: 109.94, z7: 129.95, z8: 150.27 },
  { maxLb: 70,     z12: 55.48, z34: 71.67, z5: 110.97, z6: 137.46, z7: 163.73, z8: 191.31 },
];

/**
 * Crude zone estimate from the first digit of from/to ZIPs.
 * When ZIPs are unknown, default to z5 (conservative mid-zone).
 */
function estimateZoneKey(fromZip?: string | null, toZip?: string | null): 'z12' | 'z34' | 'z5' | 'z6' | 'z7' | 'z8' {
  if (!fromZip || !toZip || fromZip.length < 1 || toZip.length < 1) {
    return 'z5'; // unknown destination → mid-zone conservative estimate
  }
  const a = parseInt(fromZip[0], 10);
  const b = parseInt(toZip[0], 10);
  if (isNaN(a) || isNaN(b)) return 'z5';
  const diff = Math.abs(a - b);
  if (diff <= 0) return 'z12';
  if (diff === 1) return 'z34';
  if (diff === 2) return 'z5';
  if (diff === 3) return 'z6';
  if (diff === 4) return 'z7';
  return 'z8';
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Estimate the buyer-paid shipping rate for an item.
 * Returns eBay-approximate discounted rate, dimensional weight basis, and service name.
 * Accuracy: ±5-15% of actual eBay rate. Use getEbayLiveShippingRate() when possible.
 */
export function estimateBuyerShippingRate(input: RateEstimateInput): RateBucket {
  const service = input.service || 'USPS_GROUND_ADVANTAGE';
  const actualOz = Math.max(0, input.weightOz || 0);

  // Dimensional weight (only when all 3 dims present)
  let dimOz = 0;
  const L = input.dims?.length ? Number(input.dims.length) : 0;
  const W = input.dims?.width ? Number(input.dims.width) : 0;
  const H = input.dims?.height ? Number(input.dims.height) : 0;
  if (L > 0 && W > 0 && H > 0) {
    dimOz = ((L * W * H) / DIM_DIVISOR) * 16;
  }

  const basis: 'actual' | 'dimensional' = dimOz > actualOz ? 'dimensional' : 'actual';
  const billableOz = Math.max(actualOz, dimOz, 1); // floor at 1 oz
  const billableLb = billableOz / 16;

  const zoneKey = estimateZoneKey(input.fromZip, input.toZip);

  const cacheKey = `${service}:${Math.ceil(billableLb * 4) / 4}:${zoneKey}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  const row = RATE_TABLE.find((r) => billableLb <= r.maxLb) || RATE_TABLE[RATE_TABLE.length - 1];
  const estimatedRate = round2(row[zoneKey]);

  const result: RateBucket = { estimatedRate, basis, service };
  memoryCache.set(cacheKey, result);
  return result;
}
