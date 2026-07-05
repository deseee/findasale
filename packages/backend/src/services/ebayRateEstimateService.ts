/**
 * ebayRateEstimateService — eBay-calibrated multi-carrier (USPS/UPS/FedEx) shipping
 * rate estimator. Live path: computeCheapestForOrigin() / coverageZoneForOrigin(),
 * used by ebayController.ts, ebayFlatRatePolicyService.ts, and ebayShippingResolver.ts.
 *
 * Rate table sources: see USPS_RATE_SOURCE / UPS_RATE_SOURCE / FEDEX_RATE_SOURCE
 * constants below, each with its own effective date and confidence level.
 *
 * FVF note: eBay charges its final value fee on the total transaction amount,
 * including shipping. At 13.6% FVF, the seller nets ~86.4% of the buyer-paid
 * shipping charge. The label cost equals the buyer rate (same USPS tier), so
 * sellers are approximately $0.88 short per $6.50 shipping charge.
 * Use netToSeller / fvfOnShipping / shippingCovered to surface this to organizers.
 *
 * (2026-07-05: removed dead estimateZoneKey()/estimateBuyerShippingRate() — zero
 * callers anywhere in the repo, fully superseded by the coverage-zone engine below.)
 */

/** eBay final value fee rate applied to the shipping portion of the transaction. */
export const EBAY_SHIPPING_FVF_RATE = 0.136;

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

const round2 = (n: number): number => Math.round(n * 100) / 100;

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
export const UPS_RATE_EFFECTIVE_DATE = '2026-07-05';
export const UPS_RATE_SOURCE = 'Pirate Ship UPS Ground (live-quoted, real anchors across all 6 zone bands, 2026-07-05)';
export const FEDEX_RATE_EFFECTIVE_DATE = '2026-07-05';
export const FEDEX_RATE_SOURCE = 'Shippo FedEx Ground/Home Delivery (INTERIM — ratio-corrected from real UPS anchors + FedEx 2026 published list rate, not independently live-quoted; verify vs a real Shippo account when convenient)';

// UPS: real-anchored 2026-07-05 — live Pirate Ship UPS Ground quotes pulled across all
// 6 zone bands (origin 49503 Grand Rapids), 1lb anchors cross-checked against real
// haversine distance using the same milesToZone bands coverageZoneForOrigin() uses live.
// Remaining weight tiers scaled from the old estimate curve by the real/estimate ratio
// observed at 1lb per zone (z12=0.612, z34=0.671, z5=0.66, z6=0.647, z7=0.59, z8=0.584).
const RATE_TABLE_UPS: RateRow[] = [
  { maxLb: 0.25,   z12: 6.61,  z34: 7.45,  z5: 7.52,  z6: 7.57,  z7: 7.14,  z8: 7.24  },
  { maxLb: 0.5,    z12: 6.70,  z34: 7.55,  z5: 7.66,  z6: 7.73,  z7: 7.29,  z8: 7.45  },
  { maxLb: 0.75,   z12: 6.79,  z34: 7.68,  z5: 7.82,  z6: 7.93,  z7: 7.49,  z8: 7.68  },
  { maxLb: 0.9999, z12: 6.92,  z34: 7.85,  z5: 8.02,  z6: 8.15,  z7: 7.73,  z8: 7.91  },
  { maxLb: 1,      z12: 7.10,  z34: 8.12,  z5: 8.38,  z6: 8.61,  z7: 8.23,  z8: 8.53  },
  { maxLb: 2,      z12: 7.47,  z34: 8.69,  z5: 9.14,  z6: 9.54,  z7: 9.29,  z8: 9.81  },
  { maxLb: 3,      z12: 7.89,  z34: 9.29,  z5: 9.93,  z6: 10.51, z7: 10.35, z8: 11.04 },
  { maxLb: 5,      z12: 8.54,  z34: 10.20, z5: 11.19, z6: 12.10, z7: 12.07, z8: 12.96 },
  { maxLb: 7,      z12: 9.12,  z34: 11.00, z5: 12.28, z6: 13.46, z7: 13.57, z8: 14.72 },
  { maxLb: 10,     z12: 9.91,  z34: 12.08, z5: 13.46, z6: 14.75, z7: 14.87, z8: 16.00 },
  { maxLb: 14,     z12: 11.02, z34: 13.42, z5: 15.05, z6: 16.43, z7: 16.46, z8: 17.75 },
  { maxLb: 20,     z12: 12.48, z34: 15.43, z5: 17.56, z6: 19.54, z7: 19.94, z8: 21.84 },
  { maxLb: 30,     z12: 15.54, z34: 19.46, z5: 23.10, z6: 26.53, z7: 27.73, z8: 30.95 },
  { maxLb: 50,     z12: 22.03, z34: 28.85, z5: 34.98, z6: 40.76, z7: 43.07, z8: 48.47 },
  { maxLb: 70,     z12: 28.76, z34: 38.25, z5: 46.20, z6: 53.70, z7: 56.64, z8: 63.66 },
];

