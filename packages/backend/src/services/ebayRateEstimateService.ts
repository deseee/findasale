/**
 * ebayRateEstimateService — eBay-calibrated USPS Ground Advantage rate estimator.
 *
 * Fallback for when the eBay Logistics API is unavailable (e.g. organizer hasn't
 * re-authorized with sell.logistics scope). When a live token is available, callers
 * should prefer getEbayLiveShippingRate() in ebayController.ts.
 *
 * Rate table source: Pirate Ship USPS Ground Advantage, effective 2026-04-26.
 * Same tier as eBay negotiated rates (USPS Connect eCommerce / below-commercial).
 *
 * FVF note: eBay charges its final value fee on the total transaction amount,
 * including shipping. At 13.6% FVF, the seller nets ~86.4% of the buyer-paid
 * shipping charge. The label cost equals the buyer rate (same USPS tier), so
 * sellers are approximately $0.88 short per $6.50 shipping charge.
 * Use netToSeller / fvfOnShipping / shippingCovered to surface this to organizers.
 */

/** eBay final value fee rate applied to the shipping portion of the transaction. */
export const EBAY_SHIPPING_FVF_RATE = 0.136;

export interface RateBucket {
  /** Rate buyer pays for shipping (eBay calculated, USPS Ground Advantage). */
  estimatedRate: number;
  /** How eBay computed the billable weight. */
  basis: 'actual' | 'dimensional';
  /** Shipping service name. */
  service: string;
  /** Amount eBay retains from the shipping charge as FVF. */
  fvfOnShipping: number;
  /**
   * Amount the seller nets from the buyer's shipping payment after eBay FVF.
   * Compare to your actual USPS label cost to determine if shipping is covered.
   */
  netToSeller: number;
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
 * Estimate the buyer-paid shipping rate for an item, plus the seller's net after
 * eBay's final value fee on shipping (13.6%).
 *
 * Returns:
 *   estimatedRate  — what eBay charges the buyer (≈ your USPS label cost)
 *   fvfOnShipping  — eBay's cut of the shipping charge
 *   netToSeller    — what you actually receive after FVF (estimatedRate - fvfOnShipping)
 *
 * Use shippingCovered = netToSeller >= yourLabelCost to tell organizers whether
 * the buyer's shipping payment actually covers their postage.
 *
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
  const fvfOnShipping = round2(estimatedRate * EBAY_SHIPPING_FVF_RATE);
  const netToSeller = round2(estimatedRate - fvfOnShipping);

  const result: RateBucket = { estimatedRate, basis, service, fvfOnShipping, netToSeller };
  memoryCache.set(cacheKey, result);
  return result;
}

// ───────────────────────────────────────────────────────────────────────────
// Smart bounded flat-rate engine (S975): multi-carrier cheapest-rate pricing at
// the organizer's farthest-CONUS "coverage zone". Used by ebayFlatRatePolicyService.
// ───────────────────────────────────────────────────────────────────────────

export type ZoneKey = 'z12' | 'z34' | 'z5' | 'z6' | 'z7' | 'z8';
type RateRow = { maxLb: number; z12: number; z34: number; z5: number; z6: number; z7: number; z8: number };

// Per-carrier dimensional divisors (cubic inches per pound).
const DIM_DIVISOR_USPS = 166;
const DIM_DIVISOR_UPS = 139;
const DIM_DIVISOR_FEDEX = 139;

export const USPS_RATE_EFFECTIVE_DATE = '2026-04-26';
export const USPS_RATE_SOURCE = 'Pirate Ship USPS Ground Advantage (below-commercial tier)';
export const UPS_RATE_EFFECTIVE_DATE = '2026-06-14';
export const UPS_RATE_SOURCE = 'UPS Ground (Pirate Ship discounted) — ESTIMATE, verify vs rate card';
export const FEDEX_RATE_EFFECTIVE_DATE = '2026-06-14';
export const FEDEX_RATE_SOURCE = 'FedEx Home Delivery/Ground (Pirate Ship discounted) — ESTIMATE, verify vs rate card';

