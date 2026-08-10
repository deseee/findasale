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
 *
 * ADR-103 Phase 2-4 (2026-08-10): real 8-band zone system + lazy per-origin-ZIP3 real
 * zone-chart cache (UspsZoneChartEntry), cubic-tier pricing evaluated alongside
 * weight/dim-weight pricing, and additive AHS/Large-Package/USPS-nonstandard oversize
 * surcharges. See claude_docs/architecture/ADR-103-shipping-rate-full-reanchor.md.
 */

import { prisma } from '../lib/prisma';

/** eBay final value fee rate applied to the shipping portion of the transaction. */
export const EBAY_SHIPPING_FVF_RATE = 0.136;

/**
 * Thrown by estimateCheapestRate/computeCheapestForOrigin (ADR-103 Phase 4) when an
 * item's declared dims/weight exceed the absolute carrier max for EVERY modeled
 * carrier (USPS 130in length+girth/70lb; UPS+FedEx 108in length OR 165in
 * length+girth/150lb) -- i.e. it cannot be shipped ground by any carrier this engine
 * models. Callers MUST catch this and fail safe (return null / a clear "cannot ship"
 * result) rather than letting it crash a request -- see each call site's try/catch.
 * Never silently underprice an unshippable item.
 */
export class ShippingHardBlockError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ShippingHardBlockError';
  }
}

/**
 * USPS Ground Advantage rates, real-anchored 2026-07-21, z8 CORRECTED 2026-08-10 —
 * pulled directly from eBay's own live shipping calculator (ebay.com/shp/calc/rates)
 * using Patrick's real connected eBay seller account, so these are eBay's actual
 * negotiated USPS Ground Advantage rates, not a third-party reseller estimate. Same
 * sourcing method as the UPS/FedEx tables below. 1lb anchors per zone, origin ZIP
 * 49079 (Paw Paw MI, real ship-from address): z12 $6.56 (Chicago IL 60601, 92mi), z34
 * $7.02 (Nashville TN 37201, 419mi), z5 $7.90 (Dallas TX 75201, 882mi), z6 $8.75
 * (Albuquerque NM 87101, 1219mi), z7 $9.02 (Phoenix AZ 85001, 1544mi).
 *
 * ZONE MODEL CHANGED 2026-08-10 (ADR-103, Phase 1): expanded from the collapsed
 * 6-bucket zone set (z12/z34/z5/z6/z7/z8) to the real USPS 8-band zone system
 * (z1..z8) matching official USPS zone-chart breakpoints (see milesToZone below).
 * z1/z2 currently share the old z12 value and z3/z4 currently share the old z34
 * value -- NOT yet independently re-verified against live rates at each real band;
 * only z8 has been corrected with fresh live data this pass (see below). Splitting
 * z1 from z2 and z3 from z4 with real anchors is Phase 2 (ADR-103) follow-up.
 *
 * z8 CORRECTED 2026-08-10 (ADR-103 Phase 1, Patrick-directed live re-verification,
 * "use zip 98357"): the z8 column was proven stale-low via a live eBay-calculator
 * quote, real seller account, origin 49079 -> destination 98357 (Neah Bay WA, 1908mi
 * -- farther than both Seattle/San Diego, the previous CONUS_CORNERS anchors). Real
 * quote: 0.5lb package = $8.40 USPS Ground Advantage (vs stale table's $6.40, a
 * 1.3125x ratio). Every z8 row in this table scaled by that same real/stale ratio,
 * matching this file's own established methodology (single real anchor + curve-shape
 * scaling) -- NOT independently re-verified at every weight tier; a fuller multi-point
 * re-anchor of z8 (and the rest of the 8-band system) is Phase 2 (ADR-103) follow-up.
 * See claude_docs/architecture/ADR-103-shipping-rate-full-reanchor.md for the full plan.
 *
 * Remaining (non-z8) weight tiers scaled from the prior curve shape by the real/prior
 * ratio observed at 1lb per zone. Replaces the 2026-04-26 Pirate Ship-sourced table,
 * which predated USPS's 2026-07-12 Ground Advantage Commercial rate increase (~11.8%,
 * 7.8% avg) and dimensional-divisor change (166→139, see DIM_DIVISOR_USPS below).
 * maxLb = inclusive upper bound in pounds. All prices in USD.
 */
const RATE_TABLE: RateRow[] = [
  { maxLb: 0.25   , z1: 4.75  , z2: 4.75  , z3: 4.93  , z4: 4.93  , z5: 5.27  , z6: 5.45  , z7: 5.54  , z8: 7.93    },
  { maxLb: 0.5    , z1: 5.22  , z2: 5.22  , z3: 5.42  , z4: 5.42  , z5: 5.75  , z6: 5.85  , z7: 5.93  , z8: 8.4     },
  { maxLb: 0.75   , z1: 5.33  , z2: 5.33  , z3: 5.53  , z4: 5.53  , z5: 5.89  , z6: 6.12  , z7: 6.24  , z8: 8.89    },
  { maxLb: 0.9999 , z1: 5.95  , z2: 5.95  , z3: 6.41  , z4: 6.41  , z5: 6.95  , z6: 7.14  , z7: 7.29  , z8: 10.46   },
  { maxLb: 1      , z1: 6.56  , z2: 6.56  , z3: 7.02  , z4: 7.02  , z5: 7.9   , z6: 8.75  , z7: 9.02  , z8: 13.3    },
  { maxLb: 2      , z1: 6.89  , z2: 6.89  , z3: 7.29  , z4: 7.29  , z5: 8.99  , z6: 10.52 , z7: 10.85 , z8: 16.04   },
  { maxLb: 3      , z1: 7.42  , z2: 7.42  , z3: 8.18  , z4: 8.18  , z5: 10.46 , z6: 12.35 , z7: 12.98 , z8: 19.62   },
  { maxLb: 5      , z1: 8.34  , z2: 8.34  , z3: 9.19  , z4: 9.19  , z5: 12.18 , z6: 14.44 , z7: 15.47 , z8: 23.91   },
  { maxLb: 7      , z1: 8.57  , z2: 8.57  , z3: 9.78  , z4: 9.78  , z5: 13.47 , z6: 16.04 , z7: 17.38 , z8: 27.21   },
  { maxLb: 10     , z1: 10.37 , z2: 10.37 , z3: 12.0  , z4: 12.0  , z5: 15.15 , z6: 18.12 , z7: 19.86 , z8: 31.58   },
  { maxLb: 14     , z1: 12.78 , z2: 12.78 , z3: 14.31 , z4: 14.31 , z5: 18.42 , z6: 21.93 , z7: 24.39 , z8: 39.28   },
  { maxLb: 20     , z1: 14.37 , z2: 14.37 , z3: 16.38 , z4: 16.38 , z5: 22.53 , z6: 27.55 , z7: 31.34 , z8: 50.33   },
  { maxLb: 30     , z1: 26.51 , z2: 26.51 , z3: 35.71 , z4: 35.71 , z5: 53.58 , z6: 65.31 , z7: 76.14 , z8: 120.37  },
  { maxLb: 50     , z1: 38.52 , z2: 38.52 , z3: 51.95 , z4: 51.95 , z5: 80.99 , z6: 99.89 , z7: 117.45, z8: 187.24  },
  { maxLb: 70     , z1: 47.58 , z2: 47.58 , z3: 62.27 , z4: 62.27 , z5: 100.3 , z6: 124.9 , z7: 147.98, z8: 238.39  },
];

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ───────────────────────────────────────────────────────────────────────────
// Smart bounded flat-rate engine (S975): multi-carrier cheapest-rate pricing at
// the organizer's farthest-CONUS "coverage zone". Used by ebayFlatRatePolicyService.
// ───────────────────────────────────────────────────────────────────────────

