/**
 * ebayRateEstimateService — seeded USPS Ground Advantage rate estimator.
 *
 * Provides a buyer-shipping ESTIMATE without calling any paid carrier API (no new
 * metered vendors). eBay calculates the exact rate at checkout from the buyer's
 * ZIP; this is only a pre-listing estimate so the organizer can see net proceeds.
 *
 * Uses the greater of actual vs dimensional weight, picks a USPS zone bucket, and
 * looks up a published 2026-era Ground Advantage retail rate. Results are clearly
 * flagged as estimates.
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
 * USPS Ground Advantage retail rate table (2026-era published rates, USD).
 * Indexed by [weight bucket] x [zone]. Conservative published retail figures,
 * NOT commercial/discounted — keeps the estimate from reading too low.
 * Weight buckets are upper bounds in pounds. Zones 1-2 grouped, 3-4, 5, 6, 7, 8.
 */
const RATE_TABLE: Array<{ maxLb: number; z12: number; z34: number; z5: number; z6: number; z7: number; z8: number }> = [
  { maxLb: 0.25, z12: 5.0, z34: 5.4, z5: 5.8, z6: 6.1, z7: 6.4, z8: 6.8 },   // <= 4 oz
  { maxLb: 0.5, z12: 5.6, z34: 6.1, z5: 6.6, z6: 7.0, z7: 7.4, z8: 7.9 },    // <= 8 oz
  { maxLb: 0.75, z12: 6.5, z34: 7.2, z5: 7.9, z6: 8.5, z7: 9.1, z8: 9.8 },   // <= 12 oz
  { maxLb: 1, z12: 7.6, z34: 8.5, z5: 9.4, z6: 10.2, z7: 11.0, z8: 12.0 },   // <= 1 lb
  { maxLb: 2, z12: 9.0, z34: 10.6, z5: 12.4, z6: 14.0, z7: 15.6, z8: 17.4 },
  { maxLb: 3, z12: 10.4, z34: 12.9, z5: 15.6, z6: 18.0, z7: 20.4, z8: 23.0 },
  { maxLb: 5, z12: 13.0, z34: 17.0, z5: 21.6, z6: 25.5, z7: 29.5, z8: 33.8 },
  { maxLb: 10, z12: 18.5, z34: 25.5, z5: 34.0, z6: 41.0, z7: 48.5, z8: 56.0 },
  { maxLb: 20, z12: 28.0, z34: 42.0, z5: 58.0, z6: 71.0, z7: 85.0, z8: 99.0 },
  { maxLb: 50, z12: 52.0, z34: 82.0, z5: 116.0, z6: 145.0, z7: 175.0, z8: 205.0 },
];

/**
 * Crude zone estimate from the first digit of from/to ZIPs. Without a paid zone
 * API, we approximate: same region (first digit matches) = zone 1-2; one apart =
 * zone 3-4; etc. When ZIPs are unknown, default to a mid-zone (5) so the estimate
 * leans conservative rather than optimistic.
 */
function estimateZoneKey(fromZip?: string | null, toZip?: string | null): 'z12' | 'z34' | 'z5' | 'z6' | 'z7' | 'z8' {
  if (!fromZip || !toZip || fromZip.length < 1 || toZip.length < 1) {
    return 'z5'; // unknown destination -> mid/high zone (conservative)
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
 * Returns the rate, whether actual or dimensional weight drove it, and the service.
 */
export function estimateBuyerShippingRate(input: RateEstimateInput): RateBucket {
  const service = input.service || 'USPSGroundAdvantage';
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

  // Cache key bucketed by ~0.25lb increments + zone + service
  const cacheKey = `${service}:${Math.ceil(billableLb * 4) / 4}:${zoneKey}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  const row = RATE_TABLE.find((r) => billableLb <= r.maxLb) || RATE_TABLE[RATE_TABLE.length - 1];
  const estimatedRate = round2(row[zoneKey]);

  const result: RateBucket = { estimatedRate, basis, service };
  memoryCache.set(cacheKey, result);
  return result;
}