// VERIFY against Patrick's Pirate Ship UPS/FedEx rate card before relying on these —
// structure (tiers, zones, divisor) is correct; figures are best-available estimates (S975).
// Behavior they encode: USPS wins for light parcels; UPS/FedEx Ground win for heavy (10lb+),
// especially cross-country, because USPS Ground Advantage scales up much faster at high weight.
const RATE_TABLE_UPS: RateRow[] = [
  { maxLb: 0.25,   z12: 10.80, z34: 11.10, z5: 11.40, z6: 11.70, z7: 12.10, z8: 12.40 },
  { maxLb: 0.5,    z12: 10.95, z34: 11.25, z5: 11.60, z6: 11.95, z7: 12.35, z8: 12.75 },
  { maxLb: 0.75,   z12: 11.10, z34: 11.45, z5: 11.85, z6: 12.25, z7: 12.70, z8: 13.15 },
  { maxLb: 0.9999, z12: 11.30, z34: 11.70, z5: 12.15, z6: 12.60, z7: 13.10, z8: 13.55 },
  { maxLb: 1,      z12: 11.60, z34: 12.10, z5: 12.70, z6: 13.30, z7: 13.95, z8: 14.60 },
  { maxLb: 2,      z12: 12.20, z34: 12.95, z5: 13.85, z6: 14.75, z7: 15.75, z8: 16.80 },
  { maxLb: 3,      z12: 12.90, z34: 13.85, z5: 15.05, z6: 16.25, z7: 17.55, z8: 18.90 },
  { maxLb: 5,      z12: 13.95, z34: 15.20, z5: 16.95, z6: 18.70, z7: 20.45, z8: 22.20 },
  { maxLb: 7,      z12: 14.90, z34: 16.40, z5: 18.60, z6: 20.80, z7: 23.00, z8: 25.20 },
  { maxLb: 10,     z12: 16.20, z34: 18.00, z5: 20.40, z6: 22.80, z7: 25.20, z8: 27.40 },
  { maxLb: 14,     z12: 18.00, z34: 20.00, z5: 22.80, z6: 25.40, z7: 27.90, z8: 30.40 },
  { maxLb: 20,     z12: 20.40, z34: 23.00, z5: 26.60, z6: 30.20, z7: 33.80, z8: 37.40 },
  { maxLb: 30,     z12: 25.40, z34: 29.00, z5: 35.00, z6: 41.00, z7: 47.00, z8: 53.00 },
  { maxLb: 50,     z12: 36.00, z34: 43.00, z5: 53.00, z6: 63.00, z7: 73.00, z8: 83.00 },
  { maxLb: 70,     z12: 47.00, z34: 57.00, z5: 70.00, z6: 83.00, z7: 96.00, z8: 109.00 },
];

const RATE_TABLE_FEDEX: RateRow[] = [
  { maxLb: 0.25,   z12: 10.60, z34: 10.90, z5: 11.20, z6: 11.50, z7: 11.85, z8: 12.20 },
  { maxLb: 0.5,    z12: 10.75, z34: 11.05, z5: 11.40, z6: 11.75, z7: 12.15, z8: 12.55 },
  { maxLb: 0.75,   z12: 10.90, z34: 11.25, z5: 11.65, z6: 12.05, z7: 12.50, z8: 12.95 },
  { maxLb: 0.9999, z12: 11.10, z34: 11.50, z5: 11.95, z6: 12.40, z7: 12.90, z8: 13.35 },
  { maxLb: 1,      z12: 11.40, z34: 11.90, z5: 12.50, z6: 13.10, z7: 13.75, z8: 14.40 },
  { maxLb: 2,      z12: 12.00, z34: 12.75, z5: 13.60, z6: 14.45, z7: 15.45, z8: 16.50 },
  { maxLb: 3,      z12: 12.65, z34: 13.55, z5: 14.75, z6: 15.95, z7: 17.20, z8: 18.50 },
  { maxLb: 5,      z12: 13.65, z34: 14.85, z5: 16.55, z6: 18.25, z7: 19.95, z8: 21.70 },
  { maxLb: 7,      z12: 14.55, z34: 16.00, z5: 18.15, z6: 20.30, z7: 22.45, z8: 24.60 },
  { maxLb: 10,     z12: 15.80, z34: 17.55, z5: 19.90, z6: 22.25, z7: 24.55, z8: 26.70 },
  { maxLb: 14,     z12: 17.50, z34: 19.45, z5: 22.20, z6: 24.75, z7: 27.20, z8: 29.60 },
  { maxLb: 20,     z12: 19.80, z34: 22.30, z5: 25.80, z6: 29.30, z7: 32.80, z8: 36.30 },
  { maxLb: 30,     z12: 24.60, z34: 28.10, z5: 34.00, z6: 39.80, z7: 45.60, z8: 51.40 },
  { maxLb: 50,     z12: 35.00, z34: 41.80, z5: 51.50, z6: 61.20, z7: 70.90, z8: 80.60 },
  { maxLb: 70,     z12: 45.60, z34: 55.30, z5: 68.00, z6: 80.70, z7: 93.40, z8: 106.00 },
];

/** All curated carrier tables + metadata, for the rate-staleness audit task. */
export const CARRIER_TABLES = [
  { carrier: 'USPS' as const, table: RATE_TABLE, divisor: DIM_DIVISOR_USPS, effectiveDate: USPS_RATE_EFFECTIVE_DATE, source: USPS_RATE_SOURCE },
  { carrier: 'UPS' as const, table: RATE_TABLE_UPS, divisor: DIM_DIVISOR_UPS, effectiveDate: UPS_RATE_EFFECTIVE_DATE, source: UPS_RATE_SOURCE },
  { carrier: 'FEDEX' as const, table: RATE_TABLE_FEDEX, divisor: DIM_DIVISOR_FEDEX, effectiveDate: FEDEX_RATE_EFFECTIVE_DATE, source: FEDEX_RATE_SOURCE },
];