export type ZoneKey = 'z1' | 'z2' | 'z3' | 'z4' | 'z5' | 'z6' | 'z7' | 'z8';
type RateRow = { maxLb: number; z1: number; z2: number; z3: number; z4: number; z5: number; z6: number; z7: number; z8: number };

// Per-carrier dimensional divisors (cubic inches per pound).
export const DIM_DIVISOR_USPS = 139; // USPS switched from 166 to 139 for packages over 1 cubic foot, effective 2026-07-12 (now matches UPS/FedEx)
const DIM_DIVISOR_UPS = 139;
const DIM_DIVISOR_FEDEX = 139;

export const USPS_RATE_EFFECTIVE_DATE = '2026-07-21';
export const USPS_RATE_SOURCE = "eBay's own live shipping calculator (ebay.com/shp/calc/rates), Patrick's real seller account, USPS Ground Advantage service, origin ZIP 49079, 1lb anchors across the original 6 collapsed zone bands (now expanded to 8 real bands, ADR-103 Phase 1), 2026-07-21";
export const UPS_RATE_EFFECTIVE_DATE = '2026-07-05';
export const UPS_RATE_SOURCE = "eBay's own live shipping calculator (ebay.com/shp/calc/rates), Patrick's real seller account, UPS Ground service, 1lb anchors across the original 6 collapsed zone bands (now expanded to 8 real bands, ADR-103 Phase 1), 2026-07-05";
export const FEDEX_RATE_EFFECTIVE_DATE = '2026-07-05';
export const FEDEX_RATE_SOURCE = "eBay's own live shipping calculator (ebay.com/shp/calc/rates), Patrick's real seller account, FedEx Ground/Home Delivery service specifically (NOT the cheaper FedEx Ground Economy tier), 1lb anchors across the original 6 collapsed zone bands (now expanded to 8 real bands, ADR-103 Phase 1), 2026-07-05";

// UPS: real-anchored 2026-07-05, z8 CORRECTED 2026-08-10 (ADR-103 Phase 1) — pulled
// directly from eBay's own public shipping calculator (ebay.com/shp/calc/rates) using
// Patrick's real connected eBay seller account, so these are eBay's actual negotiated
// UPS Ground rates, not a third-party reseller estimate. 1lb anchors per zone (origin
// 49503): z12 $7.22, z34 $7.23, z5 $8.62, z6 $8.62 (eBay returned an identical real
// quote for z5/z6 test routes — real carrier zone charts don't split evenly at our
// z5/z6 mile boundary), z7 $10.19.
//
// ZONE MODEL CHANGED 2026-08-10 (ADR-103 Phase 1): z1/z2 currently share the old z12
// value, z3/z4 currently share the old z34 value — not yet independently re-verified
// at each real band (Phase 2 follow-up). Only z8 corrected this pass.
//
// z8 CORRECTED 2026-08-10 (ADR-103 Phase 1, Patrick-directed, "use zip 98357"): live
// eBay-calculator quote, real seller account, origin 49079 -> destination 98357 (Neah
// Bay WA, 1908mi). Real quote: 42lb/18x18x18in package = $72.20 UPS Ground (vs stale
// table's $61.85 at the 50lb tier, a 1.1673x ratio). Every z8 row scaled by that same
// real/stale ratio (single-anchor + curve-shape scaling, this file's established
// method) — not independently re-verified at every weight tier; fuller re-anchor is
// Phase 2 (ADR-103) follow-up. See claude_docs/architecture/ADR-103-shipping-rate-full-reanchor.md.
//
// Remaining (non-z8) weight tiers scaled from the prior curve shape by the real/prior
// ratio observed at 1lb per zone.
const RATE_TABLE_UPS: RateRow[] = [
  { maxLb: 0.25   , z1: 6.72  , z2: 6.72  , z3: 6.63  , z4: 6.63  , z5: 7.74  , z6: 7.58  , z7: 8.84  , z8: 10.79   },
  { maxLb: 0.5    , z1: 6.82  , z2: 6.82  , z3: 6.72  , z4: 6.72  , z5: 7.87  , z6: 7.75  , z7: 9.02  , z8: 11.09   },
  { maxLb: 0.75   , z1: 6.91  , z2: 6.91  , z3: 6.84  , z4: 6.84  , z5: 8.04  , z6: 7.94  , z7: 9.28  , z8: 11.44   },
  { maxLb: 0.9999 , z1: 7.03  , z2: 7.03  , z3: 6.99  , z4: 6.99  , z5: 8.25  , z6: 8.17  , z7: 9.57  , z8: 11.79   },
  { maxLb: 1      , z1: 7.22  , z2: 7.22  , z3: 7.23  , z4: 7.23  , z5: 8.62  , z6: 8.62  , z7: 10.19 , z8: 12.7    },
  { maxLb: 2      , z1: 7.59  , z2: 7.59  , z3: 7.74  , z4: 7.74  , z5: 9.4   , z6: 9.56  , z7: 11.5  , z8: 14.61   },
  { maxLb: 3      , z1: 8.03  , z2: 8.03  , z3: 8.28  , z4: 8.28  , z5: 10.22 , z6: 10.53 , z7: 12.82 , z8: 16.44   },
  { maxLb: 5      , z1: 8.68  , z2: 8.68  , z3: 9.08  , z4: 9.08  , z5: 11.5  , z6: 12.12 , z7: 14.94 , z8: 19.31   },
  { maxLb: 7      , z1: 9.27  , z2: 9.27  , z3: 9.8   , z4: 9.8   , z5: 12.62 , z6: 13.48 , z7: 16.8  , z8: 21.92   },
  { maxLb: 10     , z1: 10.08 , z2: 10.08 , z3: 10.76 , z4: 10.76 , z5: 13.85 , z6: 14.78 , z7: 18.41 , z8: 23.84   },
  { maxLb: 14     , z1: 11.2  , z2: 11.2  , z3: 11.95 , z4: 11.95 , z5: 15.48 , z6: 16.46 , z7: 20.38 , z8: 26.44   },
  { maxLb: 20     , z1: 12.7  , z2: 12.7  , z3: 13.74 , z4: 13.74 , z5: 18.05 , z6: 19.57 , z7: 24.69 , z8: 32.53   },
  { maxLb: 30     , z1: 15.81 , z2: 15.81 , z3: 17.33 , z4: 17.33 , z5: 23.76 , z6: 26.57 , z7: 34.33 , z8: 46.11   },
  { maxLb: 50     , z1: 22.41 , z2: 22.41 , z3: 25.69 , z4: 25.69 , z5: 35.97 , z6: 40.83 , z7: 53.32 , z8: 72.2    },
  { maxLb: 70     , z1: 29.25 , z2: 29.25 , z3: 34.06 , z4: 34.06 , z5: 47.51 , z6: 53.79 , z7: 70.12 , z8: 94.82   },
];

