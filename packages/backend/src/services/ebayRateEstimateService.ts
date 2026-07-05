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
export const UPS_RATE_SOURCE = "eBay's own live shipping calculator (ebay.com/shp/calc/rates), Patrick's real seller account, UPS Ground service, 1lb anchors across all 6 zone bands, 2026-07-05";
export const FEDEX_RATE_EFFECTIVE_DATE = '2026-07-05';
export const FEDEX_RATE_SOURCE = "eBay's own live shipping calculator (ebay.com/shp/calc/rates), Patrick's real seller account, FedEx Ground/Home Delivery service specifically (NOT the cheaper FedEx Ground Economy tier), 1lb anchors across all 6 zone bands, 2026-07-05";

// UPS: real-anchored 2026-07-05 — pulled directly from eBay's own public shipping
// calculator (ebay.com/shp/calc/rates) using Patrick's real connected eBay seller
// account, so these are eBay's actual negotiated UPS Ground rates, not a third-party
// reseller estimate. 1lb anchors per zone (origin 49503): z12 $7.22, z34 $7.23,
// z5 $8.62, z6 $8.62 (eBay returned an identical real quote for z5/z6 test routes —
// real carrier zone charts don't split evenly at our z5/z6 mile boundary), z7 $10.19,
// z8 $10.88. Remaining weight tiers scaled from the prior curve shape by the
// real/prior ratio observed at 1lb per zone.
const RATE_TABLE_UPS: RateRow[] = [
  { maxLb: 0.25,   z12: 6.72,  z34: 6.63,  z5: 7.74,  z6: 7.58,  z7: 8.84,  z8: 9.24  },
  { maxLb: 0.5,    z12: 6.82,  z34: 6.72,  z5: 7.87,  z6: 7.75,  z7: 9.02,  z8: 9.50  },
  { maxLb: 0.75,   z12: 6.91,  z34: 6.84,  z5: 8.04,  z6: 7.94,  z7: 9.28,  z8: 9.80  },
  { maxLb: 0.9999, z12: 7.03,  z34: 6.99,  z5: 8.25,  z6: 8.17,  z7: 9.57,  z8: 10.10 },
  { maxLb: 1,      z12: 7.22,  z34: 7.23,  z5: 8.62,  z6: 8.62,  z7: 10.19, z8: 10.88 },
  { maxLb: 2,      z12: 7.59,  z34: 7.74,  z5: 9.40,  z6: 9.56,  z7: 11.50, z8: 12.52 },
  { maxLb: 3,      z12: 8.03,  z34: 8.28,  z5: 10.22, z6: 10.53, z7: 12.82, z8: 14.08 },
  { maxLb: 5,      z12: 8.68,  z34: 9.08,  z5: 11.50, z6: 12.12, z7: 14.94, z8: 16.54 },
  { maxLb: 7,      z12: 9.27,  z34: 9.80,  z5: 12.62, z6: 13.48, z7: 16.80, z8: 18.78 },
  { maxLb: 10,     z12: 10.08, z34: 10.76, z5: 13.85, z6: 14.78, z7: 18.41, z8: 20.42 },
  { maxLb: 14,     z12: 11.20, z34: 11.95, z5: 15.48, z6: 16.46, z7: 20.38, z8: 22.65 },
  { maxLb: 20,     z12: 12.70, z34: 13.74, z5: 18.05, z6: 19.57, z7: 24.69, z8: 27.87 },
  { maxLb: 30,     z12: 15.81, z34: 17.33, z5: 23.76, z6: 26.57, z7: 34.33, z8: 39.50 },
  { maxLb: 50,     z12: 22.41, z34: 25.69, z5: 35.97, z6: 40.83, z7: 53.32, z8: 61.85 },
  { maxLb: 70,     z12: 29.25, z34: 34.06, z5: 47.51, z6: 53.79, z7: 70.12, z8: 81.23 },
];

// FedEx: real-anchored 2026-07-05 — also pulled directly from eBay's own calculator,
// same session as UPS. IMPORTANT correction vs the prior interim fix: eBay separates
// "FedEx Ground Economy" (cheap, slow, ~$7 at 1lb) from "FedEx Ground / FedEx Home
// Delivery" (the actual service this table models — faster, ~$17-21 at 1lb). The
// prior interim table accidentally tracked the Economy tier's price level. 1lb anchors
// per zone: z12 $17.59, z34 $18.30, z5 $19.81, z6 $19.81 (same real-quote-collision as
// UPS), z7 $20.85, z8 $21.07.
const RATE_TABLE_FEDEX: RateRow[] = [
  { maxLb: 0.25,   z12: 16.36, z34: 16.76, z5: 17.75, z6: 17.39, z7: 17.97, z8: 17.85  },
  { maxLb: 0.5,    z12: 16.59, z34: 16.99, z5: 18.07, z6: 17.77, z7: 18.42, z8: 18.36  },
  { maxLb: 0.75,   z12: 16.82, z34: 17.30, z5: 18.46, z6: 18.22, z7: 18.95, z8: 18.95  },
  { maxLb: 0.9999, z12: 17.13, z34: 17.68, z5: 18.94, z6: 18.75, z7: 19.56, z8: 19.53  },
  { maxLb: 1,      z12: 17.59, z34: 18.30, z5: 19.81, z6: 19.81, z7: 20.85, z8: 21.07  },
  { maxLb: 2,      z12: 18.52, z34: 19.61, z5: 21.55, z6: 21.85, z7: 23.43, z8: 24.14  },
  { maxLb: 3,      z12: 19.52, z34: 20.84, z5: 23.38, z6: 24.12, z7: 26.08, z8: 27.07  },
  { maxLb: 5,      z12: 21.06, z34: 22.84, z5: 26.23, z6: 27.60, z7: 30.25, z8: 31.75  },
  { maxLb: 7,      z12: 22.45, z34: 24.61, z5: 28.76, z6: 30.70, z7: 34.04, z8: 35.99  },
  { maxLb: 10,     z12: 24.38, z34: 26.99, z5: 31.54, z6: 33.65, z7: 37.23, z8: 39.07  },
  { maxLb: 14,     z12: 27.00, z34: 29.91, z5: 35.18, z6: 37.43, z7: 41.25, z8: 43.31  },
  { maxLb: 20,     z12: 30.55, z34: 34.29, z5: 40.89, z6: 44.31, z7: 49.74, z8: 53.11  },
  { maxLb: 30,     z12: 37.96, z34: 43.21, z5: 53.88, z6: 60.19, z7: 69.15, z8: 75.21  },
  { maxLb: 50,     z12: 54.00, z34: 64.28, z5: 81.62, z6: 92.55, z7: 107.51, z8: 117.93 },
  { maxLb: 70,     z12: 70.36, z34: 85.04, z5: 107.77, z6: 122.04, z7: 141.63, z8: 155.10 },
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