// FedEx: INTERIM correction 2026-07-05 — NOT independently live-quoted (Shippo's
// calculator widget could not be automated in-session). Same per-zone ratio applied
// to the old estimate curve as UPS, cross-checked only against a public FedEx 2026
// list-rate reference point (~$11.99 zone2/1lb list, ~$7-9 real via Shippo per public
// source). Lower confidence than UPS — verify against a real Shippo account quote when
// convenient (findasale-shipping-rate-audit will keep flagging this until then).
const RATE_TABLE_FEDEX: RateRow[] = [
  { maxLb: 0.25,   z12: 6.49,  z34: 7.31,  z5: 7.39,  z6: 7.44,  z7: 6.99,  z8: 7.12  },
  { maxLb: 0.5,    z12: 6.58,  z34: 7.41,  z5: 7.52,  z6: 7.60,  z7: 7.17,  z8: 7.33  },
  { maxLb: 0.75,   z12: 6.67,  z34: 7.55,  z5: 7.69,  z6: 7.80,  z7: 7.38,  z8: 7.56  },
  { maxLb: 0.9999, z12: 6.79,  z34: 7.72,  z5: 7.89,  z6: 8.02,  z7: 7.61,  z8: 7.80  },
  { maxLb: 1,      z12: 6.98,  z34: 7.98,  z5: 8.25,  z6: 8.48,  z7: 8.11,  z8: 8.41  },
  { maxLb: 2,      z12: 7.34,  z34: 8.56,  z5: 8.98,  z6: 9.35,  z7: 9.12,  z8: 9.64  },
  { maxLb: 3,      z12: 7.74,  z34: 9.09,  z5: 9.74,  z6: 10.32, z7: 10.15, z8: 10.80 },
  { maxLb: 5,      z12: 8.35,  z34: 9.96,  z5: 10.92, z6: 11.81, z7: 11.77, z8: 12.67 },
  { maxLb: 7,      z12: 8.90,  z34: 10.74, z5: 11.98, z6: 13.13, z7: 13.25, z8: 14.37 },
  { maxLb: 10,     z12: 9.67,  z34: 11.78, z5: 13.13, z6: 14.40, z7: 14.48, z8: 15.59 },
  { maxLb: 14,     z12: 10.71, z34: 13.05, z5: 14.65, z6: 16.01, z7: 16.05, z8: 17.29 },
  { maxLb: 20,     z12: 12.12, z34: 14.96, z5: 17.03, z6: 18.96, z7: 19.35, z8: 21.20 },
  { maxLb: 30,     z12: 15.06, z34: 18.86, z5: 22.44, z6: 25.75, z7: 26.90, z8: 30.02 },
  { maxLb: 50,     z12: 21.42, z34: 28.05, z5: 33.99, z6: 39.60, z7: 41.83, z8: 47.07 },
  { maxLb: 70,     z12: 27.91, z34: 37.11, z5: 44.88, z6: 52.21, z7: 55.11, z8: 61.90 },
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