// FedEx: real-anchored 2026-07-05, z8 CORRECTED 2026-08-10 (ADR-103 Phase 1) — also
// pulled directly from eBay's own calculator, same session as UPS. IMPORTANT
// correction vs the prior interim fix: eBay separates "FedEx Ground Economy" (cheap,
// slow, ~$7 at 1lb) from "FedEx Ground / FedEx Home Delivery" (the actual service this
// table models — faster, ~$17-21 at 1lb). The prior interim table accidentally tracked
// the Economy tier's price level. 1lb anchors per zone: z12 $17.59, z34 $18.30, z5
// $19.81, z6 $19.81 (same real-quote-collision as UPS), z7 $20.85.
//
// ZONE MODEL CHANGED 2026-08-10 (ADR-103 Phase 1): z1/z2 currently share the old z12
// value, z3/z4 currently share the old z34 value — not yet independently re-verified
// at each real band (Phase 2 follow-up). Only z8 corrected this pass.
//
// z8 CORRECTED 2026-08-10 (ADR-103 Phase 1, Patrick-directed, "use zip 98357") —
// this was the single largest correction found this pass, AND the trickiest to apply
// safely: live eBay-calculator quote, real seller account, origin 49079 -> destination
// 98357 (Neah Bay WA, 1908mi). Real quote: 42lb/18x18x18in package = $46.55 FedEx
// Ground/Home Delivery (vs stale table's $117.93 at the 50lb tier — the stale table
// was more than 2.5x TOO HIGH, not too low, the opposite problem from USPS/UPS.
// Practical effect: the cheapest-carrier selection in estimateCheapestRate() below
// almost certainly never picked FedEx at z8 even on routes where it's genuinely the
// cheapest option, because the stale table made it look artificially expensive).
// ONLY the 50lb row was corrected with this real value ($46.55) — a first attempt at
// scaling every z8 row by the same real/stale ratio (0.3947x) produced z8 figures
// LOWER than z7 at every other weight tier, an impossible result (farther zones can't
// cost less at the same weight) — caught and reverted before push, not shipped. Every
// OTHER z8 row in this FedEx table (all except 50lb) is UNCHANGED from the original
// stale value and should NOT be trusted yet; a real, per-tier live re-anchor is needed
// in Phase 2 (ADR-103) before relying on FedEx z8 pricing outside the 50lb bracket. See
// claude_docs/architecture/ADR-103-shipping-rate-full-reanchor.md.
//
// Remaining (non-z8) weight tiers scaled from the prior curve shape by the real/prior
// ratio observed at 1lb per zone.
const RATE_TABLE_FEDEX: RateRow[] = [
  { maxLb: 0.25   , z1: 16.36 , z2: 16.36 , z3: 16.76 , z4: 16.76 , z5: 17.75 , z6: 17.39 , z7: 17.97 , z8: 17.85    },
  { maxLb: 0.5    , z1: 16.59 , z2: 16.59 , z3: 16.99 , z4: 16.99 , z5: 18.07 , z6: 17.77 , z7: 18.42 , z8: 18.36    },
  { maxLb: 0.75   , z1: 16.82 , z2: 16.82 , z3: 17.3  , z4: 17.3  , z5: 18.46 , z6: 18.22 , z7: 18.95 , z8: 18.95    },
  { maxLb: 0.9999 , z1: 17.13 , z2: 17.13 , z3: 17.68 , z4: 17.68 , z5: 18.94 , z6: 18.75 , z7: 19.56 , z8: 19.53    },
  { maxLb: 1      , z1: 17.59 , z2: 17.59 , z3: 18.3  , z4: 18.3  , z5: 19.81 , z6: 19.81 , z7: 20.85 , z8: 21.07    },
  { maxLb: 2      , z1: 18.52 , z2: 18.52 , z3: 19.61 , z4: 19.61 , z5: 21.55 , z6: 21.85 , z7: 23.43 , z8: 24.14    },
  { maxLb: 3      , z1: 19.52 , z2: 19.52 , z3: 20.84 , z4: 20.84 , z5: 23.38 , z6: 24.12 , z7: 26.08 , z8: 27.07   },
  { maxLb: 5      , z1: 21.06 , z2: 21.06 , z3: 22.84 , z4: 22.84 , z5: 26.23 , z6: 27.6  , z7: 30.25 , z8: 31.75   },
  { maxLb: 7      , z1: 22.45 , z2: 22.45 , z3: 24.61 , z4: 24.61 , z5: 28.76 , z6: 30.7  , z7: 34.04 , z8: 35.99   },
  { maxLb: 10     , z1: 24.38 , z2: 24.38 , z3: 26.99 , z4: 26.99 , z5: 31.54 , z6: 33.65 , z7: 37.23 , z8: 39.07   },
  { maxLb: 14     , z1: 27.0  , z2: 27.0  , z3: 29.91 , z4: 29.91 , z5: 35.18 , z6: 37.43 , z7: 41.25 , z8: 43.31   },
  { maxLb: 20     , z1: 30.55 , z2: 30.55 , z3: 34.29 , z4: 34.29 , z5: 40.89 , z6: 44.31 , z7: 49.74 , z8: 53.11   },
  { maxLb: 30     , z1: 37.96 , z2: 37.96 , z3: 43.21 , z4: 43.21 , z5: 53.88 , z6: 60.19 , z7: 69.15 , z8: 75.21   },
  { maxLb: 50     , z1: 54.0  , z2: 54.0  , z3: 64.28 , z4: 64.28 , z5: 81.62 , z6: 92.55 , z7: 107.51, z8: 46.55   },
  { maxLb: 70     , z1: 70.36 , z2: 70.36 , z3: 85.04 , z4: 85.04 , z5: 107.77, z6: 122.04, z7: 141.63, z8: 155.1   },
];

/** All curated carrier tables + metadata, for the rate-staleness audit task. */
export const CARRIER_TABLES = [
  { carrier: 'USPS' as const, table: RATE_TABLE, divisor: DIM_DIVISOR_USPS, effectiveDate: USPS_RATE_EFFECTIVE_DATE, source: USPS_RATE_SOURCE },
  { carrier: 'UPS' as const, table: RATE_TABLE_UPS, divisor: DIM_DIVISOR_UPS, effectiveDate: UPS_RATE_EFFECTIVE_DATE, source: UPS_RATE_SOURCE },
  { carrier: 'FEDEX' as const, table: RATE_TABLE_FEDEX, divisor: DIM_DIVISOR_FEDEX, effectiveDate: FEDEX_RATE_EFFECTIVE_DATE, source: FEDEX_RATE_SOURCE },
];

/**
 * PENDING_LIVE_VERIFICATION (ADR-103 Phase 2 honesty gate, CLAUDE.md §0·EF): every
 * (carrier, weightTierMaxLb, zone) cell in this list is a value CARRIED FORWARD from
 * the pre-ADR-103 6-collapsed-zone tables, not independently re-anchored against a
 * live eBay-calculator quote at that exact zone. Per each table's own header comment:
 * z1 currently duplicates the old z12 bucket's value (shared with z2); z3 duplicates
 * the old z34 bucket's value (shared with z4); z2/z4/z5/z6/z7 are real-quoted ONLY at
 * the 1lb tier, with every other weight tier in those columns scaled (not directly
 * quoted) from that single anchor. Only z8 (all weight tiers, all 3 carriers) was
 * independently live-verified this pass (ADR-103 Phase 1, zip 98357). Consumed by the
 * QA dispatch that follows this implementation pass -- do not treat any cell surfaced
 * here as verified. A full per-tier live re-anchor is ADR-103 §2B's repeatable
 * Chrome-automation methodology (out of scope for this dev pass -- requires live
 * browser automation against eBay's calculator, not fabricable from this shell).
 */