// Continental-US extreme corners — max great-circle distance from any origin to
// one of these approximates the farthest CONUS destination (drives coverage zone).
const CONUS_CORNERS: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Seattle WA', lat: 47.61, lng: -122.33 },
  { name: 'San Diego CA', lat: 32.72, lng: -117.16 },
  { name: 'Key West FL', lat: 24.56, lng: -81.78 },
  { name: 'Caribou ME', lat: 46.86, lng: -68.01 },
];

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8; // earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function milesToZone(miles: number): ZoneKey {
  if (miles <= 150) return 'z12';
  if (miles <= 600) return 'z34';
  if (miles <= 1000) return 'z5';
  if (miles <= 1400) return 'z6';
  if (miles <= 1800) return 'z7';
  return 'z8';
}

// Fallback: max CONUS zone by origin ZIP first digit (coastal/corner regions reach
// the opposite coast at z8; central regions top out around z7).
const ZIP1_MAX_ZONE: Record<string, ZoneKey> = {
  '0': 'z8', '1': 'z8', '2': 'z8', '3': 'z8', '4': 'z7',
  '5': 'z7', '6': 'z7', '7': 'z7', '8': 'z8', '9': 'z8',
};

const coverageZoneCache = new Map<string, ZoneKey>();

/**
 * The carrier zone to the FARTHEST continental-US destination from the organizer's
 * origin. Flat-rate is one price for all buyers, so we price to the worst case the
 * seller could ship to — guaranteeing they're never short. Central origins resolve to
 * a lower zone (cheaper, more competitive); corner origins to z7/z8.
 * Prefers geocoded lat/lng; falls back to ZIP first digit; then conservative z6.
 */
export function coverageZoneForOrigin(origin: { zip?: string | null; lat?: number | null; lng?: number | null }): ZoneKey {
  const key = `${origin.lat ?? ''},${origin.lng ?? ''},${origin.zip ?? ''}`;
  const cached = coverageZoneCache.get(key);
  if (cached) return cached;

  let zone: ZoneKey;
  if (origin.lat != null && origin.lng != null && !isNaN(origin.lat) && !isNaN(origin.lng)) {
    const maxMiles = Math.max(...CONUS_CORNERS.map((c) => haversineMiles(origin.lat!, origin.lng!, c.lat, c.lng)));
    zone = milesToZone(maxMiles);
  } else if (origin.zip && /^\d/.test(origin.zip)) {
    zone = ZIP1_MAX_ZONE[origin.zip[0]] ?? 'z6';
  } else {
    zone = 'z6';
  }
  coverageZoneCache.set(key, zone);
  return zone;
}

function billableLb(weightOz: number, dims: { length?: number | null; width?: number | null; height?: number | null } | null, divisor: number): { lb: number; basis: 'actual' | 'dimensional' } {
  const actualOz = Math.max(0, weightOz || 0);
  let dimOz = 0;
  const L = dims?.length ? Number(dims.length) : 0;
  const W = dims?.width ? Number(dims.width) : 0;
  const H = dims?.height ? Number(dims.height) : 0;
  if (L > 0 && W > 0 && H > 0) dimOz = ((L * W * H) / divisor) * 16;
  const basis: 'actual' | 'dimensional' = dimOz > actualOz ? 'dimensional' : 'actual';
  return { lb: Math.max(actualOz, dimOz, 1) / 16, basis };
}

function rateFromTable(table: RateRow[], lb: number, zone: ZoneKey): number {
  const row = table.find((r) => lb <= r.maxLb) || table[table.length - 1];
  return round2(row[zone]);
}

export interface CheapestRate {
  carrier: 'USPS' | 'UPS' | 'FEDEX';
  rate: number;
  basis: 'actual' | 'dimensional';
  zone: ZoneKey;
  fvfOnShipping: number;
  netToSeller: number;
}

/** Cheapest carrier rate for an item at a given coverage zone. */
export function estimateCheapestRate(input: { weightOz: number; dims?: { length?: number | null; width?: number | null; height?: number | null } | null; zone: ZoneKey }): CheapestRate {
  const dims = input.dims ?? null;
  let best: CheapestRate | null = null;
  for (const c of CARRIER_TABLES) {
    const { lb, basis } = billableLb(input.weightOz, dims, c.divisor);
    const rate = rateFromTable(c.table, lb, input.zone);
    if (!best || rate < best.rate) {
      best = {
        carrier: c.carrier,
        rate,
        basis,
        zone: input.zone,
        fvfOnShipping: round2(rate * EBAY_SHIPPING_FVF_RATE),
        netToSeller: round2(rate - rate * EBAY_SHIPPING_FVF_RATE),
      };
    }
  }
  return best!;
}

/** Resolve the organizer coverage zone, then return the cheapest carrier rate. */
export function computeCheapestForOrigin(input: { weightOz: number; dims?: { length?: number | null; width?: number | null; height?: number | null } | null; origin: { zip?: string | null; lat?: number | null; lng?: number | null } }): CheapestRate {
  const zone = coverageZoneForOrigin(input.origin);
  return estimateCheapestRate({ weightOz: input.weightOz, dims: input.dims ?? null, zone });
}
