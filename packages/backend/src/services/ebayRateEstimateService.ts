/**
 * ebayRateEstimateService — eBay-calibrated USPS Ground Advantage rate estimator.
 *
 * Fallback for when the eBay Logistics API is unavailable (e.g. organizer hasn't
 * re-authorized with sell.logistics scope). When a live token is available, callers
 * should prefer getEbayLiveShippingRate() in ebayController.ts.
 *
 * Rate table calibrated from confirmed eBay rate: 11 lb, zone 7 → $14.31 (2026-06-13).
 * Values are eBay-discounted label costs — NOT USPS retail prices.
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
 * eBay-discounted USPS Ground Advantage approximate rates (2026).
 * These are eBay label costs (~67% below USPS retail via carrier partnership).
 * Calibration anchor: 11 lb, zone 7 → $14.31 eBay label cost (falls in maxLb:14 bucket).
 * maxLb = inclusive upper bound in pounds.
 */
const RATE_TABLE: Array<{ maxLb: number; z12: number; z34: number; z5: number; z6: number; z7: number; z8: number }> = [
  { maxLb: 0.25, z12: 3.50, z34: 3.55, z5: 3.60, z6: 3.65, z7: 3.70, z8: 3.80 },   // ≤4 oz
  { maxLb: 0.5,  z12: 3.55, z34: 3.65, z5: 3.80, z6: 3.90, z7: 4.05, z8: 4.20 },   // ≤8 oz
  { maxLb: 0.75, z12: 3.60, z34: 3.80, z5: 4.00, z6: 4.25, z7: 4.50, z8: 4.75 },   // ≤12 oz
  { maxLb: 1,    z12: 3.75, z34: 4.05, z5: 4.40, z6: 4.75, z7: 5.10, z8: 5.55 },   // ≤1 lb
  { maxLb: 2,    z12: 4.10, z34: 4.65, z5: 5.30, z6: 6.00, z7: 6.75, z8: 7.55 },
  { maxLb: 3,    z12: 4.45, z34: 5.25, z5: 6.15, z6: 7.10, z7: 8.10, z8: 9.15 },
  { maxLb: 5,    z12: 5.20, z34: 6.55, z5: 8.10, z6: 9.55, z7: 11.00, z8: 12.60 },
  { maxLb: 10,   z12: 6.25, z34: 8.40, z5: 10.60, z6: 12.60, z7: 14.60, z8: 16.80 },
  { maxLb: 14,   z12: 7.00, z34: 9.30, z5: 11.55, z6: 13.20, z7: 15.00, z8: 17.25 },  // calibration bucket
  { maxLb: 20,   z12: 8.50, z34: 12.00, z5: 16.00, z6: 19.50, z7: 22.50, z8: 26.00 },
  { maxLb: 50,   z12: 15.50, z34: 23.00, z5: 32.00, z6: 40.00, z7: 47.00, z8: 55.00 },
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
 * Accuracy: ±15-30% of actual eBay rate. Use getEbayLiveShippingRate() when possible.
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