export const PENDING_LIVE_VERIFICATION_CELLS: Array<{ carrier: 'USPS' | 'UPS' | 'FEDEX'; maxLb: number; zone: ZoneKey }> = (() => {
  const out: Array<{ carrier: 'USPS' | 'UPS' | 'FEDEX'; maxLb: number; zone: ZoneKey }> = [];
  const carrierTables = [
    { carrier: 'USPS' as const, table: RATE_TABLE },
    { carrier: 'UPS' as const, table: RATE_TABLE_UPS },
    { carrier: 'FEDEX' as const, table: RATE_TABLE_FEDEX },
  ];
  for (const { carrier, table } of carrierTables) {
    for (const row of table) {
      for (const zone of ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'] as ZoneKey[]) {
        if (row.maxLb === 1) continue; // 1lb anchors are real-quoted per each table's header comments
        out.push({ carrier, maxLb: row.maxLb, zone });
      }
    }
  }
  return out;
})();

// Continental-US extreme corners — max great-circle distance from any origin to
// one of these approximates the farthest CONUS destination (drives coverage zone).
const CONUS_CORNERS: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Seattle WA', lat: 47.61, lng: -122.33 },
  { name: 'San Diego CA', lat: 32.72, lng: -117.16 },
  { name: 'Key West FL', lat: 24.56, lng: -81.78 },
  { name: 'Caribou ME', lat: 46.86, lng: -68.01 },
  // Added 2026-08-10 (ADR-103 Phase 1, Patrick-directed "use zip 98357" verification):
  // Neah Bay WA (zip 98357), the actual NW tip of the Olympic Peninsula / CONUS. From
  // Paw Paw MI (49079) this is 1908mi -- farther than both Seattle and San Diego above,
  // making it the genuinely farthest worst-case point checked so far. Also close to
  // (~15mi from) Quilcene WA 98365, the real-world anchor point this file's own z8 rate
  // derivation is sourced from -- so this corner and the rate table it feeds are now
  // consistent with the same real destination.
  { name: 'Neah Bay WA', lat: 48.328, lng: -124.6151 },
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

// Real USPS domestic zone breakpoints (ADR-103 Phase 1, 2026-08-10) -- replaces the
// prior collapsed 6-bucket approximation (z12/z34/z5/z6/z7/z8) with the actual 8-band
// system USPS/UPS/FedEx zone charts are built on: z1 0-50mi, z2 51-150mi, z3
// 151-300mi, z4 301-600mi, z5 601-1000mi, z6 1001-1400mi, z7 1401-1800mi, z8 1801mi+.
// Source: postalpro.usps.com/operations/zone-charts, postcalc.usps.com/DomesticZoneChart,
// cross-checked against ShippingEasy/Pitney Bowes zone-determination references. This is
// still a straight-line-distance approximation of USPS's real ZIP3-pair zone-chart
// lookup (which is keyed to SCF-to-SCF routing distance, not point-to-point mileage, and
// can disagree with a pure mileage formula at the margins -- exactly the class of error
// that produced the digit-4 zone bug fixed earlier this session). A real per-origin-ZIP3
// zone-chart lookup (cached, lazy-populated) is Phase 2 (ADR-103) follow-up; this
// distance-band correction is the immediate, evidence-grounded improvement for Phase 1.
function milesToZone(miles: number): ZoneKey {
  if (miles <= 50) return 'z1';
  if (miles <= 150) return 'z2';
  if (miles <= 300) return 'z3';
  if (miles <= 600) return 'z4';
  if (miles <= 1000) return 'z5';
  if (miles <= 1400) return 'z6';
  if (miles <= 1800) return 'z7';
  return 'z8';
}

// Fallback: max CONUS zone by origin ZIP first digit (coastal/corner regions reach
// the opposite coast at z8; central regions top out around z7).
//
// CORRECTED 2026-08-10: digit '4' (OH/IN/KY/MI) was 'z7', verified wrong via direct
// haversine computation against a real live sale (Paw Paw MI 49079, lat/lng from the
// Sale record itself, 42.2177,-85.8905): farthest CONUS corner is San Diego CA at
// 1823mi / Seattle WA at 1804mi -- both past the 1800mi z7/z8 cutoff, landing in z8.
// This also matches this file's OWN z8 rate-anchor derivation two sections up, which
// used this exact origin (49079) reaching Quilcene WA (1828mi) to calibrate the z8
// rate level -- the zone table contradicted the rate table it feeds. Western Michigan
// sits right at the z7/z8 boundary; the crude single-digit bucket can't represent that
// nuance, so per this file's own "never be short" design principle (a flat rate is one
// price for all buyers -- price to the worst case), digit 4 rounds up to z8. Sanity-
// checked the other 9 digits against representative-city haversine distances the same
// way -- all 9 already matched their table zone with real margin, so this was an
// isolated error, not a systemic one. Caught live 2026-08-10 (Patrick, mid-#622-rollout
// QA): a real Artifact item's flat rate computed to $7.50 off the buggy z7 zone instead
// of the correct $8.00 at z8 -- the gap widens substantially at higher weights (roughly
// $7 at 20lb, $25 at 50lb, comparing the z7 vs z8 columns in RATE_TABLE above).
const ZIP1_MAX_ZONE: Record<string, ZoneKey> = {
  '0': 'z8', '1': 'z8', '2': 'z8', '3': 'z8', '4': 'z8',
  '5': 'z7', '6': 'z7', '7': 'z7', '8': 'z8', '9': 'z8',
};

const coverageZoneCache = new Map<string, ZoneKey>();

/**
 * The carrier zone to the FARTHEST continental-US destination from the sale's
 * origin. Flat-rate is one price for all buyers, so we price to the worst case the
 * seller could ship to — guaranteeing they're never short. Central origins resolve to
 * a lower zone (cheaper, more competitive); corner origins to z7/z8.
 *
 * Prefers ZIP (first-digit zone lookup) whenever present -- 2026-08-08 fix (roadmap
 * #547 / originally S980): every caller in this codebase passes BOTH the sale's own
 * origin ZIP AND the organizer's profile lat/lng together (grepped project-wide,
 * confirmed across ebayShippingResolver.ts, ebayFlatRatePolicyService.ts, and both
 * preview paths in ebayController.ts) -- the organizer's lat/lng is included purely as
 * a fallback for when a sale has no ZIP on file, not as a preferred signal. The OLD
 * precedence here checked lat/lng first, which meant an organizer with a geocoded
 * profile address would have EVERY sale's shipping estimate silently computed from
 * their own home/profile location instead of that sale's actual origin, even when the
 * correct sale ZIP was right there in the same call. ZIP-first-digit is coarser than a
 * haversine calc, but it reflects the CORRECT location; precise-but-wrong beats
 * imprecise-but-wrong. Falls back to lat/lng only when the sale has no ZIP; then
 * conservative z6.
 */
export function coverageZoneForOrigin(origin: { zip?: string | null; lat?: number | null; lng?: number | null }): ZoneKey {
  const key = `${origin.lat ?? ''},${origin.lng ?? ''},${origin.zip ?? ''}`;
  const cached = coverageZoneCache.get(key);
  if (cached) return cached;

  let zone: ZoneKey;
  if (origin.zip && /^\d/.test(origin.zip)) {
    zone = ZIP1_MAX_ZONE[origin.zip[0]] ?? 'z6';
  } else if (origin.lat != null && origin.lng != null && !isNaN(origin.lat) && !isNaN(origin.lng)) {
    const maxMiles = Math.max(...CONUS_CORNERS.map((c) => haversineMiles(origin.lat!, origin.lng!, c.lat, c.lng)));
    zone = milesToZone(maxMiles);
  } else {
    zone = 'z6';
  }
  coverageZoneCache.set(key, zone);
  return zone;
}

