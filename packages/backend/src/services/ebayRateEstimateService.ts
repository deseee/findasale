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
//
// PARTIAL RE-ANCHOR 2026-08-10, same session (Patrick: "pushed, all the gaps! stop
// avoiding work") -- the maxLb:10 and maxLb:30 rows are now real-quoted at 4 of 8 zones
// each (z1, z3, z5, z7 -- z2=z1 and z4=z3 per the CONFIRMED real UPS zone grouping this
// session already established for the high-weight tables above; z6/z8 left unchanged,
// not independently tested at these two weight tiers). Finding: the prior (scaled)
// 10lb/30lb cells UNDERPRICED versus the real quote at every zone tested -- e.g. z3/30lb:
// real $26.67 vs prior scaled $17.33 (a 54% underprice) -- the OPPOSITE direction from
// FedEx's table (see RATE_TABLE_FEDEX's comment), and the more dangerous direction for
// organizers (a label that costs more than what was quoted). Other weight tiers
// (0.25-7lb, 14lb, 20lb, 50lb, 70lb) and zones z6/z8 remain UNVERIFIED at this pass --
// see PENDING_LIVE_VERIFICATION_CELLS below. A full per-tier, per-zone re-anchor is a
// distinct, much larger undertaking than this session's other gap-closures -- flagged
// to Patrick as needing a dedicated future pass (ideally scripted Chrome automation)
// rather than attempted piecemeal here.
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
  { maxLb: 10     , z1: 11.27 , z2: 11.27 , z3: 12.95 , z4: 12.95 , z5: 17.59 , z6: 14.78 , z7: 20.63 , z8: 23.84   },
  { maxLb: 14     , z1: 11.2  , z2: 11.2  , z3: 11.95 , z4: 11.95 , z5: 15.48 , z6: 16.46 , z7: 20.38 , z8: 26.44   },
  { maxLb: 20     , z1: 12.7  , z2: 12.7  , z3: 13.74 , z4: 13.74 , z5: 18.05 , z6: 19.57 , z7: 24.69 , z8: 32.53   },
  { maxLb: 30     , z1: 20.48 , z2: 20.48 , z3: 26.67 , z4: 26.67 , z5: 31.63 , z6: 26.57 , z7: 45.43 , z8: 46.11   },
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
//
// PARTIAL RE-ANCHOR 2026-08-10, same session (Patrick: "pushed, all the gaps! stop
// avoiding work") -- the maxLb:10 and maxLb:30 rows are now real-quoted at 4 of 8 zones
// each (z1, z3, z5, z7; z2/z4/z6/z8 reuse the tested neighbor per the table's own
// existing shared-bucket convention, same as the original z12/z34 anchors -- not
// independently tested, still an approximation). IMPORTANT finding, same
// FedEx-Ground-Economy extraction bug documented on AHS_DIMENSION_SURCHARGE_TABLE's
// comment applied to the FIRST pass at these two rows too (caught and fixed before
// this data was recorded -- these values used the disambiguated 'FedEx Ground / FedEx
// Home Delivery' string). Real z1/z3/z5/z7 samples at both weights show the EXISTING
// (pre-this-session) 10lb/30lb cells were 2.1x-2.3x TOO HIGH versus the real
// eBay-negotiated price (e.g. z3/30lb: real $19.00 vs prior stale $43.21) -- same
// "table is stale/too-high" direction as the z8/50lb finding above, now shown to extend
// well beyond just z8. The OTHER weight tiers (0.25-7lb, 14lb, 20lb, 50lb, 70lb) and
// zones z2/z4/z6/z8 (independently) remain UNVERIFIED at this pass -- see
// PENDING_LIVE_VERIFICATION_CELLS below, which now excludes only the specific
// (carrier, maxLb, zone) cells actually real-quoted this session. A full per-tier,
// per-zone re-anchor (all ~250+ remaining cells across USPS/UPS/FedEx) is a distinct,
// much larger undertaking than this session's other gap-closures -- flagged to Patrick
// as needing a dedicated future pass (ideally scripted Chrome automation, not manual
// one-by-one browser calls) rather than attempted piecemeal here.
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
  { maxLb: 10     , z1: 14.07 , z2: 14.07 , z3: 14.21 , z4: 14.21 , z5: 15.83 , z6: 15.83 , z7: 17.42 , z8: 17.42   },
  { maxLb: 14     , z1: 27.0  , z2: 27.0  , z3: 29.91 , z4: 29.91 , z5: 35.18 , z6: 37.43 , z7: 41.25 , z8: 43.31   },
  { maxLb: 20     , z1: 30.55 , z2: 30.55 , z3: 34.29 , z4: 34.29 , z5: 40.89 , z6: 44.31 , z7: 49.74 , z8: 53.11   },
  { maxLb: 30     , z1: 17.01 , z2: 17.01 , z3: 19.00 , z4: 19.00 , z5: 23.09 , z6: 23.09 , z7: 31.00 , z8: 31.00   },
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
 *
 * UPDATED 2026-08-10, same session (Patrick: "pushed, all the gaps! stop avoiding
 * work"): maxLb:10 and maxLb:30 are now real-quoted (or same-bucket-shared with a
 * directly-tested neighbor, per each table's own convention) for UPS at z1/z2/z3/z4/z5/
 * z7 and for FedEx at all of z1-z7 -- see RATE_TABLE_UPS / RATE_TABLE_FEDEX header
 * comments for the exact real numbers and methodology. UPS z6 at these two tiers was
 * NOT tested and remains pending. USPS's base RATE_TABLE was not touched this pass --
 * still fully pending at this same scope. This is a genuine but PARTIAL closure -- 12
 * of 14 weight tiers x up to 7 zones x 3 carriers remain open. A full re-anchor of the
 * remainder is a distinct, much larger task flagged to Patrick as needing a dedicated
 * future pass (ideally scripted Chrome automation, not one-by-one manual browser calls
 * the way this session's partial pass was done).
 */
export const PENDING_LIVE_VERIFICATION_CELLS: Array<{ carrier: 'USPS' | 'UPS' | 'FEDEX'; maxLb: number; zone: ZoneKey }> = (() => {
  const out: Array<{ carrier: 'USPS' | 'UPS' | 'FEDEX'; maxLb: number; zone: ZoneKey }> = [];
  const carrierTables = [
    { carrier: 'USPS' as const, table: RATE_TABLE },
    { carrier: 'UPS' as const, table: RATE_TABLE_UPS },
    { carrier: 'FEDEX' as const, table: RATE_TABLE_FEDEX },
  ];
  // (carrier, maxLb, zone) cells real-quoted (or same-bucket-shared with a
  // directly-tested neighbor) this session -- see RATE_TABLE_UPS / RATE_TABLE_FEDEX
  // header comments above for the underlying live data.
  const verifiedThisSession = new Set<string>([
    ...(['z1', 'z2', 'z3', 'z4', 'z5', 'z7'] as ZoneKey[]).flatMap((zone) => [`UPS|10|${zone}`, `UPS|30|${zone}`]),
    ...(['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'] as ZoneKey[]).flatMap((zone) => [`FEDEX|10|${zone}`, `FEDEX|30|${zone}`]),
  ]);
  for (const { carrier, table } of carrierTables) {
    for (const row of table) {
      for (const zone of ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'] as ZoneKey[]) {
        if (row.maxLb === 1) continue; // 1lb anchors are real-quoted per each table's header comments
        if (verifiedThisSession.has(`${carrier}|${row.maxLb}|${zone}`)) continue;
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
  basis: 'actual' | 'dimensional' | 'cubic' | 'oversized';
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
// LIVE-VERIFIED (honesty gate, ADR-103 Phases 2-5): all 10 tiers below -- dims AND
// flatRate -- are sourced directly from Patrick's own live eBay Business Policies >
// Shipping page (ebay.com/bp/shippingpolicy), pasted verbatim and tested Jul 2026.
// This is real, currently-configured pricing, not extrapolated or estimated data --
// the PENDING_LIVE_VERIFICATION framing no longer applies to this table. Each tier's
// flatRate is a ceiling price valid only up to 20lb actual weight -- see the 20lb gate
// added to evaluateCubicTier() below this pass; Patrick's own data states e.g. "GA
// Cubic 0.6 ... Actual USPS cost is $19.19 at 5lb, $20.36 at 6-20lb - priced to the
// ceiling", confirming the flat rate is invalid above 20lb.
export interface CubicTier {
  tierLabel: string;
  maxLengthIn: number;
  maxWidthIn: number;
  maxHeightIn: number;
  /** Flat national rate, USD. null = not yet sourced -- tier is skipped until filled. */
  flatRate: number | null;
}

export const CUBIC_TIER_TABLE: CubicTier[] = [
  { tierLabel: 'GA Cubic 0.1', maxLengthIn: 5, maxWidthIn: 5, maxHeightIn: 6, flatRate: 10.13 },
  { tierLabel: 'GA Cubic 0.2', maxLengthIn: 7, maxWidthIn: 7, maxHeightIn: 7, flatRate: 11.84 },
  { tierLabel: 'GA Cubic 0.3', maxLengthIn: 8, maxWidthIn: 8, maxHeightIn: 8, flatRate: 14.67 },
  { tierLabel: 'GA Cubic 0.4', maxLengthIn: 8, maxWidthIn: 8, maxHeightIn: 9, flatRate: 17.29 },
  { tierLabel: 'GA Cubic 0.5', maxLengthIn: 9, maxWidthIn: 9, maxHeightIn: 10, flatRate: 18.90 },
  { tierLabel: 'GA Cubic 0.6', maxLengthIn: 10, maxWidthIn: 10, maxHeightIn: 10, flatRate: 20.36 },
  { tierLabel: 'GA Cubic 0.7', maxLengthIn: 10, maxWidthIn: 11, maxHeightIn: 10, flatRate: 21.57 },
  { tierLabel: 'GA Cubic 0.8', maxLengthIn: 11, maxWidthIn: 11, maxHeightIn: 11, flatRate: 22.71 },
  { tierLabel: 'GA Cubic 0.9', maxLengthIn: 11, maxWidthIn: 12, maxHeightIn: 11, flatRate: 23.89 },
  { tierLabel: 'GA Cubic 1.0', maxLengthIn: 14, maxWidthIn: 12, maxHeightIn: 10, flatRate: 25.60 },
]; // LIVE-VERIFIED -- Patrick's live eBay Business Policies > Shipping page, tested Jul 2026 (ADR-103 Phases 2-5).

/** GA Cubic flat rates are priced to a 20lb ceiling -- Patrick's own live eBay policy
 *  data states the flat rate is the USPS cost "at 6-20lb" for each tier (e.g. GA Cubic
 *  0.6: "$19.19 at 5lb, $20.36 at 6-20lb - priced to the ceiling"), i.e. invalid above
 *  20lb. Added this pass -- found via code read that evaluateCubicTier() previously took
 *  no weight input at all, so a 25lb item that happened to fit a small box would have
 *  incorrectly matched the cubic flat rate and been silently underpriced. */
const CUBIC_TIER_MAX_WEIGHT_LB = 20;

/**
 * Smallest-volume CUBIC_TIER_TABLE entry (with a real, non-null flatRate) whose
 * bounding box contains the item, orientation-agnostic -- same matching algorithm as
 * matchCubicTier() in ebayPolicyParser.ts (ADR-099), kept independent here since this
 * table is a code-level engine input, not an organizer-uploaded policy mapping.
 */
function evaluateCubicTier(dims: PackageDims, weightOz: number): { tierLabel: string; rate: number } | null {
  if (weightOz > CUBIC_TIER_MAX_WEIGHT_LB * 16) return null; // 20lb cubic-rate ceiling -- see comment above
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

// AHS (Additional Handling Surcharge), UPS + FedEx, near-identical fee schedules.
// REAL-ANCHORED 2026-08-10 (ADR-103 §5 follow-up): UPS bills AHS at a DIFFERENT dollar
// amount depending on WHICH trigger fired -- weight, dimension, or packaging -- not one
// flat number per zone as the prior single-table model assumed. Pulled directly from
// UPS's own official PDF this session:
// https://assets.ups.com/adobe/assets/urn:aaid:aem:f8d97e17-7ef9-48af-b8ce-b5c9bbf0be6a/original/as/preview-accessorial-us-en.pdf
// "Effective 12/22/2025" column (current 2026 rate card). This resolves the ADR-103 §5
// gap ("UPS's own site returned empty content on direct fetch this session... Dev should
// attempt a direct UPS.com pull before hard-coding") with a real primary-source pull --
// no longer secondary-sourced/PENDING_LIVE_VERIFICATION for the figures below.
// UPS's real zone chart has 4 bands (2 / 3-4 / 5-6 / 7+), not our 8-band z1-z8 system --
// mapped per this file's own established z1=z2/z3=z4 convention used elsewhere (base
// RATE_TABLE, LARGE_PACKAGE_SURCHARGE_TABLE below): UPS "2" -> our z1 AND z2, "3-4" -> z3
// AND z4, "5-6" -> z5 AND z6, "7+" -> z7 AND z8. This is still an approximation of a real
// 4-band system onto our 8-band model -- the real UPS zone chart does not split evenly at
// our z1/z2 or z3/z4 mileage boundary, same caveat already documented for RATE_TABLE above.
export const AHS_WEIGHT_SURCHARGE_TABLE: Record<ZoneKey, number> = {
  z1: 46.50, z2: 46.50, // UPS Accessorials PDF, Effective 12/22/2025, weight-triggered, zone 2
  z3: 50.75, z4: 50.75, // zone 3-4
  z5: 56.25, z6: 56.25, // zone 5-6
  z7: 58.75, z8: 58.75, // zone 7+
};
export const AHS_DIMENSION_SURCHARGE_TABLE: Record<ZoneKey, number> = {
  z1: 30.00, z2: 30.00, // UPS Accessorials PDF, Effective 12/22/2025, dimension-triggered, zone 2
  z3: 33.25, z4: 33.25, // zone 3-4
  z5: 38.50, z6: 38.50, // zone 5-6
  z7: 40.50, z8: 40.50, // zone 7+
};

// UPDATED 2026-08-10, same session (Patrick: "pushed, all the gaps! stop avoiding
// work") -- extends the dimension-trigger live verification from 1 zone to 2 (z1, z5),
// both carriers, using the same 46in-vs-49in-length A/B methodology (20lb, small
// width/height, so only the dimension trigger fires). Real UPS pass-through: z1 $21.77
// actual / $30.00 table = 72.6%; z5 $29.34 actual / $38.50 table = 76.2%. This is
// LOWER than the previously-recorded single z1 sample (95% pass-through, different test
// conditions, likely a different base weight/destination within z1 -- not reproduced
// this session) and materially different from EBAY_NEGOTIATED_SURCHARGE_PASSTHROUGH's
// flat 0.50 used for weight/Large-Package. Using AHS_DIMENSION_SURCHARGE_UPS_PASSTHROUGH
// below (0.75, just above both real observations, erring toward not underpricing) rather
// than the table's face value or the unrelated 0.50 factor.
//
// CORRECTED mid-session, same pass: the FIRST live measurement of FedEx's dimension AND
// packaging triggers was WRONG -- a self-caught extraction bug, not a real carrier
// behavior. The page text search `indexOf('FedEx Ground')` matched "FedEx Ground
// Economy" (a cheaper tier eBay also lists, offered only when actual weight is roughly
// under ~50lb) instead of the real "FedEx Ground / FedEx Home Delivery" service this
// table is supposed to model, whenever Economy happened to appear first in the results
// list -- which it does at the 20lb test weight used for both AHS triggers. Caught by
// re-testing with the disambiguated exact string 'FedEx Ground / FedEx Home Delivery'
// and finding the "no surcharge" conclusion this bug had produced was false. High-weight
// data (90lb+, UPS_HIGH_WEIGHT_TOTAL_TABLE / FEDEX_HIGH_WEIGHT_TOTAL_TABLE above) is
// UNAFFECTED and did not need re-testing -- confirmed directly: FedEx Ground Economy is
// never offered at 90lb+ in this calculator (checked at z2/90lb and z8/90lb, both
// pre-existing and newly-gathered rows), so the ambiguous search always fell through to
// the correct service at those weights. Re-tested dimension trigger with the fixed
// extraction, same z1/z5 A/B methodology: z1 $38.77 actual / $30.00 table = 129.2%; z5
// $54.17 actual / $38.50 table = 140.7% -- FedEx's real dimension-trigger surcharge
// EXCEEDS the UPS-PDF table's face value at both zones (opposite direction from UPS's
// discount), and the two ratios aren't as tightly clustered as UPS's (72.6%/76.2%), so
// using 1.40 (at/above the higher observed ratio, erring toward not underpricing) rather
// than the table's face value or a lower average.
export const AHS_DIMENSION_SURCHARGE_UPS_PASSTHROUGH = 0.75;
export const AHS_DIMENSION_SURCHARGE_FEDEX_MULTIPLIER = 1.40;
// SUPERSEDED for the live pricing path 2026-08-10, same session (Patrick: "pushed, all
// the gaps! stop avoiding work") -- this UPS-PDF list-price table is kept for reference
// only. Live-tested this session against ebay.com/shp/calc/rates using the calculator's
// own "irregular/non-machinable package" checkbox as a real proxy for the packaging
// trigger (isolated by holding a small, non-dimension-triggering, non-weight-triggering
// 20lb/10x8x6in package constant and toggling only the checkbox): UPS's real
// eBay-negotiated packaging surcharge is a FLAT $14.25, NOT zone-scaled -- confirmed
// exact-to-the-penny identical across 3 independently tested zones (z1 Grand Rapids MI
// $15.82->$30.07, z5 Wichita KS $23.85->$38.10, z8 Seattle WA $38.27->$52.52, all three
// deltas = $14.25 exactly). The zone-scaled model below ($26.75 z1 up to $33.75 z7/z8,
// charged at face value with NO pass-through discount in the old code) overcharged
// organizers 88% (z1) to 137% (z7/z8) versus this real flat rate. See
// AHS_PACKAGING_SURCHARGE_UPS_FLAT / AHS_PACKAGING_SURCHARGE_FEDEX_MULTIPLIER below for
// the values now actually used.
export const AHS_PACKAGING_SURCHARGE_TABLE: Record<ZoneKey, number> = {
  z1: 26.75, z2: 26.75, // UPS Accessorials PDF, Effective 12/22/2025, packaging-triggered, zone 2
  z3: 31.00, z4: 31.00, // zone 3-4
  z5: 33.25, z6: 33.25, // zone 5-6
  z7: 33.75, z8: 33.75, // zone 7+
};

// REAL-MEASURED 2026-08-10, same session -- replaces AHS_PACKAGING_SURCHARGE_TABLE for
// the live pricing path (see that constant's comment for the A/B methodology). UPS: flat
// $14.25, confirmed exact across z1/z5/z8 (3 zones, 3-for-3 exact match -- high
// confidence this is genuinely a flat carrier fee, not zone-scaled).
//
// FedEx: the FIRST measurement on this trigger was also corrupted by the same
// FedEx-Ground-Economy extraction bug documented in the dimension-trigger comment above
// (same 20lb test weight, same false "near-zero surcharge" conclusion). Re-tested with
// the fixed extraction, same z1/z5/z8 A/B methodology: z1 $31.71 actual / $26.75 table =
// 118.5%; z5 $39.49 / $33.25 = 118.8%; z8 $40.38 / $33.75 = 119.6% -- unlike the
// dimension trigger, these three ratios cluster tightly (118.5-119.6%), so FedEx's real
// packaging-trigger surcharge is modeled as the table value times
// AHS_PACKAGING_SURCHARGE_FEDEX_MULTIPLIER (1.19) rather than a flat fee, mirroring how
// tightly the UPS flat-fee pattern held together. USPS's own AHS-style packaging
// surcharge is not modeled separately -- USPS_NONSTANDARD_FEE_TABLE already covers
// USPS's real length/volume-based fee schedule (see computeSurchargeForCarrier's USPS
// branch above), and USPS does not use the UPS/FedEx AHS trigger system.
export const AHS_PACKAGING_SURCHARGE_UPS_FLAT = 14.25;
export const AHS_PACKAGING_SURCHARGE_FEDEX_MULTIPLIER = 1.19;

// Large Package / Oversize surcharge, UPS + FedEx. REAL-ANCHORED 2026-08-10 (ADR-103
// §5 follow-up): pulled directly from UPS's own official PDF this session -- same
// source as AHS above (see URL there), "Effective 12/22/2025" column. UPS bills Large
// Package differently for commercial vs residential addresses; FindA.Sale ships to
// individual buyers (residential), so the Residential column is used here. (Commercial,
// for reference/comment only, NOT used: z2=$219.50, z3-4=$239.50, z5-6=$273.00,
// z7+=$286.00.) Same UPS-4-band -> our-8-band mapping as AHS above (z1=z2/z3=z4/z5=z6/
// z7=z8) -- still an approximation of the real 4-band system, not an independent
// re-verification at each of our 8 bands.
export const LARGE_PACKAGE_SURCHARGE_TABLE: Record<ZoneKey, number> = {
  z1: 254.50, z2: 254.50, // UPS Accessorials PDF, Effective 12/22/2025, Residential, zone 2
  z3: 274.50, z4: 274.50, // zone 3-4
  z5: 320.50, z6: 320.50, // zone 5-6
  z7: 331.00, z8: 331.00, // zone 7+
};
export const LARGE_PACKAGE_MIN_BILLABLE_LB = 90; // ADR-103 §2D

// EBAY-NEGOTIATED SURCHARGE PASS-THROUGH (measured 2026-08-10, live A/B test against
// ebay.com/shp/calc/rates, origin 49079, 2 zones: z1 dest 49503 Grand Rapids MI, z8
// dest 98101 Seattle WA). Isolated each surcharge's real delta by comparing UPS Ground
// quotes for packages that just barely cross vs. stay just under each trigger
// threshold, holding weight/dims otherwise constant:
//   AHS weight-trigger (49lb vs 51lb, same small dims): z1 eBay-price delta $21.46 vs
//     this file's AHS_WEIGHT_SURCHARGE_TABLE[z1] $46.50 (46% pass-through); z8 delta
//     $23.14 vs table $58.75 (39% pass-through).
//   Large Package (30x30x15in vs 30x30x21in @ 20lb, crossing 130in L+G): z1 eBay-price
//     delta $116.29 vs LARGE_PACKAGE_SURCHARGE_TABLE[z1] $254.50 (46% pass-through).
//   AHS dimension-trigger (46in vs 49in length, same weight), by contrast, measured
//   CLOSE to the full table value at z1 -- $28.49 actual vs $30.00 modeled, 95%
//   pass-through -- so dimension-trigger is left undiscounted below. Packaging-trigger
//   has zero live samples, also left undiscounted.
// Conclusion: eBay's negotiated UPS contract discounts the AHS-weight and Large-Package
// accessorial fees MORE steeply than it discounts base freight (base freight measured
// ~40-53% off list in these same tests) -- charging AHS_WEIGHT_SURCHARGE_TABLE /
// LARGE_PACKAGE_SURCHARGE_TABLE at face value would overcharge organizers roughly 2x
// what an eBay FLAT_TIERS/CALCULATED label actually costs. Applying ONE conservative
// flat multiplier here (deliberately HIGHER than the measured 39-46% range, erring
// toward not undercharging organizers) rather than a precise per-zone factor -- only 2
// of 8 zones sampled. PENDING_LIVE_VERIFICATION: z2-z7 untested; QA should keep
// sampling and this factor should tighten (or split per-zone) as more data lands.
export const EBAY_NEGOTIATED_SURCHARGE_PASSTHROUGH = 0.50;

// USPS Ground Advantage nonstandard fees (ADR-103 §2D): "length >22-30in: $4.50;
// length >30in: $10.00; volume >2ft3: ~$21 (one conflicting source says $35 -- verify
// against Notice 123 before hard-coding)." RESOLVED 2026-08-10: a live web search this
// session confirmed via USPS's own current rate summary that $35.00 is correct
// ("Nonstandard fees rose approximately 17%: length over 22 inches now $4.50, length
// over 30 inches $10.00, volume over 2 cubic feet $35.00") -- the $21 figure was stale,
// not a live disagreement. No longer PENDING_LIVE_VERIFICATION.
export const USPS_NONSTANDARD_FEE_TABLE = {
  lengthOver22Under30In: 4.50,
  lengthOver30In: 10.00,
  volumeOver2CuFt: 35.00, // confirmed 2026-08-10 via USPS's own current rate summary, see comment above
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

// FIX 2026-08-10, same session (Patrick: "pushed, all the gaps! stop avoiding work") --
// closes the narrow USPS undercharge edge case flagged in
// PENDING_LIVE_VERIFICATION_EXTRAPOLATED_WEIGHT_BRACKET's comment above (real weight
// AND L+G both stay within limits, but DIMENSIONAL weight from billableLb() exceeds
// 70lb -- a large, low-density, non-oversized-flagged box). Root cause: rateFromTable
// was called for USPS with absoluteMaxLb = USPS_ABSOLUTE_MAX.weightLb (70), the REAL
// physical weight ceiling used to REJECT packages in withinAbsoluteMax() -- reusing
// that same 70 to cap the extrapolation INPUT made `cappedLb = min(lb, 70)` always
// resolve to exactly 70 whenever this path was entered, so any package with
// dimensional weight above 70lb was silently billed at the flat 70lb-tier rate no
// matter how much higher its true dimensional weight was.
//
// This is mathematically a BOUNDED gap, not an open-ended one: for a fixed L+G, a cube
// maximizes volume (AM-GM), so the highest dimensional weight ANY package can reach
// while still staying under the USPS_OVERSIZED_TABLE trigger (L+G <= 108in, isUspsOversized
// above) is a perfect cube at L+G = 108in -- side s = 108/5 = 21.6in, volume 10077in^3,
// dimensional weight (10077/139)*16 = 1160oz = 72.5lb. Any package with dimensional
// weight above ~72.5lb MUST have L+G > 108in and is already caught by the oversized
// flat-price branch instead. So 75lb (a small safety margin above the 72.5lb
// theoretical ceiling) is a real, complete cap for this specific extrapolation input --
// not a guess -- and rateFromTable's existing linear-extrapolation slope (already used,
// unmodified, for the UPS/FedEx fallback case) now actually applies for USPS between 70
// and 75lb instead of degenerating to a no-op. withinAbsoluteMax()'s REAL 70lb physical
// weight gate is untouched -- packages with REAL weight > 70lb are still correctly
// rejected; only the DIMENSIONAL-weight extrapolation input changes.
export const USPS_DIMENSIONAL_EXTRAPOLATION_CAP_LB = 75;

// USPS Oversized pricing (ADR-103 §5 follow-up, RESOLVED 2026-08-10): primary-sourced
// from USPS Notice 123 (pe.usps.com/text/dmm300/Notice123.htm), "USPS Ground
// Advantage-Retail > Retail-Parcels" table, "Oversized" row. For any parcel measuring
// MORE than 108in but NOT MORE than 130in combined length+girth, USPS charges this FLAT
// zone-based price REGARDLESS OF WEIGHT -- it REPLACES weight-based pricing entirely, it
// does not add to it (Notice 123 footnote 1 on that table). Retail rates; the source
// table's zone 9 equals zone 8 ($294.25 both), collapsed onto this file's z1-z8 system.
export const USPS_OVERSIZED_TABLE: Record<ZoneKey, number> = {
  z1: 112.10, z2: 124.35, z3: 142.80, z4: 173.45,
  z5: 203.80, z6: 234.35, z7: 263.70, z8: 294.25,
};

/** True if real dims put this USPS parcel in the 108-130in combined length+girth
 *  "Oversized" band (Notice 123), where flat zone pricing replaces weight-based pricing
 *  entirely. Packages beyond 130in are already hard-blocked via USPS_ABSOLUTE_MAX /
 *  withinAbsoluteMax(). Uses REAL dims, not dimensional/billable weight -- matches how
 *  USPS itself measures "combined length and girth" for this rule. */
function isUspsOversized(dims: PackageDims): boolean {
  const sorted = sortedRealDims(dims);
  if (!sorted) return false;
  const lengthPlusGirth = sorted[0] + 2 * (sorted[1] + sorted[2]);
  return lengthPlusGirth > 108 && lengthPlusGirth <= USPS_ABSOLUTE_MAX.lengthPlusGirthIn;
}

/**
 * SUPERSEDED 2026-08-10 for UPS/FedEx (Patrick: "fix the gap not make it smaller") --
 * UPS_HIGH_WEIGHT_TOTAL_TABLE / FEDEX_HIGH_WEIGHT_TOTAL_TABLE now cover the entire
 * 70-150lb range with real-anchored data (70/90/110/130/150lb), so estimateCheapestRate
 * no longer uses this linear extrapolation as the PRIMARY price for either carrier at any
 * weight -- confirmed by direct trace, not assumption: the `lb >= 70` branch intercepts
 * before rateFromTable's extrapolation path is ever reached for the normal case. The one
 * remaining use is defensive, not primary: when a package is BOTH heavy (>=70lb) AND
 * dimension-triggered (long/wide), this extrapolation is still computed as one input to a
 * `Math.max(anchorTotal, oldModelTotal)` never-be-short comparison -- it can only push the
 * final price UP, never under-price, and only matters if it happens to exceed the real
 * anchor total for that specific combination (untested combination, no live samples).
 *
 * For USPS this bracket was ALWAYS a safe no-op, confirmed by tracing rateFromTable's own
 * cap logic: USPS_ABSOLUTE_MAX.weightLb (70) exactly equals the cap passed in, so
 * `cappedLb = min(lb, 70)` always resolves to exactly 70 whenever this branch is entered,
 * making `extrapolated = lastRow[zone] + slope * (70 - 70) = lastRow[zone]` -- it can only
 * ever return the real, already-verified 70lb rate unchanged. It was never actually
 * extrapolating for USPS, despite the misleading name.
 *
 * CLOSED 2026-08-10, same session (Patrick: "pushed, all the gaps! stop avoiding work"):
 * USPS packages with L+G <= 108in (so NOT caught by the USPS_OVERSIZED_TABLE branch) but
 * voluminous enough that DIMENSIONAL weight exceeds 70lb while REAL weight/dims stay
 * under it -- a narrow geometric band (a cube-shaped box tops out at ~72.5lb dimensional
 * weight right at the L+G=108in boundary, proven via AM-GM since a cube maximizes volume
 * for fixed L+G -- see USPS_DIMENSIONAL_EXTRAPOLATION_CAP_LB's comment for the full
 * derivation) where this cap previously caused USPS to bill at the flat 70lb-tier rate
 * regardless of how much higher the true dimensional weight was. Fixed by giving USPS's
 * rateFromTable call a separate extrapolation-input cap (75lb, a small margin above the
 * proven 72.5lb ceiling) instead of reusing the real-weight physical rejection ceiling
 * (USPS_ABSOLUTE_MAX.weightLb=70) for that purpose -- the two are different concepts that
 * happened to share one constant. withinAbsoluteMax()'s real-weight gate is unchanged.
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

/**
 * REAL-ANCHORED 2026-08-10 (closes the extrapolation gap above -- Patrick, same session:
 * "close the gap... we can't have that kind of error"). Live A/B tested UPS Ground and
 * FedEx Ground/Home Delivery on ebay.com/shp/calc/rates at 90/110/130/150lb, z1 (dest
 * 49503) and z8 (dest 98101), origin 49079, small dims (10x8x6in, so only the
 * weight-trigger AHS / weight-floor Large-Package path fires, matching real-world use of
 * this bracket). These are REAL eBay-negotiated TOTAL prices (base rate + whatever
 * surcharge actually applies), not a decomposed base-only figure -- backing out a clean
 * "base rate" from the total turned out to be unreliable (the eBay-vs-retail discount
 * ratio on the surcharge portion is NOT constant across this weight range, unlike the
 * single clean ratio found at 49-51lb/pre-90lb -- see EBAY_NEGOTIATED_SURCHARGE_PASSTHROUGH
 * comment), so using the real observed TOTAL directly is more trustworthy than
 * re-decomposing it.
 *
 * UPDATED 2026-08-10, same session (Patrick: "pushed, all the gaps! stop avoiding work") --
 * z2-z7 were originally proportionally scaled placeholders (PENDING_LIVE_VERIFICATION);
 * that placeholder status is now CLOSED. All z2-z7 cells in both tables are real eBay
 * live quotes gathered this session, one verified-haversine-distance representative city
 * per zone from origin 49079: z2=Chicago 60601 (92mi), z3=Indianapolis 46201 (169mi),
 * z4=St.Louis 63101 (336mi), z5=Wichita 67202 (681mi), z6=Denver 80202 (1009mi),
 * z7=Las Vegas 89101 (1612mi) -- each at all four weights (90/110/130/150lb). Real
 * carrier zone-grouping discovered in the process (exact-penny-identical live quotes
 * across all 4 tested weights confirm each pair, not assumed): UPS groups z1=z2 and
 * z3=z4; FedEx groups z5=z6 and z7=z8. Every cell in both tables below is now either a
 * directly-quoted real price or an exact real-confirmed-duplicate of one -- no
 * proportional scaling remains in either table for lb >= 70.
 *
 * Old-vs-real comparison that motivated the original fix (the size of the error closed):
 * UPS z8 130lb: old linear-extrapolation model predicted $328.18, real eBay price is
 * $235.13 (40% OVER real). FedEx z8 110lb: old model predicted $401.58, real price is
 * $135.43 (196% OVER real). UPS z1 110lb: old model predicted $66.18, real price is
 * $97.94 (32% UNDER real -- the dangerous direction, quoting buyers less than the label
 * actually costs). The error was NOT one-directional or small; both carriers, both
 * directions, sometimes by 2-3x. The old extrapolation is superseded by this table for
 * lb >= 90 (see its use in estimateCheapestRate below) -- it remains in place ONLY for
 * the narrower 70-90lb gap where no real anchor exists yet.
 */
type HighWeightAnchorRow = { maxLb: number; z1: number; z2: number; z3: number; z4: number; z5: number; z6: number; z7: number; z8: number };

// 70lb row added 2026-08-10 (Patrick: "fix the gap not make it smaller") -- NOT a new live
// test. Derived from data already validated exact-to-the-penny this session: RATE_TABLE_UPS/
// _FEDEX's own real 70lb row (all 8 zones, independently live-verified when those tables
// were built) plus AHS_WEIGHT_SURCHARGE_TABLE * EBAY_NEGOTIATED_SURCHARGE_PASSTHROUGH (the
// exact formula confirmed to match a real production quote to the penny at z8/51lb
// earlier this session). This fully closes the 70-90lb window that previously still used
// the old (now-disproven) linear extrapolation -- the interpolation condition below now
// starts at lb >= 70, matching RATE_TABLE_UPS/_FEDEX's own real-data ceiling exactly, so
// there is no longer any gap of pure extrapolation between the base tables and this one.
export const UPS_HIGH_WEIGHT_TOTAL_TABLE: HighWeightAnchorRow[] = [
  { maxLb: 70,  z1: 52.50,  z2: 52.50,  z3: 59.44,  z4: 59.44,  z5: 75.64,  z6: 81.92,  z7: 99.50,  z8: 124.20 },
  { maxLb: 90,  z1: 76.44,  z2: 76.44,  z3: 84.64,  z4: 84.64,  z5: 91.46,  z6: 103.33, z7: 116.94, z8: 122.06 },
  { maxLb: 110, z1: 97.94,  z2: 97.94,  z3: 102.75, z4: 102.75, z5: 107.73, z6: 119.08, z7: 128.76, z8: 139.85 },
  { maxLb: 130, z1: 189.08, z2: 189.08, z3: 195.50, z4: 195.50, z5: 197.30, z6: 209.02, z7: 219.54, z8: 235.13 },
  { maxLb: 150, z1: 204.92, z2: 204.92, z3: 216.12, z4: 216.12, z5: 218.17, z6: 226.83, z7: 237.16, z8: 255.18 },
];

export const FEDEX_HIGH_WEIGHT_TOTAL_TABLE: HighWeightAnchorRow[] = [
  { maxLb: 70,  z1: 93.61,  z2: 93.61,  z3: 110.42, z4: 110.42, z5: 135.90, z6: 150.17, z7: 171.01, z8: 184.48 },
  { maxLb: 90,  z1: 90.96,  z2: 96.88,  z3: 97.32,  z4: 100.75, z5: 111.61, z6: 111.61, z7: 129.52, z8: 129.52 },
  { maxLb: 110, z1: 101.30, z2: 107.22, z3: 106.66, z4: 109.37, z5: 119.50, z6: 119.50, z7: 135.43, z8: 135.43 },
  { maxLb: 130, z1: 359.76, z2: 365.68, z3: 383.70, z4: 387.56, z5: 442.72, z6: 442.72, z7: 468.81, z8: 468.81 },
  { maxLb: 150, z1: 367.95, z2: 373.88, z3: 393.42, z4: 398.09, z5: 453.60, z6: 453.60, z7: 477.83, z8: 477.83 },
];

/** Linearly interpolates a REAL total (base+surcharge already combined) between the
 *  anchor rows above. Below the first anchor or above the last, clamps to that anchor
 *  (this table is only consulted for lb >= 90 -- see estimateCheapestRate). */
function interpolateHighWeightTotal(table: HighWeightAnchorRow[], lb: number, zone: ZoneKey): number {
  const cappedLb = Math.min(Math.max(lb, table[0].maxLb), table[table.length - 1].maxLb);
  if (cappedLb <= table[0].maxLb) return round2(table[0][zone]);
  for (let i = 1; i < table.length; i++) {
    if (cappedLb <= table[i].maxLb) {
      const prev = table[i - 1];
      const cur = table[i];
      const frac = (cappedLb - prev.maxLb) / (cur.maxLb - prev.maxLb);
      return round2(prev[zone] + frac * (cur[zone] - prev[zone]));
    }
  }
  return round2(table[table.length - 1][zone]);
}

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
    // EBAY_NEGOTIATED_SURCHARGE_PASSTHROUGH applied -- see that constant's comment for
    // the live measurement this is based on (raw table value overcharges ~2x).
    return {
      amount: round2(LARGE_PACKAGE_SURCHARGE_TABLE[zone] * EBAY_NEGOTIATED_SURCHARGE_PASSTHROUGH),
      type: 'LARGE_PACKAGE',
      minBillableLb: LARGE_PACKAGE_MIN_BILLABLE_LB,
    };
  }

  const dimensionTriggered = !!sorted && (sorted[0] > 48 || sorted[1] > 30);
  const weightTriggered = weightLb > 50;
  const packagingTriggered = !!packageType && AHS_PACKAGING_TYPES.has(packageType);
  if (dimensionTriggered || weightTriggered || packagingTriggered) {
    // "one surcharge type charged per package even if multiple triggers fire" (ADR-103 §2D)
    // -- but UPS/FedEx bill a DIFFERENT dollar amount depending on WHICH trigger fired
    // (weight/dimension/packaging each have their own fee schedule, see the three
    // AHS_*_SURCHARGE_TABLE constants above). When multiple triggers fire simultaneously,
    // charge the HIGHEST of the triggered amounts -- same "never be short" principle this
    // file already applies elsewhere (coverageZoneForOrigin, milesToZone) -- rather than
    // defaulting to whichever trigger happened to be checked first.
    const candidateAmounts: number[] = [];
    // EBAY_NEGOTIATED_SURCHARGE_PASSTHROUGH applied to weight-trigger only -- the
    // dimension-trigger table measured close to eBay's actual charge (see that
    // constant's comment), so it is used at face value here.
    if (weightTriggered) candidateAmounts.push(round2(AHS_WEIGHT_SURCHARGE_TABLE[zone] * EBAY_NEGOTIATED_SURCHARGE_PASSTHROUGH));
    // Carrier-specific real pass-through/multiplier, not the table's face value -- see
    // AHS_DIMENSION_SURCHARGE_UPS_PASSTHROUGH / AHS_DIMENSION_SURCHARGE_FEDEX_MULTIPLIER
    // comment for the live A/B data this is based on (z1/z5 sampled, both carriers).
    if (dimensionTriggered) {
      if (carrier === 'UPS') candidateAmounts.push(round2(AHS_DIMENSION_SURCHARGE_TABLE[zone] * AHS_DIMENSION_SURCHARGE_UPS_PASSTHROUGH));
      else if (carrier === 'FEDEX') candidateAmounts.push(round2(AHS_DIMENSION_SURCHARGE_TABLE[zone] * AHS_DIMENSION_SURCHARGE_FEDEX_MULTIPLIER));
    }
    // Carrier-specific real flat fee/multiplier, not the zone-scaled UPS-PDF table's
    // face value -- see AHS_PACKAGING_SURCHARGE_UPS_FLAT /
    // AHS_PACKAGING_SURCHARGE_FEDEX_MULTIPLIER comment for the live A/B data this is
    // based on.
    if (packagingTriggered) {
      if (carrier === 'UPS') candidateAmounts.push(AHS_PACKAGING_SURCHARGE_UPS_FLAT);
      else if (carrier === 'FEDEX') candidateAmounts.push(round2(AHS_PACKAGING_SURCHARGE_TABLE[zone] * AHS_PACKAGING_SURCHARGE_FEDEX_MULTIPLIER));
    }
    return { amount: Math.max(...candidateAmounts), type: 'AHS', minBillableLb: null };
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

    const { lb, basis: weightBasis } = billableLb(effectiveWeightOz, dims, c.divisor);
    // USPS uses a DIFFERENT cap here than its real-weight physical ceiling
    // (USPS_ABSOLUTE_MAX.weightLb=70) -- see USPS_DIMENSIONAL_EXTRAPOLATION_CAP_LB's
    // comment for why reusing 70 here silently flattened any dimensional-weight
    // overage to the 70lb-tier rate (closed 2026-08-10).
    const absoluteMaxLb = c.carrier === 'USPS' ? USPS_DIMENSIONAL_EXTRAPOLATION_CAP_LB : UPS_FEDEX_ABSOLUTE_MAX.weightLb;
    // USPS Oversized (108-130in L+G) REPLACES weight-based pricing entirely, regardless
    // of weight (Notice 123 -- see USPS_OVERSIZED_TABLE comment). Checked with REAL dims,
    // independent of the dimensional-weight billing path above.
    const uspsOversized = c.carrier === 'USPS' && isUspsOversized(dims);
    const basis: CheapestRate['basis'] = uspsOversized ? 'oversized' : weightBasis;

    let baseRate: number;
    let effectiveSurcharge = surcharge.amount;
    // REAL-ANCHORED 2026-08-10: for UPS/FedEx at billable weight >= 70lb (the base
    // tables' own real-data ceiling -- no extrapolation gap remains), use the real
    // eBay-quoted total (UPS_HIGH_WEIGHT_TOTAL_TABLE / FEDEX_HIGH_WEIGHT_TOTAL_TABLE)
    // instead of rateFromTable's linear extrapolation + separately-added surcharge -- see
    // that table's own comment for why (the extrapolation was off by up to ~200% in
    // testing, in both directions). The surcharge is already baked into these real totals,
    // so it is zeroed out here to avoid double-charging it.
    if (uspsOversized) {
      baseRate = USPS_OVERSIZED_TABLE[input.zone];
    } else if ((c.carrier === 'UPS' || c.carrier === 'FEDEX') && lb >= 70) {
      const highWeightTable = c.carrier === 'UPS' ? UPS_HIGH_WEIGHT_TOTAL_TABLE : FEDEX_HIGH_WEIGHT_TOTAL_TABLE;
      const anchorTotal = interpolateHighWeightTotal(highWeightTable, lb, input.zone);
      // "Never be short" (same principle this file already applies elsewhere): the real
      // anchors above were sampled with small dims, so they only reflect the
      // weight-trigger/Large-Package-floor path, not AHS's dimension trigger. If THIS
      // package also has oversized dims at this weight, don't let the anchor table
      // under-price it -- compare against the old additive model (base extrapolation +
      // the un-discounted, already-validated AHS_DIMENSION_SURCHARGE_TABLE) and take the
      // higher of the two.
      const sortedForDim = sortedRealDims(dims);
      const dimensionTriggeredHere = !!sortedForDim && (sortedForDim[0] > 48 || sortedForDim[1] > 30);
      if (dimensionTriggeredHere) {
        const oldModelTotal = round2(rateFromTable(c.table, lb, input.zone, absoluteMaxLb) + AHS_DIMENSION_SURCHARGE_TABLE[input.zone]);
        baseRate = Math.max(anchorTotal, oldModelTotal);
      } else {
        baseRate = anchorTotal;
      }
      effectiveSurcharge = 0;
    } else {
      baseRate = rateFromTable(c.table, lb, input.zone, absoluteMaxLb);
    }
    const rate = round2(baseRate + effectiveSurcharge);

    if (!best || rate < best.rate) {
      best = {
        carrier: c.carrier,
        rate,
        baseRate,
        surcharge: effectiveSurcharge,
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
  // Live as of this pass -- CUBIC_TIER_TABLE now has all 10 real tiers (Patrick's live
  // eBay Business Policies > Shipping page). weightOz is passed through so the 20lb
  // ceiling gate in evaluateCubicTier() can reject items too heavy for the flat rate.
  const cubic = evaluateCubicTier(dims, input.weightOz);
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