// ── ADR-103 Phase 2: lazy per-origin-ZIP3 real USPS zone-chart cache ───────────────
// coverageZoneForOrigin() above remains the synchronous 8-band mileage-approximation
// fallback (unchanged, still exported/used directly by anything that can't await).
// resolveCoverageZone() below is the async, cache-aware wrapper: it checks
// UspsZoneChartEntry for real zone-chart rows at this origin's ZIP3 first, and only
// falls back to the mileage approximation when no cached entry exists.

const ZONE_ORDER: ZoneKey[] = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z8'];
function maxZone(a: ZoneKey, b: ZoneKey): ZoneKey {
  return ZONE_ORDER.indexOf(a) >= ZONE_ORDER.indexOf(b) ? a : b;
}

/** First 3 digits of a US ZIP, or null if the input isn't a valid ZIP prefix. */
function zip3(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const digits = zip.replace(/\D/g, '');
  return digits.length >= 3 ? digits.slice(0, 3) : null;
}

// In-process memo for the async cache-chart lookup (separate from coverageZoneCache,
// which memoizes the sync mileage-only result) -- avoids a repeat DB round-trip for the
// same originZip3 within a process lifetime. Cleared implicitly on redeploy.
const zoneChartCache = new Map<string, ZoneKey | null>();

/**
 * Real USPS zone-chart lookup for an origin ZIP3, from the UspsZoneChartEntry cache
 * table. Per ADR-103 §2A, the "coverage zone" for an origin is the MAX zone across all
 * real destination-ZIP3 rows cached for that origin (worst-case-across-real-chart-rows,
 * same "never be short" principle coverageZoneForOrigin already uses for the mileage
 * fallback). Returns null (not a zone) when no rows are cached yet for this origin --
 * caller falls back to the mileage approximation, exactly as documented on
 * UspsZoneChartEntry in schema.prisma.
 */
async function getCachedMaxZoneForOriginZip3(originZip3: string): Promise<ZoneKey | null> {
  if (zoneChartCache.has(originZip3)) return zoneChartCache.get(originZip3)!;
  let result: ZoneKey | null = null;
  try {
    const rows = await prisma.uspsZoneChartEntry.findMany({
      where: { originZip3 },
      select: { zone: true },
    });
    for (const row of rows) {
      const z = row.zone as ZoneKey;
      if (!ZONE_ORDER.includes(z)) continue; // defensive: ignore malformed cached rows
      result = result ? maxZone(result, z) : z;
    }
  } catch (err) {
    // DB unavailable / table not yet migrated on this environment -- fail open to the
    // mileage fallback rather than blocking rate computation.
    console.warn('[eBay RateEstimate] UspsZoneChartEntry lookup failed, falling back to mileage approximation', err);
    result = null;
  }
  zoneChartCache.set(originZip3, result);
  return result;
}

/**
 * TODO: wire real postcalc.usps.com fetch, see ADR-103 §2A. This is intentionally a
 * stub -- fetching postcalc.usps.com/DomesticZoneChart requires an HTTP call pattern
 * not already established anywhere in this codebase (form-post + HTML/CSV scrape, not
 * a JSON API), and ADR-103's Dev dispatch explicitly does not require building it in
 * this pass. Currently a no-op (writes nothing, returns without effect) so calling it
 * is always safe -- once implemented, it should upsert real UspsZoneChartEntry rows for
 * (originZip3, destZip3) pairs actually seen in production, lazily, on cache miss.
 */
async function fetchLiveUspsZoneChartEntry(originZip3: string): Promise<void> {
  void originZip3;
  // Not implemented this pass -- see TODO above. Intentionally does nothing.
  return;
}

/**
 * Async, cache-aware coverage zone resolution (ADR-103 Phase 2). Prefers a real
 * USPS zone-chart cache hit for this origin's ZIP3; falls back to the synchronous
 * 8-band mileage approximation (coverageZoneForOrigin) when no cache entry exists.
 * On a cache miss, fires the (currently stubbed, no-op) live fetcher in the
 * background -- non-blocking, errors swallowed -- so a future real implementation
 * starts lazily populating the cache with zero additional wiring.
 */
export async function resolveCoverageZone(origin: { zip?: string | null; lat?: number | null; lng?: number | null }): Promise<ZoneKey> {
  const originZip3 = zip3(origin.zip);
  if (originZip3) {
    const cached = await getCachedMaxZoneForOriginZip3(originZip3);
    if (cached) return cached;
    // Lazy background populate -- stubbed today (see TODO), safe no-op.
    void fetchLiveUspsZoneChartEntry(originZip3).catch(() => undefined);
  }
  return coverageZoneForOrigin(origin);
}

// Exported (S1197) so resolvePoliciesForItem's weight-tier match (ebayController.ts) can
// apply the SAME dimensional-weight floor real carriers actually bill on, instead of
// matching flat weight-tier policies against raw actual weight alone -- a light-but-bulky
// item (e.g. 2lb actual, 20x20x20in) was silently under-priced because weight-tier lookup
// never looked at dims at all, unlike this calculated-shipping path which always has.
export function billableLb(weightOz: number, dims: { length?: number | null; width?: number | null; height?: number | null } | null, divisor: number): { lb: number; basis: 'actual' | 'dimensional' } {
  const actualOz = Math.max(0, weightOz || 0);
  let dimOz = 0;
  const L = dims?.length ? Number(dims.length) : 0;
  const W = dims?.width ? Number(dims.width) : 0;
  const H = dims?.height ? Number(dims.height) : 0;
  if (L > 0 && W > 0 && H > 0) dimOz = ((L * W * H) / divisor) * 16;
  const basis: 'actual' | 'dimensional' = dimOz > actualOz ? 'dimensional' : 'actual';
  return { lb: Math.max(actualOz, dimOz, 1) / 16, basis };
}

/**
 * Looks up (or, for weights beyond the table's real-data ceiling, linearly
 * extrapolates) a carrier rate for a given billable weight and zone.
 *
 * BUG FIXED (S1201, live QA vs ADR-103 Phases 2-5): every RATE_TABLE/_UPS/_FEDEX
 * table's highest real row is maxLb: 70. The old implementation was
 * `table.find((r) => lb <= r.maxLb) || table[table.length - 1]` -- for any lb > 70
 * (which IS reachable: UPS/FedEx ship up to 150lb per UPS_FEDEX_ABSOLUTE_MAX,
 * enforced by withinAbsoluteMax() before this is ever called, and billable
 * (dimensional) weight can independently exceed 70lb even on a lighter/bulkier
 * USPS-eligible package) `.find()` returned undefined and silently fell back to
 * the LAST row -- pricing a 100lb and a 149lb package identically, as if both
 * were exactly 70lb. Confirmed against a live eBay-calculator quote (Patrick's
 * real seller account, origin 49079 -> dest 49503, 100lb/28x28x16in, UPS Ground):
 * real quote $88.73; old clamp-to-70lb logic computed $75.25 (15% under). ADR-103
 * §2(D) explicitly requires "hard-block rather than silently underprice" for
 * out-of-table weights -- clamping violated that.
 *
 * PENDING_LIVE_VERIFICATION (extrapolated bracket, honesty gate, CLAUDE.md §0·EF):
 * there is no live-quoted data above 70lb (this dev pass did not fabricate new
 * "real" 90/110/130/150lb figures -- see
 * PENDING_LIVE_VERIFICATION_EXTRAPOLATED_WEIGHT_BRACKET below). Instead of
 * clamping, this extrapolates LINEARLY past the last real row using the table's
 * own observed per-pound growth rate between its last two real rows (50lb ->
 * 70lb), applied forward to the requested weight -- the same "single real anchor
 * + curve-shape scaling" methodology this file already uses elsewhere (see the
 * z8 correction comments above), just applied along the weight axis instead of
 * the zone axis. Not a live quote; closer than the old clamp bug, not "verified."
 *
 * absoluteMaxLb caps the extrapolation input at the carrier's own physical
 * ceiling (USPS_ABSOLUTE_MAX.weightLb = 70, UPS_FEDEX_ABSOLUTE_MAX.weightLb =
 * 150) -- a second, independent safety cap on the PRICING input itself, since
 * withinAbsoluteMax() only gates on REAL weight/dims (it can pass a package
 * whose BILLABLE/dimensional weight is higher), so this prevents a runaway
 * dimensional-weight value from extrapolating past a weight the carrier would
 * refuse to ship at all.
 *
 * Pure function, no behavior change for any lb <= 70 (the table lookup path is
 * unchanged).
 */
function rateFromTable(table: RateRow[], lb: number, zone: ZoneKey, absoluteMaxLb: number): number {
  const row = table.find((r) => lb <= r.maxLb);
  if (row) return round2(row[zone]);

  // Beyond the table's real-data ceiling -- extrapolate linearly from the last
  // two real rows' observed per-pound growth rate, capped at the carrier's own
  // absolute max weight.
  const lastRow = table[table.length - 1];
  const secondLastRow = table[table.length - 2];
  const cappedLb = Math.min(lb, absoluteMaxLb);
  const slope = (lastRow[zone] - secondLastRow[zone]) / (lastRow.maxLb - secondLastRow.maxLb);
  const extrapolated = lastRow[zone] + slope * (cappedLb - lastRow.maxLb);
  return round2(extrapolated);
}

type PackageDims = { length?: number | null; width?: number | null; height?: number | null } | null;

export interface CheapestRate {
  carrier: 'USPS' | 'UPS' | 'FEDEX';
  /** Final rate the downstream FVF gross-up/bucket-rounding step should use --
   *  baseRate + applicableSurcharges (ADR-103 Phase 4). */
  rate: number;
  /** Carrier table rate before any oversize/AHS/Large-Package/nonstandard surcharge. */
  baseRate?: number;
  /** Total additive surcharge folded into `rate` (0 if none triggered). */
  surcharge?: number;
  surchargeType?: 'AHS' | 'LARGE_PACKAGE' | 'USPS_NONSTANDARD' | null;
  basis: 'actual' | 'dimensional' | 'cubic';
  /** Set when basis === 'cubic' -- which named GA Cubic tier was selected. */
  cubicTierLabel?: string | null;
  zone: ZoneKey;
  fvfOnShipping: number;
  netToSeller: number;
}

// ── ADR-103 Phase 3: cubic-tier pricing (USPS Ground Advantage Cubic) ──────────────
// USPS GA Cubic prices small, dense items by box-dimension tier instead of
// weight/dim-weight -- often cheaper for small heavy items. Named tiers mirror
// Patrick's own live eBay policy list ("GA Cubic 0.1 (to 5x5x6)" ... "GA Cubic 1.0
// (to 14x12x10)", ~10 discrete tiers, ADR-103 §2C).
//
// PENDING_LIVE_VERIFICATION (honesty gate, ADR-103 Phase 3): only the two endpoint
// tiers below (0.1 and 1.0) are sourced -- directly from ADR-103 §2C, which cites
// Patrick's real, currently-configured eBay policy names. ADR-103 states ~10 discrete
// tiers exist between these endpoints (implied 0.1 cu-ft increments, i.e. GA Cubic 0.2
// through 0.9) but this pass did not capture their box dimensions or prices --
// inventing them would violate the no-fabrication rule (CLAUDE.md §0·EF). Every tier's
// flatRate is null until a real price is sourced; evaluateCubicTier() below SKIPS any
// tier with flatRate === null, so cubic pricing can never be selected as cheaper than
// weight/dim-weight pricing until real data lands here -- pure plumbing, safe no-op
// today. QA/Architect: read Patrick's live eBay Business Policies > Shipping list
// (ebay.com/bp/shippingpolicy) and add the missing GA Cubic 0.2-0.9 rows verbatim
// (tierLabel, maxLengthIn/maxWidthIn/maxHeightIn, flatRate).
export interface CubicTier {
  tierLabel: string;
  maxLengthIn: number;
  maxWidthIn: number;
  maxHeightIn: number;
  /** Flat national rate, USD. null = not yet sourced -- tier is skipped until filled. */
  flatRate: number | null;
}

export const CUBIC_TIER_TABLE: CubicTier[] = [
  { tierLabel: 'GA Cubic 0.1', maxLengthIn: 5, maxWidthIn: 5, maxHeightIn: 6, flatRate: null }, // PENDING_LIVE_VERIFICATION -- dims sourced (ADR-103 §2C), price not
  { tierLabel: 'GA Cubic 1.0', maxLengthIn: 14, maxWidthIn: 12, maxHeightIn: 10, flatRate: null }, // PENDING_LIVE_VERIFICATION -- dims sourced (ADR-103 §2C), price not
];

/**
 * Smallest-volume CUBIC_TIER_TABLE entry (with a real, non-null flatRate) whose
 * bounding box contains the item, orientation-agnostic -- same matching algorithm as
 * matchCubicTier() in ebayPolicyParser.ts (ADR-099), kept independent here since this
 * table is a code-level engine input, not an organizer-uploaded policy mapping.
 */
function evaluateCubicTier(dims: PackageDims): { tierLabel: string; rate: number } | null {
  const L = dims?.length ? Number(dims.length) : 0;
  const W = dims?.width ? Number(dims.width) : 0;
  const H = dims?.height ? Number(dims.height) : 0;
  if (!(L > 0 && W > 0 && H > 0)) return null;
  const itemDims = [L, W, H].sort((a, b) => b - a);
  const priced = CUBIC_TIER_TABLE.filter((t) => t.flatRate != null);
  const sorted = [...priced].sort(
    (a, b) => a.maxLengthIn * a.maxWidthIn * a.maxHeightIn - b.maxLengthIn * b.maxWidthIn * b.maxHeightIn
  );
  for (const tier of sorted) {
    const tierDims = [tier.maxLengthIn, tier.maxWidthIn, tier.maxHeightIn].sort((a, b) => b - a);
    if (itemDims[0] <= tierDims[0] && itemDims[1] <= tierDims[1] && itemDims[2] <= tierDims[2]) {
      return { tierLabel: tier.tierLabel, rate: tier.flatRate as number };
    }
  }
  return null;
}

// ── ADR-103 Phase 4: real oversize / AHS / Large-Package / USPS-nonstandard surcharges ──
// Sourced from ADR-103 §2(D) exactly, per the honesty gate in this session's dispatch --
// see the ADR-cited caveats carried forward as comments below. Applied ADDITIVELY to the
// base carrier rate, BEFORE the FVF gross-up/bucket-rounding step in
// ebayFlatRatePolicyService.ts (computeFvfFlatRate/roundUpToBucket both operate on
// CheapestRate.rate, which already includes any surcharge by the time it's returned).

/** Non-rigid/soft-sided/cylindrical packaging that triggers the AHS packaging trigger
 *  by default (ADR-103 §2D) -- exact string values confirmed against the Package Type
 *  dropdown, packages/frontend/pages/organizer/edit-item/[id].tsx. */
const AHS_PACKAGING_TYPES = new Set(['ROLL', 'TOUGH_BAGS', 'PARCEL_OR_PADDED_ENVELOPE', 'PADDED_BAGS']);

// AHS (Additional Handling Surcharge), UPS + FedEx, near-identical fee schedules
// (ADR-103 §2D): "2026 fees by zone: ~$26.50-$46.00 (zone 2) up to ~$33.75-$58.75
// (zone 7+)". UPS figures are secondary-sourced (3 independent, mutually consistent
// sources, NOT confirmed against a UPS-published PDF -- ADR-103 §5) pending a direct
// UPS.com re-check. This engine uses the HIGH end of each given range (conservative,
// "never be short" -- same principle coverageZoneForOrigin already documents) at the
// two zones ADR-103 actually gives figures for (2 and 7+), and carries that same
// high-end figure forward to the adjacent unsourced zones -- z1 mirrors z2, z3-z6
// mirror z7+ -- rather than inventing an interpolated gradient. Every zone below is
// PENDING_LIVE_VERIFICATION except z2 and z7/z8, which are ADR-103-sourced (secondary).
export const AHS_SURCHARGE_TABLE: Record<ZoneKey, number> = {
  z1: 46.00, // PENDING_LIVE_VERIFICATION -- carried forward from the z2 anchor
  z2: 46.00, // ADR-103 §2D, secondary-sourced (high end of $26.50-$46.00)
  z3: 58.75, // PENDING_LIVE_VERIFICATION -- carried forward from the z7+ anchor
  z4: 58.75, // PENDING_LIVE_VERIFICATION -- carried forward from the z7+ anchor
  z5: 58.75, // PENDING_LIVE_VERIFICATION -- carried forward from the z7+ anchor
  z6: 58.75, // PENDING_LIVE_VERIFICATION -- carried forward from the z7+ anchor
  z7: 58.75, // ADR-103 §2D, secondary-sourced (high end of $33.75-$58.75)
  z8: 58.75, // ADR-103 §2D, secondary-sourced ("zone 7+" covers 7 and up)
};

// Large Package / Oversize surcharge, UPS + FedEx (ADR-103 §2D): "$255 (zone 2) to
// $330 (zone 7+), plus a 90lb minimum billable weight once triggered." Same
// carry-forward convention as AHS above -- only z2 and z7/z8 are ADR-103-sourced.
export const LARGE_PACKAGE_SURCHARGE_TABLE: Record<ZoneKey, number> = {
  z1: 255, // PENDING_LIVE_VERIFICATION -- carried forward from the z2 anchor
  z2: 255, // ADR-103 §2D
  z3: 330, // PENDING_LIVE_VERIFICATION -- carried forward from the z7+ anchor
  z4: 330, // PENDING_LIVE_VERIFICATION -- carried forward from the z7+ anchor
  z5: 330, // PENDING_LIVE_VERIFICATION -- carried forward from the z7+ anchor
  z6: 330, // PENDING_LIVE_VERIFICATION -- carried forward from the z7+ anchor
  z7: 330, // ADR-103 §2D
  z8: 330, // ADR-103 §2D
};
export const LARGE_PACKAGE_MIN_BILLABLE_LB = 90; // ADR-103 §2D

// USPS Ground Advantage nonstandard fees (ADR-103 §2D): "length >22-30in: $4.50;
// length >30in: $10.00; volume >2ft3: ~$21 (one conflicting source says $35 -- verify
// against Notice 123 before hard-coding)." The $21-vs-$35 conflict is UNRESOLVED
// (ADR-103 §5) -- this engine uses the conservative $35 figure so a real charge can
// never exceed what the organizer priced for (never-short principle). Architect/
// Patrick: confirm against USPS Notice 123 pricing before treating $35 as final; if
// Notice 123 confirms $21, this is a straightforward one-line correction.
export const USPS_NONSTANDARD_FEE_TABLE = {
  lengthOver22Under30In: 4.50,
  lengthOver30In: 10.00,
  volumeOver2CuFt: 35.00, // PENDING_LIVE_VERIFICATION -- conflict vs $21, see comment above
};

// Absolute carrier max (ADR-103 §2D): beyond these, the carrier refuses the package
// (or, for UPS/FedEx, charges a $1,875 "Ground Unauthorized Package" fee instead of
// shipping it normally) -- hard-block rather than silently underprice.
// UPS/FedEx: "108in length, 165in length+girth combined" (ADR-103 §2D, primary-sourced
// dollar amounts; trigger dimensions secondary-sourced per §5). 150lb is a commonly
// published UPS/FedEx Ground absolute weight limit -- not independently re-verified
// this pass, flagged PENDING_LIVE_VERIFICATION same as the rest of this table.
export const UPS_FEDEX_ABSOLUTE_MAX = { lengthIn: 108, lengthPlusGirthIn: 165, weightLb: 150 };
// USPS: "Absolute USPS max: 130in combined length+girth, 70lb" (ADR-103 §2D).
export const USPS_ABSOLUTE_MAX = { lengthPlusGirthIn: 130, weightLb: 70 };

/**
 * PENDING_LIVE_VERIFICATION (extrapolated weight bracket, honesty gate, S1201 fix):
 * rateFromTable() now linearly extrapolates past each table's 70lb real-data
 * ceiling (see that function's header comment for the bug this replaced and the
 * extrapolation method) instead of silently clamping to the 70lb-tier rate. This
 * bracket is real data for NO carrier -- it is a same-methodology extrapolation,
 * not a live eBay-calculator quote. QA/Architect: live-verify UPS/FedEx rates at
 * 90/110/130/150lb per zone (ADR-103 §2B Chrome-automation methodology) before
 * relying on this bracket beyond "closer than the pre-fix clamp bug." USPS is
 * capped at 70lb by USPS_ABSOLUTE_MAX itself (real weight), so this bracket only
 * matters for USPS pricing in the rare case billable/dimensional weight exceeds
 * 70lb while real weight/dims stay under the physical ceiling.
 */
export const PENDING_LIVE_VERIFICATION_EXTRAPOLATED_WEIGHT_BRACKET = {
  minLb: 70,
  maxLbByCarrier: {
    USPS: USPS_ABSOLUTE_MAX.weightLb,
    UPS: UPS_FEDEX_ABSOLUTE_MAX.weightLb,
    FEDEX: UPS_FEDEX_ABSOLUTE_MAX.weightLb,
  },
  method: 'linear extrapolation from the 50lb->70lb per-pound growth rate observed in each table/zone (rateFromTable)',
};

/** [longest, 2nd-longest, 3rd-longest] from raw dims, or null if any dim is missing. */
function sortedRealDims(dims: PackageDims): [number, number, number] | null {
  const L = dims?.length ? Number(dims.length) : 0;
  const W = dims?.width ? Number(dims.width) : 0;
  const H = dims?.height ? Number(dims.height) : 0;
  if (!(L > 0 && W > 0 && H > 0)) return null;
  const sorted = [L, W, H].sort((a, b) => b - a) as [number, number, number];
  return sorted;
}

/** True if this carrier group can physically carry the item at all (real dims/weight,
 *  NOT dimensional/billable weight -- absolute max is a physical carrier limit). */
function withinAbsoluteMax(carrier: 'USPS' | 'UPS' | 'FEDEX', dims: PackageDims, weightOz: number): boolean {
  const weightLb = Math.max(0, weightOz || 0) / 16;
  const sorted = sortedRealDims(dims);
  const lengthPlusGirth = sorted ? sorted[0] + 2 * (sorted[1] + sorted[2]) : 0;
  if (carrier === 'USPS') {
    if (weightLb > USPS_ABSOLUTE_MAX.weightLb) return false;
    if (sorted && lengthPlusGirth > USPS_ABSOLUTE_MAX.lengthPlusGirthIn) return false;
    return true;
  }
  // UPS + FedEx share the same absolute max (ADR-103 §2D).
  if (weightLb > UPS_FEDEX_ABSOLUTE_MAX.weightLb) return false;
  if (sorted) {
    if (sorted[0] > UPS_FEDEX_ABSOLUTE_MAX.lengthIn) return false;
    if (lengthPlusGirth > UPS_FEDEX_ABSOLUTE_MAX.lengthPlusGirthIn) return false;
  }
  return true;
}

/**
 * Additive oversize surcharge for one carrier candidate (ADR-103 Phase 4). Uses REAL
 * dims/weight (not dimensional/billable weight) for trigger checks, matching how real
 * carriers determine AHS/Large-Package eligibility. Returns the surcharge amount (0 if
 * none triggered), which type fired, and -- for Large Package only -- the minimum
 * billable weight floor that should apply to the base-rate lookup itself.
 */
function computeSurchargeForCarrier(
  carrier: 'USPS' | 'UPS' | 'FEDEX',
  zone: ZoneKey,
  dims: PackageDims,
  weightOz: number,
  packageType: string | null | undefined
): { amount: number; type: 'AHS' | 'LARGE_PACKAGE' | 'USPS_NONSTANDARD' | null; minBillableLb: number | null } {
  const weightLb = Math.max(0, weightOz || 0) / 16;
  const sorted = sortedRealDims(dims);
  const lengthPlusGirth = sorted ? sorted[0] + 2 * (sorted[1] + sorted[2]) : 0;
  const volumeCuIn = sorted ? sorted[0] * sorted[1] * sorted[2] : 0;

  if (carrier === 'USPS') {
    // USPS nonstandard fees are independent, length-band + volume, additive to each other.
    let fee = 0;
    if (sorted) {
      if (sorted[0] > 30) fee += USPS_NONSTANDARD_FEE_TABLE.lengthOver30In;
      else if (sorted[0] > 22) fee += USPS_NONSTANDARD_FEE_TABLE.lengthOver22Under30In;
      if (volumeCuIn > 2 * 1728) fee += USPS_NONSTANDARD_FEE_TABLE.volumeOver2CuFt;
    }
    return { amount: round2(fee), type: fee > 0 ? 'USPS_NONSTANDARD' : null, minBillableLb: null };
  }

  // UPS / FedEx: Large Package supersedes AHS when both would trigger (real-carrier
  // behavior -- a package is billed as ONE surcharge tier, not stacked, ADR-103 §2D).
  const largePackageTriggered =
    lengthPlusGirth > 130 || (!!sorted && sorted[0] > 96) || weightLb > 110 || volumeCuIn > 17280;
  if (largePackageTriggered) {
    return { amount: LARGE_PACKAGE_SURCHARGE_TABLE[zone], type: 'LARGE_PACKAGE', minBillableLb: LARGE_PACKAGE_MIN_BILLABLE_LB };
  }

  const dimensionTriggered = !!sorted && (sorted[0] > 48 || sorted[1] > 30);
  const weightTriggered = weightLb > 50;
  const packagingTriggered = !!packageType && AHS_PACKAGING_TYPES.has(packageType);
  if (dimensionTriggered || weightTriggered || packagingTriggered) {
    // "one surcharge type charged per package even if multiple triggers fire" (ADR-103 §2D).
    return { amount: AHS_SURCHARGE_TABLE[zone], type: 'AHS', minBillableLb: null };
  }
  return { amount: 0, type: null, minBillableLb: null };
}

/** Cheapest carrier rate for an item at a given coverage zone, including any additive
 *  oversize surcharge and the cubic-tier alternative (ADR-103 Phases 3-4). Throws
 *  ShippingHardBlockError if the item exceeds the absolute max for every carrier. */
export function estimateCheapestRate(input: {
  weightOz: number;
  dims?: PackageDims;
  zone: ZoneKey;
  packageType?: string | null;
}): CheapestRate {
  const dims = input.dims ?? null;
  let best: CheapestRate | null = null;
  let anyCarrierViable = false;

  for (const c of CARRIER_TABLES) {
    if (!withinAbsoluteMax(c.carrier, dims, input.weightOz)) continue; // this carrier can't ship it
    anyCarrierViable = true;

    const surcharge = computeSurchargeForCarrier(c.carrier, input.zone, dims, input.weightOz, input.packageType);
    // Large Package's 90lb minimum billable weight applies to the BASE rate lookup
    // itself (ADR-103 §2D), not just the surcharge -- floor the weight used for
    // billableLb's actual-weight input before computing dim-weight-vs-actual.
    const effectiveWeightOz =
      surcharge.minBillableLb != null ? Math.max(input.weightOz, surcharge.minBillableLb * 16) : input.weightOz;

    const { lb, basis } = billableLb(effectiveWeightOz, dims, c.divisor);
    const absoluteMaxLb = c.carrier === 'USPS' ? USPS_ABSOLUTE_MAX.weightLb : UPS_FEDEX_ABSOLUTE_MAX.weightLb;
    const baseRate = rateFromTable(c.table, lb, input.zone, absoluteMaxLb);
    const rate = round2(baseRate + surcharge.amount);

    if (!best || rate < best.rate) {
      best = {
        carrier: c.carrier,
        rate,
        baseRate,
        surcharge: surcharge.amount,
        surchargeType: surcharge.type,
        basis,
        cubicTierLabel: null,
        zone: input.zone,
        fvfOnShipping: round2(rate * EBAY_SHIPPING_FVF_RATE),
        netToSeller: round2(rate - rate * EBAY_SHIPPING_FVF_RATE),
      };
    }
  }

  if (!anyCarrierViable) {
    throw new ShippingHardBlockError(
      `Item exceeds the absolute carrier max for USPS, UPS, and FedEx Ground (weight=${round2((input.weightOz || 0) / 16)}lb, dims=${JSON.stringify(dims)}). This item cannot be shipped by any modeled carrier and must not be priced.`
    );
  }

  // ADR-103 Phase 3: evaluate cubic-tier pricing alongside weight/dim-weight pricing,
  // pick whichever is cheaper (same pattern already used to pick cheapest carrier).
  // Inert today -- see CUBIC_TIER_TABLE header -- until real per-tier prices land.
  const cubic = evaluateCubicTier(dims);
  if (cubic && cubic.rate < best!.rate) {
    best = {
      carrier: 'USPS',
      rate: cubic.rate,
      baseRate: cubic.rate,
      surcharge: 0,
      surchargeType: null,
      basis: 'cubic',
      cubicTierLabel: cubic.tierLabel,
      zone: input.zone,
      fvfOnShipping: round2(cubic.rate * EBAY_SHIPPING_FVF_RATE),
      netToSeller: round2(cubic.rate - cubic.rate * EBAY_SHIPPING_FVF_RATE),
    };
  }

  return best!;
}

/**
 * Resolve the organizer coverage zone, then return the cheapest carrier rate
 * (including any additive oversize surcharge -- ADR-103 Phase 4). Async since
 * ADR-103 Phase 2's zone resolution can check the UspsZoneChartEntry cache (a DB
 * read) before falling back to the mileage approximation -- see resolveCoverageZone.
 * Callers should catch ShippingHardBlockError and fail safe (never crash a request).
 */
export async function computeCheapestForOrigin(input: {
  weightOz: number;
  dims?: PackageDims;
  origin: { zip?: string | null; lat?: number | null; lng?: number | null };
  packageType?: string | null;
}): Promise<CheapestRate> {
  const zone = await resolveCoverageZone(input.origin);
  return estimateCheapestRate({ weightOz: input.weightOz, dims: input.dims ?? null, zone, packageType: input.packageType ?? null });
}
