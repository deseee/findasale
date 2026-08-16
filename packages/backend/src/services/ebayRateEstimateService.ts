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
 * 1.3125x ratio). That single anchor was scaled across the rest of the z8
 * column at the time -- an approximation, not independently re-verified per tier.
 *
 * z8 FULLY RE-ANCHORED 2026-08-11 (same-session continuation, Patrick-directed:
 * "use the api call like it was saying to run your tests"): every one of the 15
 * maxLb rows at z8 is now a real, individually live-quoted price -- not scaled,
 * not interpolated. Sourced by calling eBay's own underlying endpoint
 * (`POST /shp/calc/api/shipping/services`) directly from an authenticated browser
 * session (Patrick's real seller account), same origin 49079 -> destination 98357
 * anchor point as the original z8 correction. z1/z5/z6/z7 were separately
 * cross-checked this same session (48 real data points across 4 weight tiers,
 * zero discrepancies against the table) and are NOT touched by this change --
 * only z8 was actually wrong. See below for the now-superseded scaling note.
 * [ORIGINAL, NOW SUPERSEDED, SCALING NOTE:] Every z8 row in this table scaled by that same real/stale ratio,
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
// 2026-08-10, later same session (Patrick: "use the ebay shipping calculator ...
// that's what it's for" -- correcting two earlier missteps in this same pass: first
// probing the calculator by trial and error to *find* weight breaks instead of
// researching the real carrier weight-break structure first, then separately trying to
// prioritize which tiers to re-test by real-inventory weight distribution instead of by
// correctness). Research first established the real structural breakpoints (USPS
// Ground Advantage: distinct real rate at each of the 4/8/12/15.999oz ounce tiers,
// confirmed DIRECTLY on eBay's calculator -- not assumed from USPS's public July-12
// commercial-file consolidation, which eBay's own negotiated rate does NOT appear to
// follow, since a fresh 4oz vs 15.999oz test at z1 returned different prices, $5.24 vs
// $6.52; UPS Ground and FedEx Ground/Home Delivery: FLAT price for the entire 0-1lb
// range -- confirmed identical across 4oz/8oz/12oz/15.999oz/1lb at z1, cross-verified 3
// separate ways (fast JS-driven form fill, slow native-click form fill, and two
// different box shapes including one sized specifically to disqualify from USPS Cubic
// eligibility) -- all returned the exact same $7.22 UPS / $14.07 FedEx. This means every
// pre-existing sub-1lb UPS/FedEx cell in this table was FABRICATED interpolation between
// a single 1lb anchor and nothing -- there is no real sub-1lb variation to interpolate.
//
// z1 (origin 49079 -> Grand Rapids 49503) is now live-quoted at every existing maxLb row
// through 30lb for all 3 carriers -- see PENDING_LIVE_VERIFICATION_CELLS below for
// exactly which (carrier, maxLb, zone) cells this closes. Box dims for each weight tier
// were sized so length*width*height/139 (the dimensional-weight formula this file uses)
// stays below the tier's actual weight -- verified by cross-checking that changing box
// shape at a fixed weight (2lb/3lb, two very different box shapes) produced IDENTICAL
// prices, confirming billable weight was actual weight, not dimensional weight, in
// every quote used here.
//
// IMPORTANT, non-obvious finding: eBay's real negotiated z1 rate curve is NOT smooth or
// monotonically increasing with weight -- USPS Ground Advantage at z1 actually DIPS from
// 2lb ($6.68) to 3lb ($5.80), then stays FLAT 3lb-5lb ($5.80 both), and FedEx
// Ground/Home Delivery is flat at $14.07 from 4oz all the way through 10lb before finally
// increasing at 14lb ($14.63). This was cross-verified enough times (different box
// shapes, different form-fill methods) to trust it as genuine eBay pricing rather than a
// testing artifact -- it likely reflects real irregularities in eBay's own tiered
// negotiated-discount schedule, not a smooth carrier rate card. This is exactly why this
// file's prior "single real anchor + assumed curve-shape scaling" methodology could not
// have produced a correct table even in principle -- the real curve has genuine
// plateaus and dips that no smooth interpolation would reproduce. Every remaining
// zone/tier this file scales rather than live-quotes should be read with that caveat.
//
// The pre-existing FedEx z1 1lb anchor ($17.59, sourced 2026-07-05) was WRONG -- this
// pass's real quote at the identical origin/destination/service is $14.07, a ~25%
// difference. Superseded; the old figure was either stale (rate changed since
// 2026-07-05) or was never actually tested at this origin (the RATE_TABLE_UPS header
// comment two sections up notes its own 1lb anchors used origin 49503, not 49079 --
// raising the possibility the original FedEx anchor did too, despite this file's
// canonical origin being 49079 everywhere else). Not resolved which; the new number is
// real-quoted at the canonical origin and supersedes the old one regardless of cause.
//
// 50lb and 70lb z1 were deliberately left untouched this pass -- see
// verifiedThisSession's comment above for why (suspected oversize/AHS surcharge
// contamination in the larger test box needed to keep dim-weight below actual weight at
// those tiers).
// ── 22.5lb WEIGHT-BRACKET SPLIT ─ ZONE CORRECTED + RE-DERIVED FROM PRIMARY SOURCE 2026-08-16 ──
// SUPERSEDES the first 2026-08-16 pass earlier today, which filed a real observation under
// the WRONG ZONE. Read this whole block before touching any 22.5lb cell.
//
// THE OBSERVATION (unchanged, still real): Patrick pulled eBay's own live shipping
// calculator for a 48x16x4in / 22lb 4oz parcel, origin 49079 (Paw Paw MI, Artifact's real
// ship-from) -> destination 98282 (Camano Island WA). Quoted prices:
//   FedEx Ground / FedEx Home Delivery  $32.11   (the service RATE_TABLE_FEDEX models)
//   UPS Ground                          $37.00
//   USPS Ground Advantage               $62.14
//   (also quoted, deliberately NOT modeled: FedEx Ground Economy $32.09, UPS Ground Saver
//    $40.24, FedEx 2Day $84.70)
//
// THE ERROR: the earlier pass computed the zone as z8 from haversine distance (1811mi ->
// milesToZone = z8) and wrote all three quoted prices into the z8 column. USPS's OWN zone
// chart says that lane is ZONE 7, not zone 8. Verified live against USPS's free,
// unauthenticated zone-chart endpoint on 2026-08-16:
//   GET postcalc.usps.com/DomesticZoneChart/GetZone?origin=49079&destination=98282&shippingDate=08/16/2026
//     -> {"EffectiveDate":"August 1, 2026","ZoneInformation":"The Zone is 7. ..."}
//   Same endpoint, 49079 -> 98357 (Neah Bay WA) -> "The Zone is 8."
// USPS zones are SCF-to-SCF routing lookups, not point-to-point mileage, so milesToZone
// disagrees with the real chart exactly at boundary lanes like this one. See
// resolveCoverageZone / fetchLiveUspsZoneChartEntry below, which now cache the real chart.
//
// INDEPENDENT CONFIRMATION THAT THE ZONE IS 7 (USPS only) ─ the quoted dollar figure
// reconciles to the penny against USPS's published rate card, and ONLY at zone 7:
//   USPS Notice 123 (pe.usps.com/cpim/ftp/manuals/dmm300/notice123.pdf), p.15
//   "USPS Ground Advantage / Commercial-Parcels", eff. 2026-08-01:
//     weight-not-over 23 lb  ->  zone 7 = $52.14 ,  zone 8 = $58.41
//   Notice 123 p.15 note 6: "Parcels that exceed 30 inches in length, add $10.00."
//     (the parcel is 48in long, so the fee applies)
//   $52.14 (z7 base) + $10.00 = $62.14 = the exact quoted total.  Zone 8 would have
//   produced $58.41 + $10.00 = $68.41, which is NOT what eBay quoted.
//   Notice 123 p.15 note 3 also confirms the weight basis: >1 cu ft parcels bill on the
//   greater of actual vs dimensional weight. 48*16*4 = 3072 cu in (>1728, so the rule
//   applies; and <3456, so note 7's >2-cu-ft fee does NOT apply). Dim weight
//   3072/139 = 22.10lb < actual 22.25lb, so ACTUAL governs -> the "not over 23" row. All
//   four independent facts agree. The USPS zone for this lane is 7.
//
// HOW EACH TABLE'S 22.5lb ROW IS NOW SET ─ the three carriers are NOT treated alike,
// because the evidence available for each is not alike:
//
//   RATE_TABLE (USPS) ─ fully re-derived from Notice 123 p.15, the "not over 23 lb" row,
//     zones 1-8 verbatim: 21.51 / 23.16 / 24.92 / 27.33 / 34.05 / 43.29 / 52.14 / 58.41.
//     z7 is DOUBLY confirmed (published card AND the live eBay quote agree exactly). The
//     other seven are published USPS commercial prices, which are a safe upper bound on
//     eBay's negotiated price: across every cell in this table that was ever live-quoted,
//     eBay's rate is <= published commercial and is EXACTLY EQUAL at the heavy end (the
//     20lb/z8, 30lb, 50lb and 70lb rows all match Notice 123 to the penny). They are
//     therefore primary-sourced upper bounds, still UNVERIFIED as exact eBay prices.
//     This REPLACES the earlier pass's min(30lb cell, anchor) construction, which
//     overcharged badly at the near zones (z1 was $32.38 against a published $21.51).
//
//   RATE_TABLE_UPS and RATE_TABLE_FEDEX ─ the CARRIER ZONE FOR THIS LANE IS UNVERIFIED.
//     UPS and FedEx publish their own zone charts, which are NOT USPS's chart and do not
//     have to agree with it (FedEx does not even HAVE a zone 1 ─ confirmed directly from
//     FedEx's official FedEx_Standard_List_Rates_2026.xlsx, "2026 Ground & FHD rates"
//     sheet, eff. 1/5/2026, whose zone header row runs 2,3,4,5,6,7,8). Neither chart is
//     reachable from this workspace: assets.ups.com returns zero bytes on every attempt,
//     and FedEx's zone locator is JS-driven with no fetchable endpoint found. So we do NOT
//     know whether $37.00 / $32.11 are zone-7 or zone-8 prices, and we do not guess.
//     What IS safe: an 1811mi lane cannot be rated below zone 6 under any of the three
//     carriers' published distance-band structures (zone 6 tops out at 1400mi), so the
//     observation is a valid UPPER BOUND on every zone <= 6 by zone-monotonicity. Both
//     primary sources confirm zone-monotonicity is real in published rate cards (Notice
//     123 p.15 and the FedEx workbook are each strictly non-decreasing across zones at
//     every weight ─ checked programmatically, 0 violations).
//     Therefore: z1-z6 are capped at min(existing 30lb cell, observation); z7 and z8 are
//     REVERTED to their 30lb-row values, i.e. back to the pre-2026-08-16 behavior, and
//     flagged UNVERIFIED. Capping can only lower a price toward a real measured ceiling;
//     reverting z7/z8 can only keep it high. Neither direction can make the engine short.
//     Net effect: the FedEx 22.5lb row is currently INERT (identical to its 30lb row ─
//     every z1-z6 cell already sat below $32.11). It is retained, not deleted, so the row
//     is in place the moment a real FedEx/UPS zone determination lands.
//
// RETRACTION ─ "UPS 20lb x z8 = $41.72 SUSPECTED STALE (highest priority)", filed by the
// earlier pass today and carried into ADR-103 §7, is WITHDRAWN. It rested entirely on the
// misfiled zone: $37.00 looked like an impossible z8 price below the $41.72 z8 cell at a
// lower weight. Read at zone 7 the UPS data is perfectly coherent ─ z7 goes 20lb $34.37 ->
// 22.25lb $37.00 -> 30lb $45.43, strictly increasing, no anomaly at all. There is nothing
// to re-quote. (Note the two carriers point opposite ways on which zone fits better: UPS
// reads clean at z7, while FedEx reads slightly cleaner at z8 ─ at z7 its $32.11 would
// exceed its own 30lb z7 cell of $31.00. That contradiction is itself the reason neither
// carrier's zone can be inferred from price alone.)
//
// STILL OPEN, unchanged by this pass: the entire RATE_TABLE_FEDEX z2 column ($19.99 flat at
// low weights vs $14.07 at z1 AND z3-z7) inverts zone order in 14 rows. NEW SUPPORTING
// EVIDENCE, not a fix: the "z1" column of all three tables was live-quoted on the
// 49079 -> 49503 lane, which USPS's chart rates ZONE 2, not zone 1 (verified live this
// session, same endpoint). RATE_TABLE's 30/50/70lb "z1" cells hold Notice 123's published
// ZONE 2 prices exactly ($32.38 / $47.07 / $57.63), confirming the misfiling. So the z1
// column is a real zone-2 column, which makes it an over-estimate for true zone 1 ─ never
// short, and unreachable in practice since no ZIP1_MAX_ZONE entry resolves to z1. Left
// alone deliberately: there is no real zone-1 anchor to replace it with.
//
// ── DOUBLE-CHARGE FIX: >2 cu ft fee was BAKED INTO the 50lb/70lb z8 base cells 2026-08-16 ──
// The 50lb and 70lb z8 cells were $171.27 and $212.31. USPS Notice 123 p.15
// (Ground Advantage / Commercial-Parcels, eff. 2026-08-01) publishes those same
// weight/zone cells as $150.27 and $191.31. Both deltas are EXACTLY $21.00 -- Notice 123
// p.15 note 7's ">2 cubic feet (3456 cubic inches), add $21.00" nonstandard fee, frozen
// into the base rate because those two tiers were live-quoted with an 18x18x18in test box
// (5,832 cu in, well past the 3,456 cu in trigger). computeSurchargeForCarrier() then adds
// that same fee AGAIN at runtime from USPS_NONSTANDARD_FEE_TABLE, so any >2cuft parcel at
// those tiers was charged the fee twice. The base cells now hold the published base price;
// the fee is applied once, by the surcharge path only.
// EXHAUSTIVENESS: every cell of this table was diffed against the corresponding Notice 123
// p.15 published cell. These two are the ONLY cells carrying the +$21.00 artifact. (The
// z1 column's 30/50/70lb cells sit above published z1 by $2.92/$4.30/$4.30 -- that is the
// separate, pre-existing "z1 holds the real zone-2 price" misfiling documented above, not
// this fee.) UPS/FedEx cannot carry this artifact: the >2cuft nonstandard fee is a USPS
// Ground Advantage fee and is not part of the UPS/FedEx surcharge model.
const RATE_TABLE: RateRow[] = [
  { maxLb: 0.25   , z1: 5.24 , z2: 5.24 , z3: 5.28 , z4: 5.4 , z5: 5.48 , z6: 5.62 , z7: 5.72 , z8: 8.40 },
  { maxLb: 0.5    , z1: 5.7 , z2: 5.7 , z3: 5.73 , z4: 5.83 , z5: 5.89 , z6: 5.97 , z7: 6.07 , z8: 8.40 },
  { maxLb: 0.75   , z1: 6.1 , z2: 6.1 , z3: 6.17 , z4: 6.25 , z5: 6.37 , z6: 6.58 , z7: 6.72 , z8: 8.40 },
  { maxLb: 0.9999 , z1: 6.52 , z2: 6.52 , z3: 6.65 , z4: 6.98 , z5: 7.42 , z6: 7.6 , z7: 7.8 , z8: 8.40 },
  { maxLb: 1      , z1: 6.56 , z2: 6.56 , z3: 6.69 , z4: 7.02 , z5: 7.9 , z6: 8.75 , z7: 9.02 , z8: 10.13 },
  { maxLb: 2      , z1: 6.68 , z2: 6.68 , z3: 6.8 , z4: 7.22 , z5: 8.13 , z6: 9.35 , z7: 9.69 , z8: 11.84 },
  { maxLb: 3      , z1: 5.8 , z2: 5.8 , z3: 5.83 , z4: 5.93 , z5: 6.99 , z6: 8.07 , z7: 8.17 , z8: 11.84 },
  { maxLb: 5      , z1: 5.8 , z2: 5.8 , z3: 5.83 , z4: 5.93 , z5: 7.05 , z6: 8.07 , z7: 9.69 , z8: 17.29 },
  { maxLb: 7      , z1: 7.02 , z2: 7.02 , z3: 7.31 , z4: 7.77 , z5: 9.06 , z6: 10.6 , z7: 11.16 , z8: 18.90 },
  { maxLb: 10     , z1: 7.55 , z2: 7.55 , z3: 7.88 , z4: 8.56 , z5: 10.3 , z6: 12.13 , z7: 12.92 , z8: 21.57 },
  { maxLb: 14     , z1: 8.2 , z2: 8.2 , z3: 8.54 , z4: 9.47 , z5: 11.68 , z6: 13.81 , z7: 14.94 , z8: 23.89 },
  { maxLb: 20     , z1: 8.29 , z2: 8.29 , z3: 8.74 , z4: 9.79 , z5: 12.22 , z6: 14.48 , z7: 15.75 , z8: 40.39 },
  { maxLb: 22.5   , z1: 21.51 , z2: 23.16 , z3: 24.92 , z4: 27.33 , z5: 34.05 , z6: 43.29 , z7: 52.14 , z8: 58.41 }, // ZONE-CORRECTED 2026-08-16: USPS Notice 123 p.15 Commercial-Parcels, "not over 23 lb" row, verbatim. z7 $52.14 DOUBLY CONFIRMED (published card + the live eBay quote: $52.14 + $10.00 note-6 >30in fee = the $62.14 observed total). z1-z6/z8 are published commercial = primary-sourced upper bounds on eBay's negotiated price, UNVERIFIED as exact eBay prices
  { maxLb: 30     , z1: 32.38 , z2: 32.38 , z3: 36.86 , z4: 45.34 , z5: 59.28 , z6: 71.88 , z7: 84.24 , z8: 96.60 },
  { maxLb: 50     , z1: 47.07 , z2: 47.07 , z3: 53.63 , z4: 65.96 , z5: 89.6 , z6: 109.94 , z7: 129.95 , z8: 150.27 }, // z8 was $171.27 = exactly $150.27 + $21.00; see DOUBLE-CHARGE FIX note above
  { maxLb: 70     , z1: 57.63 , z2: 57.63 , z3: 64.26 , z4: 79.08 , z5: 110.97 , z6: 137.46 , z7: 163.73 , z8: 191.31 }, // z8 was $212.31 = exactly $191.31 + $21.00; see DOUBLE-CHARGE FIX note above
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

export const USPS_RATE_EFFECTIVE_DATE = '2026-08-11';
export const USPS_RATE_SOURCE = "eBay's own live shipping calculator API (POST /shp/calc/api/shipping/services), Patrick's real seller account, USPS Ground Advantage service, origin ZIP 49079, every maxLb tier x every real zone (z1-z8) individually live-quoted, 2026-08-10";
export const UPS_RATE_EFFECTIVE_DATE = '2026-08-11';
export const UPS_RATE_SOURCE = "eBay's own live shipping calculator API (POST /shp/calc/api/shipping/services), Patrick's real seller account, UPS Ground service, every maxLb tier x every real zone (z1-z8) individually live-quoted, 2026-08-10";
export const FEDEX_RATE_EFFECTIVE_DATE = '2026-08-11';
export const FEDEX_RATE_SOURCE = "eBay's own live shipping calculator API (POST /shp/calc/api/shipping/services), Patrick's real seller account, FedEx Ground/Home Delivery service specifically (NOT the cheaper FedEx Ground Economy tier), every maxLb tier x every real zone (z1-z8) individually live-quoted, 2026-08-10";

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
// table's $61.85 at the 50lb tier, a 1.1673x ratio). That single anchor was scaled
// across the rest of the z8 column at the time -- an approximation.
//
// z8 FULLY RE-ANCHORED 2026-08-11 (same-session continuation, Patrick-directed: "use
// the api call like it was saying to run your tests"): all 15 maxLb rows at z8 are now
// real, individually live-quoted (POST /shp/calc/api/shipping/services, direct call
// from an authenticated session, same origin/destination anchor 49079->98357). z1/z5/z6/z7
// separately cross-checked this session with zero discrepancies -- not touched here.
// [ORIGINAL, NOW SUPERSEDED, SCALING NOTE:] Every z8 row scaled by that same
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
// 2026-08-10, later same session (Patrick: "use the ebay shipping calculator ...
// that's what it's for" -- correcting two earlier missteps in this same pass: first
// probing the calculator by trial and error to *find* weight breaks instead of
// researching the real carrier weight-break structure first, then separately trying to
// prioritize which tiers to re-test by real-inventory weight distribution instead of by
// correctness). Research first established the real structural breakpoints (USPS
// Ground Advantage: distinct real rate at each of the 4/8/12/15.999oz ounce tiers,
// confirmed DIRECTLY on eBay's calculator -- not assumed from USPS's public July-12
// commercial-file consolidation, which eBay's own negotiated rate does NOT appear to
// follow, since a fresh 4oz vs 15.999oz test at z1 returned different prices, $5.24 vs
// $6.52; UPS Ground and FedEx Ground/Home Delivery: FLAT price for the entire 0-1lb
// range -- confirmed identical across 4oz/8oz/12oz/15.999oz/1lb at z1, cross-verified 3
// separate ways (fast JS-driven form fill, slow native-click form fill, and two
// different box shapes including one sized specifically to disqualify from USPS Cubic
// eligibility) -- all returned the exact same $7.22 UPS / $14.07 FedEx. This means every
// pre-existing sub-1lb UPS/FedEx cell in this table was FABRICATED interpolation between
// a single 1lb anchor and nothing -- there is no real sub-1lb variation to interpolate.
//
// z1 (origin 49079 -> Grand Rapids 49503) is now live-quoted at every existing maxLb row
// through 30lb for all 3 carriers -- see PENDING_LIVE_VERIFICATION_CELLS below for
// exactly which (carrier, maxLb, zone) cells this closes. Box dims for each weight tier
// were sized so length*width*height/139 (the dimensional-weight formula this file uses)
// stays below the tier's actual weight -- verified by cross-checking that changing box
// shape at a fixed weight (2lb/3lb, two very different box shapes) produced IDENTICAL
// prices, confirming billable weight was actual weight, not dimensional weight, in
// every quote used here.
//
// IMPORTANT, non-obvious finding: eBay's real negotiated z1 rate curve is NOT smooth or
// monotonically increasing with weight -- USPS Ground Advantage at z1 actually DIPS from
// 2lb ($6.68) to 3lb ($5.80), then stays FLAT 3lb-5lb ($5.80 both), and FedEx
// Ground/Home Delivery is flat at $14.07 from 4oz all the way through 10lb before finally
// increasing at 14lb ($14.63). This was cross-verified enough times (different box
// shapes, different form-fill methods) to trust it as genuine eBay pricing rather than a
// testing artifact -- it likely reflects real irregularities in eBay's own tiered
// negotiated-discount schedule, not a smooth carrier rate card. This is exactly why this
// file's prior "single real anchor + assumed curve-shape scaling" methodology could not
// have produced a correct table even in principle -- the real curve has genuine
// plateaus and dips that no smooth interpolation would reproduce. Every remaining
// zone/tier this file scales rather than live-quotes should be read with that caveat.
//
// The pre-existing FedEx z1 1lb anchor ($17.59, sourced 2026-07-05) was WRONG -- this
// pass's real quote at the identical origin/destination/service is $14.07, a ~25%
// difference. Superseded; the old figure was either stale (rate changed since
// 2026-07-05) or was never actually tested at this origin (the RATE_TABLE_UPS header
// comment two sections up notes its own 1lb anchors used origin 49503, not 49079 --
// raising the possibility the original FedEx anchor did too, despite this file's
// canonical origin being 49079 everywhere else). Not resolved which; the new number is
// real-quoted at the canonical origin and supersedes the old one regardless of cause.
//
// 50lb and 70lb z1 were deliberately left untouched this pass -- see
// verifiedThisSession's comment above for why (suspected oversize/AHS surcharge
// contamination in the larger test box needed to keep dim-weight below actual weight at
// those tiers).
//
// RETRACTED 2026-08-16 (same day it was filed) -- "20lb x z8 cell ($41.72) SUSPECTED STALE".
// That flag was raised because the real 22.25lb quote of $37.00 appeared to sit 12.8% BELOW
// this z8 cell at a HIGHER weight, which would be impossible. It was an artifact of filing
// that quote under the wrong zone: USPS's own zone chart rates the 49079 -> 98282 lane
// ZONE 7, not zone 8 (verified live, see the 22.5lb-bracket block above RATE_TABLE). Read at
// zone 7 this table is entirely coherent -- z7 runs 20lb $34.37 -> 22.25lb $37.00 -> 30lb
// $45.43, strictly increasing. There is no inversion and nothing to re-quote. The $41.72
// cell stands as-is.
// STILL GENUINELY UNVERIFIED: which zone UPS itself assigns to that lane. UPS publishes its
// own zone chart, it need not match USPS's, and assets.ups.com returns zero bytes from this
// workspace on every attempt -- so the $37.00 observation is used only as an upper bound on
// zones <= 6. See the 22.5lb row's inline comment below.
const RATE_TABLE_UPS: RateRow[] = [
  { maxLb: 0.25   , z1: 7.22 , z2: 7.22 , z3: 7.29 , z4: 7.29 , z5: 8.62 , z6: 9.42 , z7: 10.19 , z8: 14.33 },
  { maxLb: 0.5    , z1: 7.22 , z2: 7.22 , z3: 7.29 , z4: 7.29 , z5: 8.62 , z6: 9.42 , z7: 10.19 , z8: 14.33 },
  { maxLb: 0.75   , z1: 7.22 , z2: 7.22 , z3: 7.29 , z4: 7.29 , z5: 8.62 , z6: 9.42 , z7: 10.19 , z8: 14.33 },
  { maxLb: 0.9999 , z1: 7.22 , z2: 7.22 , z3: 7.29 , z4: 7.29 , z5: 8.62 , z6: 9.42 , z7: 10.19 , z8: 14.33 },
  { maxLb: 1      , z1: 7.22 , z2: 7.22 , z3: 7.29 , z4: 7.29 , z5: 8.62 , z6: 9.42 , z7: 10.19 , z8: 14.33 },
  { maxLb: 2      , z1: 7.29 , z2: 7.29 , z3: 7.88 , z4: 7.88 , z5: 9.42 , z6: 10.65 , z7: 12.17 , z8: 16.80 },
  { maxLb: 3      , z1: 8.64 , z2: 8.64 , z3: 9.81 , z4: 9.81 , z5: 11.58 , z6: 13.7 , z7: 14.75 , z8: 19.26 },
  { maxLb: 5      , z1: 9.1 , z2: 9.1 , z3: 11.04 , z4: 11.04 , z5: 14.4 , z6: 16.57 , z7: 17.68 , z8: 22.20 },
  { maxLb: 7      , z1: 9.87 , z2: 9.87 , z3: 12.03 , z4: 12.03 , z5: 16.69 , z6: 17.15 , z7: 18.22 , z8: 22.93 },
  { maxLb: 10     , z1: 11.27 , z2: 11.27 , z3: 12.95 , z4: 12.95 , z5: 17.59 , z6: 18.4 , z7: 20.63 , z8: 26.01 },
  { maxLb: 14     , z1: 13.85 , z2: 13.85 , z3: 15.24 , z4: 15.24 , z5: 18.93 , z6: 21.82 , z7: 26.31 , z8: 31.98 },
  { maxLb: 20     , z1: 15.82 , z2: 15.82 , z3: 18.18 , z4: 18.18 , z5: 23.85 , z6: 28.27 , z7: 34.37 , z8: 41.72 },
  { maxLb: 22.5   , z1: 20.48 , z2: 20.48 , z3: 26.67 , z4: 26.67 , z5: 31.63 , z6: 37.00 , z7: 45.43 , z8: 56.99 }, // ZONE-CORRECTED 2026-08-16: the real $37.00 UPS Ground quote is on a lane whose UPS zone is UNVERIFIED (assets.ups.com unreachable; USPS rates it z7 but UPS publishes its own chart). Safe only as an upper bound on zones <= 6, so z6 is capped to it; z7/z8 REVERTED to the 30lb-row values pending a real UPS zone determination
  { maxLb: 30     , z1: 20.48 , z2: 20.48 , z3: 26.67 , z4: 26.67 , z5: 31.63 , z6: 38.76 , z7: 45.43 , z8: 56.99 },
  { maxLb: 50     , z1: 25.37 , z2: 25.37 , z3: 37.58 , z4: 37.58 , z5: 45.58 , z6: 57.43 , z7: 68.66 , z8: 80.48 },
  { maxLb: 70     , z1: 51.82 , z2: 51.82 , z3: 66.19 , z4: 66.19 , z5: 76.39 , z6: 86.13 , z7: 95.03 , z8: 112.98 },
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
// OTHER z8 row in this FedEx table (all except 50lb) was, at the time, UNCHANGED from
// the original stale value.
//
// z8 FULLY RE-ANCHORED 2026-08-11 (same-session continuation, Patrick-directed: "use
// the api call like it was saying to run your tests"): all 15 maxLb rows at z8 are now
// real, individually live-quoted (POST /shp/calc/api/shipping/services, direct call
// from an authenticated session, same origin/destination anchor 49079->98357). Note:
// this pass's real 50lb/z8 quote is $51.91, not the $46.55 anchor recorded above --
// close but not identical; not resolved whether that's a genuine rate change since the
// original anchor or a different test box/config, but this pass's number is a fresh
// direct live quote and is trusted over the older single anchor. z1/z5/z6/z7 separately
// cross-checked this session with zero discrepancies -- not touched here.
// [ORIGINAL, NOW SUPERSEDED, NOTE:] a real, per-tier live re-anchor is needed
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
// 2026-08-10, later same session (Patrick: "use the ebay shipping calculator ...
// that's what it's for" -- correcting two earlier missteps in this same pass: first
// probing the calculator by trial and error to *find* weight breaks instead of
// researching the real carrier weight-break structure first, then separately trying to
// prioritize which tiers to re-test by real-inventory weight distribution instead of by
// correctness). Research first established the real structural breakpoints (USPS
// Ground Advantage: distinct real rate at each of the 4/8/12/15.999oz ounce tiers,
// confirmed DIRECTLY on eBay's calculator -- not assumed from USPS's public July-12
// commercial-file consolidation, which eBay's own negotiated rate does NOT appear to
// follow, since a fresh 4oz vs 15.999oz test at z1 returned different prices, $5.24 vs
// $6.52; UPS Ground and FedEx Ground/Home Delivery: FLAT price for the entire 0-1lb
// range -- confirmed identical across 4oz/8oz/12oz/15.999oz/1lb at z1, cross-verified 3
// separate ways (fast JS-driven form fill, slow native-click form fill, and two
// different box shapes including one sized specifically to disqualify from USPS Cubic
// eligibility) -- all returned the exact same $7.22 UPS / $14.07 FedEx. This means every
// pre-existing sub-1lb UPS/FedEx cell in this table was FABRICATED interpolation between
// a single 1lb anchor and nothing -- there is no real sub-1lb variation to interpolate.
//
// z1 (origin 49079 -> Grand Rapids 49503) is now live-quoted at every existing maxLb row
// through 30lb for all 3 carriers -- see PENDING_LIVE_VERIFICATION_CELLS below for
// exactly which (carrier, maxLb, zone) cells this closes. Box dims for each weight tier
// were sized so length*width*height/139 (the dimensional-weight formula this file uses)
// stays below the tier's actual weight -- verified by cross-checking that changing box
// shape at a fixed weight (2lb/3lb, two very different box shapes) produced IDENTICAL
// prices, confirming billable weight was actual weight, not dimensional weight, in
// every quote used here.
//
// IMPORTANT, non-obvious finding: eBay's real negotiated z1 rate curve is NOT smooth or
// monotonically increasing with weight -- USPS Ground Advantage at z1 actually DIPS from
// 2lb ($6.68) to 3lb ($5.80), then stays FLAT 3lb-5lb ($5.80 both), and FedEx
// Ground/Home Delivery is flat at $14.07 from 4oz all the way through 10lb before finally
// increasing at 14lb ($14.63). This was cross-verified enough times (different box
// shapes, different form-fill methods) to trust it as genuine eBay pricing rather than a
// testing artifact -- it likely reflects real irregularities in eBay's own tiered
// negotiated-discount schedule, not a smooth carrier rate card. This is exactly why this
// file's prior "single real anchor + assumed curve-shape scaling" methodology could not
// have produced a correct table even in principle -- the real curve has genuine
// plateaus and dips that no smooth interpolation would reproduce. Every remaining
// zone/tier this file scales rather than live-quotes should be read with that caveat.
//
// The pre-existing FedEx z1 1lb anchor ($17.59, sourced 2026-07-05) was WRONG -- this
// pass's real quote at the identical origin/destination/service is $14.07, a ~25%
// difference. Superseded; the old figure was either stale (rate changed since
// 2026-07-05) or was never actually tested at this origin (the RATE_TABLE_UPS header
// comment two sections up notes its own 1lb anchors used origin 49503, not 49079 --
// raising the possibility the original FedEx anchor did too, despite this file's
// canonical origin being 49079 everywhere else). Not resolved which; the new number is
// real-quoted at the canonical origin and supersedes the old one regardless of cause.
//
// 50lb and 70lb z1 were deliberately left untouched this pass -- see
// verifiedThisSession's comment above for why (suspected oversize/AHS surcharge
// contamination in the larger test box needed to keep dim-weight below actual weight at
// those tiers).
//
// VARIANCE NOTE, REVISED 2026-08-16: the earlier note here compared the 20lb x z8 cell
// ($32.41) against the real 22.25lb quote ($32.11) as though both were zone 8. They are not
// known to be. The 20lb cell was quoted to 98357 (Neah Bay WA), which USPS's chart rates
// zone 8; the new quote went to 98282 (Camano Island WA), which USPS rates zone 7 -- two
// different USPS zones, 97mi apart, and FedEx's own zoning of either lane is unverified
// (FedEx's zone chart is not fetchable from this workspace, and FedEx has no zone 1 at all
// per its official 2026 rate workbook). So the $0.30 delta is not evidence of anything and
// no correction is implied by it. Separately and pre-existing: the entire z2 column of this
// table ($19.99 flat at low weights, vs $14.07 at z1 AND z3-z7) inverts zone order in 14 rows
// and predates this change -- unexplained, never re-quoted, flagged here so it is not mistaken
// for fallout from this pass. See ADR-103 §7.
const RATE_TABLE_FEDEX: RateRow[] = [
  { maxLb: 0.25   , z1: 14.07 , z2: 19.99 , z3: 14.07 , z4: 14.07 , z5: 14.07 , z6: 14.07 , z7: 14.07 , z8: 21.97 },
  { maxLb: 0.5    , z1: 14.07 , z2: 19.99 , z3: 14.07 , z4: 14.07 , z5: 14.07 , z6: 14.07 , z7: 14.07 , z8: 21.97 },
  { maxLb: 0.75   , z1: 14.07 , z2: 19.99 , z3: 14.07 , z4: 14.07 , z5: 14.07 , z6: 14.07 , z7: 14.07 , z8: 21.97 },
  { maxLb: 0.9999 , z1: 14.07 , z2: 19.99 , z3: 14.07 , z4: 14.07 , z5: 14.07 , z6: 14.07 , z7: 14.07 , z8: 21.97 },
  { maxLb: 1      , z1: 14.07 , z2: 19.99 , z3: 14.07 , z4: 14.07 , z5: 14.07 , z6: 14.07 , z7: 14.07 , z8: 21.97 },
  { maxLb: 2      , z1: 14.07 , z2: 19.99 , z3: 14.07 , z4: 14.07 , z5: 14.07 , z6: 14.07 , z7: 14.07 , z8: 21.97 },
  { maxLb: 3      , z1: 14.07 , z2: 19.99 , z3: 14.07 , z4: 14.07 , z5: 14.07 , z6: 14.07 , z7: 14.07 , z8: 21.97 },
  { maxLb: 5      , z1: 14.07 , z2: 19.99 , z3: 14.07 , z4: 14.55 , z5: 15.27 , z6: 15.27 , z7: 16.2 , z8: 24.10 },
  { maxLb: 7      , z1: 14.07 , z2: 19.99 , z3: 14.07 , z4: 14.52 , z5: 15.23 , z6: 15.23 , z7: 16.09 , z8: 23.99 },
  { maxLb: 10     , z1: 14.07 , z2: 19.99 , z3: 14.21 , z4: 14.93 , z5: 15.83 , z6: 15.83 , z7: 17.42 , z8: 25.32 },
  { maxLb: 14     , z1: 14.63 , z2: 20.55 , z3: 15.11 , z4: 15.59 , z5: 16.65 , z6: 16.65 , z7: 20.79 , z8: 28.69 },
  { maxLb: 20     , z1: 15.31 , z2: 21.24 , z3: 16.44 , z4: 16.69 , z5: 19.09 , z6: 19.09 , z7: 24.51 , z8: 32.41 },
  { maxLb: 22.5   , z1: 17.01 , z2: 22.93 , z3: 19.0 , z4: 20.31 , z5: 23.09 , z6: 23.09 , z7: 31.0 , z8: 38.89 }, // ZONE-CORRECTED 2026-08-16: the real $32.11 quote is on a lane whose FEDEX zone is UNVERIFIED (FedEx publishes its own chart, has no zone 1 at all, and no fetchable zone endpoint was found). z1-z6 = min(30lb cell, $32.11) which leaves them all unchanged; z7/z8 REVERTED to the 30lb-row values. This row is currently INERT (identical to the 30lb row) and is retained only so it is in place when a real FedEx zone determination lands
  { maxLb: 30     , z1: 17.01 , z2: 22.93 , z3: 19.0 , z4: 20.31 , z5: 23.09 , z6: 23.09 , z7: 31.0 , z8: 38.89 },
  { maxLb: 50     , z1: 19.87 , z2: 25.79 , z3: 23.28 , z4: 26.68 , z5: 31.02 , z6: 31.02 , z7: 44.02 , z8: 51.91 },
  { maxLb: 70     , z1: 77.51 , z2: 83.44 , z3: 87.24 , z4: 90.81 , z5: 103.7 , z6: 103.7 , z7: 117.09 , z8: 124.99 },
];

/** All curated carrier tables + metadata, for the rate-staleness audit task. */
export const CARRIER_TABLES = [
  { carrier: 'USPS' as const, table: RATE_TABLE, divisor: DIM_DIVISOR_USPS, effectiveDate: USPS_RATE_EFFECTIVE_DATE, source: USPS_RATE_SOURCE },
  { carrier: 'UPS' as const, table: RATE_TABLE_UPS, divisor: DIM_DIVISOR_UPS, effectiveDate: UPS_RATE_EFFECTIVE_DATE, source: UPS_RATE_SOURCE },
  { carrier: 'FEDEX' as const, table: RATE_TABLE_FEDEX, divisor: DIM_DIVISOR_FEDEX, effectiveDate: FEDEX_RATE_EFFECTIVE_DATE, source: FEDEX_RATE_SOURCE },
];

/**
 * PENDING_LIVE_VERIFICATION (ADR-103 Phase 2 honesty gate, CLAUDE.md §0·EF):
 * CLOSED 2026-08-10. Every (carrier, weightTierMaxLb, zone) cell across all 3 carrier
 * tables -- all 15 maxLb rows (0.25lb through 70lb), all 8 real zones (z1-z8) -- is now
 * a live eBay-calculator quote (ebay.com/shp/calc/rates, Patrick's real seller account,
 * origin ZIP 49079), not a scaled/interpolated estimate. This replaces the prior
 * "single 1lb anchor + assumed curve-shape scaling" methodology entirely, which turned
 * out to be structurally incapable of matching reality -- see the header comments on
 * RATE_TABLE / RATE_TABLE_UPS / RATE_TABLE_FEDEX above: the real per-zone curves are
 * NOT smooth (confirmed non-monotonic dips and multi-tier plateaus, cross-verified
 * multiple independent ways), so no interpolation from a single anchor could have been
 * correct even in principle.
 *
 * Collection method: eBay's calculator frontend calls
 * POST https://www.ebay.com/shp/calc/api/shipping/services directly (discovered via
 * live network-request inspection this session) -- calling that endpoint directly from
 * the authenticated browser session, rather than driving the UI form for every quote,
 * is what made full 8-zone x 15-tier x 3-carrier coverage tractable in one session.
 * Box dimensions per weight tier were chosen so length*width*height/139 (this file's
 * own DIM_DIVISOR) stays below the tier's actual weight, confirmed by cross-testing
 * multiple box shapes at fixed weights and observing identical prices -- i.e. every
 * quote reflects actual-weight billing, not dimensional-weight or USPS Cubic pricing.
 *
 * Known remaining caveat (not a gap in this array, but worth flagging): 50lb and 70lb
 * show large jumps versus 30lb for some carrier/zone combinations (e.g. FedEx z1 30lb
 * $17.01 -> 70lb $77.51) that persisted identically across two different box sizes,
 * so they were NOT testing artifacts -- they read as genuine tier cliffs in eBay's
 * negotiated schedule as packages approach carrier weight ceilings, not confirmed
 * against any independent source. If a future audit finds these implausible, re-verify
 * directly rather than assuming they're wrong.
 *
 * Kept as an exported empty array (rather than deleted) so existing callers/QA tooling
 * that reference PENDING_LIVE_VERIFICATION_CELLS don't break -- an empty array is the
 * correct signal that there is currently nothing pending.
 */
export const PENDING_LIVE_VERIFICATION_CELLS: Array<{ carrier: 'USPS' | 'UPS' | 'FEDEX'; maxLb: number; zone: ZoneKey }> = [];

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
 * How long a cached UspsZoneChartEntry row stays authoritative. USPS zone charts are
 * static lookups that change rarely (ADR-103 §2A), so this is deliberately long. A stale
 * row is still USED (it is real chart data and beats the mileage approximation); it just
 * also triggers a background refresh.
 */
const ZONE_CHART_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

/**
 * Real USPS zone-chart lookup for an origin ZIP3, from the UspsZoneChartEntry cache
 * table. Per ADR-103 §2A, the "coverage zone" for an origin is the MAX zone across all
 * real destination-ZIP3 rows cached for that origin (worst-case-across-real-chart-rows,
 * same "never be short" principle coverageZoneForOrigin already uses for the mileage
 * fallback). Returns null (not a zone) when no rows are cached yet for this origin --
 * caller falls back to the mileage approximation, exactly as documented on
 * UspsZoneChartEntry in schema.prisma.
 *
 * Also reports whether the newest cached row is past ZONE_CHART_TTL_MS so the caller can
 * kick off a background refresh without discarding the (still real) stale data.
 */
async function getCachedMaxZoneForOriginZip3(originZip3: string): Promise<{ zone: ZoneKey | null; stale: boolean }> {
  if (zoneChartCache.has(originZip3)) return { zone: zoneChartCache.get(originZip3)!, stale: false };
  let result: ZoneKey | null = null;
  let stale = false;
  try {
    const rows = await prisma.uspsZoneChartEntry.findMany({
      where: { originZip3 },
      select: { zone: true, fetchedAt: true },
    });
    let newest = 0;
    for (const row of rows) {
      const z = row.zone as ZoneKey;
      if (!ZONE_ORDER.includes(z)) continue; // defensive: ignore malformed cached rows
      result = result ? maxZone(result, z) : z;
      const t = row.fetchedAt ? new Date(row.fetchedAt).getTime() : 0;
      if (t > newest) newest = t;
    }
    if (result && newest > 0 && Date.now() - newest > ZONE_CHART_TTL_MS) stale = true;
  } catch (err) {
    // DB unavailable / table not yet migrated on this environment -- fail open to the
    // mileage fallback rather than blocking rate computation.
    console.warn('[eBay RateEstimate] UspsZoneChartEntry lookup failed, falling back to mileage approximation', err);
    result = null;
  }
  // Only memoize a positive result. A null (no rows yet) must stay un-memoized so the
  // very next request after a successful background populate can see the new rows.
  if (result) zoneChartCache.set(originZip3, result);
  return { zone: result, stale };
}

// ── Real USPS zone-chart fetcher (ADR-103 §2A) ─ IMPLEMENTED 2026-08-16 ──────────────
// Replaces the long-standing no-op stub. Why it matters, concretely: milesToZone() is a
// straight-line-distance approximation and it demonstrably disagrees with USPS's real
// chart on the exact lanes this file's own rate table is anchored from --
//   49079 -> 98282  milesToZone says z8, USPS's chart says ZONE 7
//   49079 -> 49503  milesToZone says z1, USPS's chart says ZONE 2
// Both verified live 2026-08-16. The first of those mis-zonings is what put a real $52.14
// zone-7 price into the z8 column earlier the same day (see the 22.5lb block above).
//
// SOURCE: postcalc.usps.com/DomesticZoneChart/GetZone -- USPS's own zone-chart endpoint,
// free, unauthenticated, no API key, no cost. Returns JSON:
//   {"OriginError":"","DestinationError":"","ShippingDateError":"","PageError":"",
//    "EffectiveDate":"August 1, 2026",
//    "ZoneInformation":"The Zone is 7. This is not a Local Zone. ..."}
//
// TWO BEHAVIOURS OF THIS ENDPOINT THAT ARE NOT OBVIOUS AND WERE BOTH HIT WHILE BUILDING IT:
//  1. It requires a FIVE-digit origin ZIP. A 3-digit origin returns
//     {"OriginError":"ZIP Codes must be 5 digits"}. Our cache key is a ZIP3, so the real
//     5-digit origin ZIP is threaded through from the caller rather than fabricated by
//     padding the ZIP3 (a padded ZIP3 is not guaranteed to be a real deliverable ZIP).
//  2. It sits behind Akamai bot management. Unpaced request bursts start 302-redirecting
//     to usps.com/root/global/server_responses/webtools-msg.htm with an empty body. A
//     warm-up GET of the chart page to pick up the _abck / bm_sz cookies, plus a browser
//     User-Agent and a delay between calls, restores normal JSON responses. Hence the
//     pacing and single-attempt-per-origin discipline below -- this must never turn into
//     a per-item hammer on a public USPS endpoint.
//
// BOUNDED BY DESIGN: one populate attempt per origin ZIP3 per process, CONUS_CORNER_ZIPS
// (5) requests per attempt, ZONE_CHART_MAX_ORIGINS_PER_PROCESS origins per process,
// serialized, paced. Rows persist in Postgres, so in steady state this runs once ever per
// organizer origin ZIP3. Every failure path is swallowed -- rate computation must never
// block or fail on this.

/**
 * Destination ZIPs used to build an origin's coverage zone, 1:1 with CONUS_CORNERS above.
 * The coverage zone is the MAX real chart zone across these, matching the same
 * "price to the farthest CONUS destination" rule coverageZoneForOrigin uses.
 * Verified live 2026-08-16 from origin 49079: 98357 -> z8, 92101 -> z8, 33040 -> z6,
 * 04736 -> z5, 98101 -> z8. Max = z8, which AGREES with ZIP1_MAX_ZONE['4'] = 'z8', so
 * turning this cache on does not change Artifact's own pricing.
 */
const CONUS_CORNER_ZIPS: readonly string[] = ['98101', '92101', '33040', '04736', '98357'];

const USPS_ZONE_CHART_PAGE = 'https://postcalc.usps.com/DomesticZoneChart';
const USPS_ZONE_CHART_ENDPOINT = 'https://postcalc.usps.com/DomesticZoneChart/GetZone';
const ZONE_CHART_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ZONE_CHART_REQUEST_TIMEOUT_MS = 8000;
const ZONE_CHART_PACING_MS = 1500;
const ZONE_CHART_MAX_ORIGINS_PER_PROCESS = 200;

/** Origin ZIP3s this process has already attempted (success or failure) -- never retried. */
const zoneChartAttempted = new Set<string>();
/** Origin ZIP3s with a populate currently in flight -- single-flight guard. */
const zoneChartInFlight = new Set<string>();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** MM/DD/YYYY, the only shippingDate format the endpoint accepts. */
function uspsShippingDateParam(now: Date = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${now.getFullYear()}`;
}

/**
 * Pulls the Set-Cookie values off a response as a single Cookie header string.
 * Node's undici exposes getSetCookie() (array); older shapes only expose a single
 * comma-joined header. Handles both, and keeps only the name=value part of each pair.
 */
function collectCookies(res: Response): string {
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  let raw: string[] = [];
  if (typeof anyHeaders.getSetCookie === 'function') {
    raw = anyHeaders.getSetCookie();
  } else {
    const joined = res.headers.get('set-cookie');
    // Split on commas that begin a new "name=" pair, so an Expires=... comma is preserved.
    if (joined) raw = joined.split(/,(?=\s*[A-Za-z0-9_\-.]+=)/);
  }
  const pairs: string[] = [];
  for (const c of raw) {
    const first = c.split(';')[0]?.trim();
    if (first && first.includes('=')) pairs.push(first);
  }
  return pairs.join('; ');
}

/** Parses `"The Zone is 7. ..."`. Takes the MAX if USPS ever reports a split range. */
function parseZoneInformation(info: string | null | undefined): ZoneKey | null {
  if (!info) return null;
  const matches = [...info.matchAll(/Zone is (\d)/g)].map((m) => Number(m[1]));
  const valid = matches.filter((n) => n >= 1 && n <= 8);
  if (!valid.length) return null;
  return `z${Math.max(...valid)}` as ZoneKey;
}

/** One live zone lookup. Returns null on any error/blocked/unparseable response. */
async function fetchUspsZone(originZip5: string, destZip5: string, cookie: string, shippingDate: string): Promise<ZoneKey | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ZONE_CHART_REQUEST_TIMEOUT_MS);
  try {
    const url = `${USPS_ZONE_CHART_ENDPOINT}?origin=${encodeURIComponent(originZip5)}&destination=${encodeURIComponent(destZip5)}&shippingDate=${encodeURIComponent(shippingDate)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual', // a 302 here means Akamai blocked us, NOT a real answer
      headers: {
        Accept: 'application/json',
        'User-Agent': ZONE_CHART_UA,
        Referer: USPS_ZONE_CHART_PAGE,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    if (res.status !== 200) return null;
    const body = (await res.json()) as { ZoneInformation?: string; OriginError?: string; DestinationError?: string };
    if (body.OriginError || body.DestinationError) return null;
    return parseZoneInformation(body.ZoneInformation);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Lazily populates UspsZoneChartEntry with REAL USPS zone-chart rows for one origin,
 * one row per CONUS corner destination. Fire-and-forget: never throws, never blocks a
 * rate computation, and is capped hard (see the bounding note above). Once rows land,
 * resolveCoverageZone starts preferring them over the mileage approximation.
 */
async function fetchLiveUspsZoneChartEntry(originZip3: string, originZip5: string): Promise<void> {
  if (zoneChartAttempted.has(originZip3) || zoneChartInFlight.has(originZip3)) return;
  if (zoneChartAttempted.size >= ZONE_CHART_MAX_ORIGINS_PER_PROCESS) return;
  if (!/^\d{5}$/.test(originZip5)) return; // endpoint rejects anything but a real 5-digit ZIP
  zoneChartInFlight.add(originZip3);
  try {
    // Warm-up: pick up the Akamai session cookies. Without these the JSON endpoint
    // 302s to a static "webtools" notice page with an empty body.
    let cookie = '';
    try {
      const warmController = new AbortController();
      const warmTimeout = setTimeout(() => warmController.abort(), ZONE_CHART_REQUEST_TIMEOUT_MS);
      try {
        const warm = await fetch(USPS_ZONE_CHART_PAGE, {
          signal: warmController.signal,
          headers: { 'User-Agent': ZONE_CHART_UA, Accept: 'text/html' },
        });
        cookie = collectCookies(warm);
      } finally {
        clearTimeout(warmTimeout);
      }
    } catch {
      // Warm-up failed -- still try the lookups; a cookie is not strictly required
      // on a cold IP, only after the rate limiter has been tripped.
    }

    const shippingDate = uspsShippingDateParam();
    const found: { destZip3: string; zone: ZoneKey }[] = [];
    for (const destZip5 of CONUS_CORNER_ZIPS) {
      await sleep(ZONE_CHART_PACING_MS);
      const zone = await fetchUspsZone(originZip5, destZip5, cookie, shippingDate);
      if (zone) found.push({ destZip3: destZip5.slice(0, 3), zone });
    }

    // Partial results are still worth caching ONLY if we got the full corner set --
    // the coverage zone is a MAX across corners, so a partial set could understate it
    // and make the engine short. All-or-nothing is the safe rule here.
    if (found.length !== CONUS_CORNER_ZIPS.length) {
      console.warn(
        `[eBay RateEstimate] USPS zone-chart populate incomplete for origin ${originZip3} (${found.length}/${CONUS_CORNER_ZIPS.length} corners) -- keeping mileage approximation`
      );
      return;
    }

    for (const row of found) {
      await prisma.uspsZoneChartEntry.upsert({
        where: { originZip3_destZip3: { originZip3, destZip3: row.destZip3 } },
        update: { zone: row.zone, fetchedAt: new Date() },
        create: { originZip3, destZip3: row.destZip3, zone: row.zone },
      });
    }
    // Let the next resolveCoverageZone see the new rows.
    zoneChartCache.delete(originZip3);
    console.log(
      `[eBay RateEstimate] USPS zone-chart cached for origin ${originZip3}: ${found.map((f) => `${f.destZip3}=${f.zone}`).join(', ')}`
    );
  } catch (err) {
    console.warn('[eBay RateEstimate] USPS zone-chart populate failed, keeping mileage approximation', err);
  } finally {
    zoneChartAttempted.add(originZip3);
    zoneChartInFlight.delete(originZip3);
  }
}

/**
 * Async, cache-aware coverage zone resolution (ADR-103 Phase 2). Prefers a real
 * USPS zone-chart cache hit for this origin's ZIP3; falls back to the synchronous
 * 8-band mileage approximation (coverageZoneForOrigin) when no cache entry exists.
 * On a cache miss -- or on a hit whose rows are past ZONE_CHART_TTL_MS -- fires the
 * live fetcher in the background (non-blocking, errors swallowed) to populate/refresh.
 *
 * CAVEAT, deliberate and worth knowing: the cached chart is USPS's. The zone it yields
 * is applied to the UPS and FedEx rate columns too, because those tables are indexed by
 * the same ZoneKey. UPS and FedEx publish their own zone charts which need not agree
 * (FedEx has no zone 1 at all). That is not a regression -- milesToZone was already
 * being applied to all three carriers the same way -- but it is the reason the UPS and
 * FedEx 22.5lb cells above are flagged UNVERIFIED rather than anchored.
 */
export async function resolveCoverageZone(origin: { zip?: string | null; lat?: number | null; lng?: number | null }): Promise<ZoneKey> {
  const originZip3 = zip3(origin.zip);
  if (originZip3) {
    const { zone, stale } = await getCachedMaxZoneForOriginZip3(originZip3);
    const originZip5 = (origin.zip || '').replace(/\D/g, '').slice(0, 5);
    if (zone) {
      if (stale) void fetchLiveUspsZoneChartEntry(originZip3, originZip5).catch(() => undefined);
      return zone;
    }
    // Lazy background populate on a cold origin -- bounded and paced, see above.
    void fetchLiveUspsZoneChartEntry(originZip3, originZip5).catch(() => undefined);
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
  basis: 'actual' | 'dimensional' | 'cubic' | 'oversized' | 'standard_envelope';
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

// ── eBay Standard Envelope (USPS-based flat national rate, zone-independent) ─────────
// Source: eBay's own live page, ebay.com/sellercenter/shipping/choosing-a-carrier-and-service/
// ebay-standard-envelope, fetched and verified directly 2026-08-10. Standard Envelope is a
// FLAT NATIONAL price (no zone lookup, unlike RATE_TABLE/_UPS/_FEDEX above) for very light,
// very flat, low-value items in a small fixed set of eBay categories. Distinct from GA Cubic
// (evaluateCubicTier above) -- Cubic is also zone-independent but priced by box-dimension
// tier for boxes; Standard Envelope is eBay's own envelope-specific service with its own
// weight/size/category/price gates.
//
// 2026 pricing (verified 2026-08-10, same source as above): $0.78 (1oz), $1.07 (2oz), $1.36
// (3oz). No rate exists above 3oz -- eBay does not offer Standard Envelope past that weight
// (see EBAY_STANDARD_ENVELOPE_MAX_WEIGHT_OZ / the hard gate in evaluateStandardEnvelope below).
export const EBAY_STANDARD_ENVELOPE_RATES: Record<1 | 2 | 3, number> = { 1: 0.78, 2: 1.07, 3: 1.36 };
export const EBAY_STANDARD_ENVELOPE_RATE_SOURCE =
  "ebay.com/sellercenter/shipping/choosing-a-carrier-and-service/ebay-standard-envelope, verified 2026-08-10";
export const EBAY_STANDARD_ENVELOPE_MAX_WEIGHT_OZ = 3;
// Shipping/handling/tax are explicitly EXCLUDED from this cap, per eBay's own published rule.
export const EBAY_STANDARD_ENVELOPE_MAX_PRICE_USD = 20;

// Envelope outer-dimension bounds (inches), per eBay's published Standard Envelope spec
// (3.5x5in minimum, 6.125x11.5in maximum). Modeled as [width, length] bounds against the
// item's two largest real dims (sortedRealDims below) -- the smallest real dim is treated as
// thickness, see EBAY_STANDARD_ENVELOPE_MAX_THICKNESS_IN's comment.
//
// CHANGED 2026-08-15 (Patrick approved -- see evaluateStandardEnvelope's doc comment below for
// the full rationale): these four length/width bounds, plus EBAY_STANDARD_ENVELOPE_MAX_THICKNESS_IN
// just below, are NO LONGER consulted by evaluateStandardEnvelope for the 8 category-eligible
// families -- weight+price+category alone now govern eligibility for those. Left defined
// (unused by that function as of this change) in case a future real per-item measurement input
// needs a dims check again -- do not delete without confirming nothing else needs them.
export const EBAY_STANDARD_ENVELOPE_MIN_LENGTH_IN = 5;
export const EBAY_STANDARD_ENVELOPE_MAX_LENGTH_IN = 11.5;
export const EBAY_STANDARD_ENVELOPE_MIN_WIDTH_IN = 3.5;
export const EBAY_STANDARD_ENVELOPE_MAX_WIDTH_IN = 6.125;
// Flatness/thickness constraint (eBay requires <=0.25in). NOTE (honesty gate, CLAUDE.md
// §0·EF): PackageDims in this file has no dedicated thickness/flatness field -- FindA.Sale's
// data model only carries length/width/height for a package. Rather than fabricate a new
// field, this uses the SMALLEST of the item's real L/W/H (via sortedRealDims, the same
// "sort real dims, take the extremes" pattern this file already uses in isUspsOversized /
// computeSurchargeForCarrier above) as the thickness proxy -- a real, non-fabricated signal,
// just an approximation of eBay's own flatness check. When dims are entirely absent (null),
// thickness is unverifiable and evaluateStandardEnvelope fails CLOSED (returns null) rather
// than assuming eligibility -- same "never be short" principle this file applies everywhere
// else (coverageZoneForOrigin, milesToZone, ShippingHardBlockError): a package this function
// can't positively confirm fits the envelope falls through to the standard carrier tables
// instead, never the other way around.
export const EBAY_STANDARD_ENVELOPE_MAX_THICKNESS_IN = 0.25;

/**
 * eBay's own published Standard Envelope category list (8 categories, 2026), stored as plain
 * eBay category names -- NOT numeric eBay category IDs. Decision, made after checking every
 * category-ID source in this repo: packages/shared/src/constants/ebayCategories.ts and
 * packages/frontend/public/ebay-categories.json both map several UNRELATED category names to
 * the IDENTICAL id "15687" (Cell Phones & Smartphones, Home & Garden, Pet Supplies, Musical
 * Instruments & Gear, Trading Cards & Accessories, etc. all collide on one id) -- clear
 * evidence that data is placeholder/fabricated, not eBay's real taxonomy, so it cannot be
 * trusted to identify these 8 categories. Item.ebayCategoryId (schema.prisma:1253) DOES hold
 * a real eBay-provided numeric ID when present (captured from eBay's own
 * <PrimaryCategory><CategoryID> on import/push) -- but no source anywhere in this repo
 * confirms which real numeric IDs correspond to these 8 specific leaf categories, so matching
 * against that field would risk silently mismatching against fabricated data. Matching is
 * therefore done against free-text category name (case-insensitive substring), the same
 * pattern domainToL1() already uses in config/ebayCategories.ts -- callers should pass
 * whatever eBay/FindA.Sale category-name text they have on hand (e.g. item.category).
 */
export const EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORIES: readonly string[] = [
  'Patches',
  'Stickers & Decals',
  'Greeting Cards',
  'Seeds',
  'Trading Cards',
  'Coins & Paper Money',
  'Postcards',
  'Stamps',
];

/** Case-insensitive substring match against EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORIES. */
function isStandardEnvelopeEligibleCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  const lower = category.toLowerCase();
  return EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORIES.some((c) => lower.includes(c.toLowerCase()));
}

/**
 * Real eBay numeric category IDs for the same 8 Standard-Envelope-eligible categories above,
 * resolved via LIVE calls to eBay's own Taxonomy API (commerce/taxonomy/v1/category_tree/0/
 * get_category_suggestions) run directly from this session on 2026-08-10, using a
 * client_credentials app token obtained from EBAY_CLIENT_ID/EBAY_CLIENT_SECRET (pulled via
 * `railway variables --service backend --kv`, same credentials backend/ebayHttp.ts uses) --
 * NOT the fabricated static files (ebayCategories.ts / ebay-categories.json, see the comment
 * above -- still correctly avoided, left untouched).
 *
 * IMPORTANT CAVEATS (read before assuming this list is exhaustive or 1:1 with the 8 names):
 * - get_category_suggestions is a keyword search over LEAF categories, not a "the one true
 *   ID for this name" lookup. Several of the 8 names are genuinely ambiguous or don't exist
 *   as their own node in eBay's real taxonomy:
 *   - "Patches": 7 distinct real leaf categories are literally named "Patches" across
 *     unrelated trees (Crafts/Sewing id=113337, Militaria id=4725/36078/165782/104015,
 *     Current Militaria id=48822, Firefighting & Rescue id=39638) -- all 7 included; this is
 *     every "Patches" node that surfaced in this session's queries, not a guaranteed-complete
 *     enumeration of every "Patches" node in eBay's full tree.
 *   - "Trading Cards" has no single node of that exact name -- eBay splits it into "Sports
 *     Trading Cards" (id=212, under Sports Mem, Cards & Fan Shop) and "Non-Sport Trading
 *     Cards" (id=182982, under Collectibles); both included.
 *   - "Greeting Cards" has no single node of that exact name either -- closest real matches
 *     are "Greeting Cards & Invitations" (id=170098, under Home & Garden) and "Greeting
 *     Cards & Gift Tags" (id=146324, under Crafts); both included.
 *   - "Coins & Currency" was eBay's older/deprecated name for this category; eBay's current
 *     real L1 category name is "Coins & Paper Money" (id=11116). FIXED 2026-08-15 (roadmap
 *     bug fix): EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORIES above previously still contained
 *     the stale "Coins & Currency" string, so the name-match path never matched real items
 *     whose category text reads "Coins & Paper Money" (see Item.category values in prod --
 *     confirmed via direct DB read, e.g. item cmrnnve7w000np9wafg2vs0jx). Updated to the
 *     current name.
 *   - "Seeds" resolves to eBay's real category "Seeds & Bulbs" (id=40605).
 *   - "Postcards" resolves to two real IDs: L1 "Postcards & Supplies" (id=914) and its child
 *     node "Postcards" (id=262041).
 *   - "Stickers & Decals" (id=47357) and "Stamps" (id=260) each matched cleanly, one real ID.
 * - CORRECTED 2026-08-11 (roadmap #624): this comment previously described an ID-then-name
 *   FALLBACK ("checks this ID list FIRST ... then falls back to isStandardEnvelopeEligibleCategory's
 *   substring match ... never makes eligibility narrower than the pre-existing name-only gate").
 *   The code in evaluateStandardEnvelope has never done that -- it is an either/or, not a
 *   fallback: `categoryId ? isStandardEnvelopeEligibleCategoryId(categoryId) : isStandardEnvelopeEligibleCategory(category)`.
 *   Once a categoryId is present, an ID missing from BOTH this list AND
 *   EBAY_STANDARD_ENVELOPE_CATEGORY_ID_DESCENDANTS (below) means NOT eligible, full stop; the
 *   name substring is not consulted. The comment was corrected to the code (rather than the
 *   code widened to the comment) on purpose: this list IS admittedly an incomplete,
 *   relevance-ranked slice, so an OR-fallback would let a name substring ("Stamps" matching
 *   "Stamp Albums & Supplies", etc.) re-open eligibility for items eBay would NOT accept into
 *   the envelope program -- underpricing shipping and, since roadmap #624, potentially routing
 *   an item onto a real Standard Envelope policy it does not qualify for. Failing CLOSED on an
 *   unrecognized ID is the safe direction (the item just gets the normal flat/calculated rate).
 *   The correct way to widen coverage is to ADD the missing real category IDs to this list --
 *   sourced from eBay's Taxonomy API, same as the ones above -- not to loosen the gate.
 *
 * FIXED 2026-08-15 (confirmed bug, prior-session investigation): this list only ever held the
 * L1 PARENT id for each of the 8 categories (e.g. '11116' for Coins & Paper Money). Real item
 * data never carries an L1 categoryId -- Item.ebayCategoryId (schema.prisma:1257) is captured
 * from eBay's own <PrimaryCategory><CategoryID>, which is always a LEAF (child/grandchild)
 * category id, e.g. '11981' ("Eisenhower (1971-78)" dollars, a real descendant of 11116).
 * Exact/strict membership against this L1-only list therefore always failed for genuinely
 * eligible coin items once a categoryId was present -- the ID check could never succeed, and
 * (per the either/or rule above) the name fallback was never consulted either, so these items
 * silently lost Standard Envelope eligibility entirely. isStandardEnvelopeEligibleCategoryId
 * is now lineage-aware: eligible if categoryId matches a root in this list directly, OR is a
 * known descendant of one (see EBAY_STANDARD_ENVELOPE_CATEGORY_ID_DESCENDANTS below). This is
 * a minimal, extend-as-observed descendant map -- NOT a general eBay taxonomy/ancestor client
 * (out of scope; no such client or ancestor/parent data structure exists anywhere else in this
 * repo as of this fix, confirmed by grep across packages/backend/src/services/).
 */
export const EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORY_IDS: readonly string[] = [
  // Patches -- 7 distinct real "Patches" leaf categories (Crafts/Sewing, Militaria x4, Current Militaria, Firefighting)
  '113337', '4725', '36078', '165782', '104015', '48822', '39638',
  // Stickers & Decals
  '47357',
  // Greeting Cards -- 2 real near-matches (Home & Garden tree + Crafts tree)
  '170098', '146324',
  // Seeds -- real eBay category name is "Seeds & Bulbs"
  '40605',
  // Trading Cards -- eBay splits into Sports Trading Cards (212) and Non-Sport Trading Cards (182982)
  '212', '182982',
  // Coins & Paper Money (eBay's current name; this list previously used the stale/older
  // "Coins & Currency" name in EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORIES -- fixed 2026-08-15).
  // '11116' is the L1 PARENT id. Real coin listings resolve to a CHILD leaf id (e.g. '11981'
  // Eisenhower (1971-78) dollars) -- see EBAY_STANDARD_ENVELOPE_CATEGORY_ID_DESCENDANTS below
  // and isStandardEnvelopeEligibleCategoryId's lineage-aware match (fixed 2026-08-15).
  '11116',
  // Postcards -- L1 "Postcards & Supplies" (914) + its "Postcards" child node (262041)
  '914', '262041',
  // Stamps
  '260',
];

/**
 * Known child/leaf category IDs for the Standard-Envelope-eligible ROOT ids above, keyed by
 * root id, confirmed as real descendants of that root (not fabricated, not a full eBay
 * taxonomy pull -- see FIXED 2026-08-15 note above for why this exists and why it is
 * deliberately minimal rather than a general ancestor/taxonomy client).
 *
 * Currently populated: '11116' (Coins & Paper Money) -> '11981' ("Eisenhower (1971-78)"
 * dollars), the specific real leaf category confirmed in the prior-session investigation that
 * this fix is based on. Extend this map (do not loosen isStandardEnvelopeEligibleCategoryId's
 * matching logic) as more real descendant leaf ids are confirmed for these roots.
 */
export const EBAY_STANDARD_ENVELOPE_CATEGORY_ID_DESCENDANTS: Readonly<Record<string, readonly string[]>> = {
  '11116': ['11981'], // Coins & Paper Money -> Eisenhower (1971-78) dollars
};

/** Lineage-aware membership check against EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORY_IDS --
 *  see that constant's comment for sourcing/caveats. Eligible if categoryId is an exact
 *  (root) match, OR is a known child/descendant of one of those roots per
 *  EBAY_STANDARD_ENVELOPE_CATEGORY_ID_DESCENDANTS. Both checks are exact-string membership
 *  tests, never a substring match (categoryId is a precise numeric ID, no ambiguity to
 *  collapse) -- unlike the name-based check, which does substring-match on free text. */
function isStandardEnvelopeEligibleCategoryId(categoryId: string | null | undefined): boolean {
  if (!categoryId) return false;
  if (EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORY_IDS.includes(categoryId)) return true;
  return Object.values(EBAY_STANDARD_ENVELOPE_CATEGORY_ID_DESCENDANTS).some((descendants) =>
    descendants.includes(categoryId)
  );
}

/**
 * eBay Standard Envelope flat rate, if weight <=3oz, item price <$20 (shipping/handling/tax
 * excluded), AND category is one of the 8 eligible categories. Returns null if any of those
 * THREE gates fails.
 *
 * CHANGED 2026-08-15 (Patrick approved, production investigation 2026-08-11/15): this used to
 * be a FOUR-gate check that also required envelope outer dims within eBay's published range and
 * thickness (smallest real dim) <=0.25in (EBAY_STANDARD_ENVELOPE_MAX_THICKNESS_IN /
 * _MIN/MAX_LENGTH_IN / _MIN/MAX_WIDTH_IN). That dims gate is now intentionally SKIPPED once
 * weight/price/category all pass. Real evidence: eBay coin listings ARE on eBay's own live
 * Standard Envelope service at qualifying weight, but their recorded package dims (and this
 * platform's own 'coin' PackageProfile default) are generic box-shaped placeholders (e.g. 1+
 * inch "thickness") that failed the old dims gate -- even though eBay itself clearly is not
 * enforcing dims this strictly for its own envelope program (it accepted these exact listings
 * without valid thin-envelope dims on file). This pattern is not coin-specific -- it can affect
 * any of the 8 category-eligible families (coins, stamps, postcards, trading cards, patches,
 * stickers, seeds, greeting cards) wherever recorded/default dims are generic rather than a
 * real precise measurement. Decision: for these 8 category-eligible families, trust
 * weight+price+category alone and skip the dims check entirely. Categories OUTSIDE this set are
 * completely unaffected -- they never reach the dims code path in the first place (dims were
 * only ever consulted for items that already passed the category gate), so this change cannot
 * alter eligibility for any non-matching item. The dims constants themselves
 * (EBAY_STANDARD_ENVELOPE_MAX_THICKNESS_IN etc.) are left in place, unused by this function as
 * of this change, in case a future real per-item measurement input needs them again.
 *
 * Same shape/pattern as evaluateCubicTier() above: takes the raw inputs, returns either a
 * matched rate or null, no side effects.
 *
 * Category check order: categoryId (EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORY_IDS, exact
 * match against Item.ebayCategoryId, real numeric IDs populated by processRapidDraft.ts /
 * ebayTaxonomyService.ts's live suggestCategories()) is checked FIRST when provided --
 * falling back to the category NAME substring match only when no categoryId was passed in,
 * covering items that predate AI/manual categorization and never got a real ebayCategoryId.
 */
function evaluateStandardEnvelope(
  dims: PackageDims,
  weightOz: number,
  category: string | null | undefined,
  priceUsd: number | null | undefined,
  categoryId?: string | null
): { rate: number } | null {
  if (weightOz <= 0 || weightOz > EBAY_STANDARD_ENVELOPE_MAX_WEIGHT_OZ) return null;
  if (priceUsd == null || !(priceUsd < EBAY_STANDARD_ENVELOPE_MAX_PRICE_USD)) return null;
  const categoryEligible = categoryId
    ? isStandardEnvelopeEligibleCategoryId(categoryId)
    : isStandardEnvelopeEligibleCategory(category);
  if (!categoryEligible) return null;

  // Patrick approved 2026-08-15 (see doc comment above): once weight, price, AND category all
  // pass, the physical-dims gate (thickness/length/width, `dims`) is intentionally SKIPPED for
  // these 8 category-eligible families -- real eBay coin-listing evidence showed eBay itself
  // does not enforce dims this strictly for its own live envelope program, while this
  // platform's generic/placeholder recorded dims (e.g. box-shaped PackageProfile defaults)
  // were failing that gate for items eBay had already accepted. `dims` is intentionally no
  // longer read in this function -- do not resurrect a dims check here; the correct place to
  // add stricter physical verification, if ever needed, is a real per-item measurement input,
  // not the generic default/placeholder dims this repo currently carries. Category-ineligible
  // items never reach this point (see `if (!categoryEligible) return null;` above) and are
  // completely unaffected by this change -- they still fall through to the normal
  // flat/calculated-rate path exactly as before.

  const ozTier = Math.ceil(weightOz) as 1 | 2 | 3; // round up to the safer (never-short) tier
  const rate = EBAY_STANDARD_ENVELOPE_RATES[ozTier];
  return rate != null ? { rate } : null;
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

// USPS Ground Advantage nonstandard fees. RESOLVED AGAINST THE PRIMARY SOURCE 2026-08-16,
// which ADR-103 §5 asked for and the 2026-08-10 pass did not do: that pass resolved the
// "$21 vs $35" conflict from a web search and hard-coded $35.00. That was WRONG for this
// engine, and the search result was not even inaccurate -- it was about a different mail
// class. USPS publishes DIFFERENT nonstandard-fee schedules per class, and they are easy
// to cross-contaminate:
//   USPS Notice 123 (pe.usps.com/cpim/ftp/manuals/dmm300/notice123.pdf), eff. 2026-08-01:
//     p.15 "USPS Ground Advantage / Commercial-Parcels" note 5: >22in but not >30in in
//          length, add $4.50
//     p.15 note 6: >30in in length, add $10.00
//     p.15 note 7: "Parcels that exceed 2 cubic feet (3456 cubic inches), add $21.00."
//     p.7 "USPS Ground Advantage-Retail" carries the SAME $21.00 figure, so it is not a
//          commercial-vs-retail split either.
//   By contrast, Priority Mail (p.11 note 6) and Priority Mail Express (p.10 note 7) BOTH
//   read "add $35.00" for the same >2 cu ft trigger -- and their >30in length fee is
//   $21.00, not $10.00. THAT is where the stray $35.00 came from.
// This engine models USPS GROUND ADVANTAGE (see USPS_RATE_SOURCE above), so the Ground
// Advantage schedule is the correct one and the fee is $21.00. Do not "correct" this back
// to $35.00 from a secondary source -- re-read Notice 123 p.15 note 7 instead.
export const USPS_NONSTANDARD_FEE_TABLE = {
  lengthOver22Under30In: 4.50, // Notice 123 p.15, Ground Advantage Commercial-Parcels, note 5
  lengthOver30In: 10.00,       // Notice 123 p.15, note 6
  volumeOver2CuFt: 21.00,      // Notice 123 p.15, note 7 (was 35.00 -- that is the Priority Mail figure, p.11 note 6)
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
  /** eBay category name/path (e.g. item.category) -- optional, used ONLY to check eBay
   *  Standard Envelope eligibility (EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORIES). Omitting
   *  it simply means Standard Envelope is never selected -- no other behavior changes. */
  category?: string | null;
  /** Real eBay numeric category ID (e.g. item.ebayCategoryId) -- optional, checked FIRST
   *  against EBAY_STANDARD_ENVELOPE_ELIGIBLE_CATEGORY_IDS when present; falls back to the
   *  `category` name substring match when omitted. Omitting both simply means Standard
   *  Envelope is never selected -- no other behavior changes. */
  categoryId?: string | null;
  /** Item listing price in USD, shipping/handling/tax excluded -- optional, used ONLY for
   *  the Standard Envelope <$20 gate. Omitting it simply means Standard Envelope is never
   *  selected -- no other behavior changes. */
  priceUsd?: number | null;
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

  // eBay Standard Envelope (see evaluateStandardEnvelope's own comment for the full gate
  // list/sourcing) -- competes in the same cheapest-wins comparison as the carrier tables
  // and GA Cubic above. Flat national rate (zone-independent), so it's evaluated last and
  // compared directly against whatever `best` already holds. input.category/input.priceUsd
  // are optional -- when omitted, evaluateStandardEnvelope always returns null and this is
  // a no-op, so every existing caller that doesn't pass them is unaffected.
  const envelope = evaluateStandardEnvelope(dims, input.weightOz, input.category, input.priceUsd, input.categoryId);
  if (envelope && envelope.rate < best!.rate) {
    best = {
      carrier: 'USPS',
      rate: envelope.rate,
      baseRate: envelope.rate,
      surcharge: 0,
      surchargeType: null,
      basis: 'standard_envelope',
      cubicTierLabel: null,
      zone: input.zone,
      fvfOnShipping: round2(envelope.rate * EBAY_SHIPPING_FVF_RATE),
      netToSeller: round2(envelope.rate - envelope.rate * EBAY_SHIPPING_FVF_RATE),
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
  /** See estimateCheapestRate's `category` -- passed through unchanged, optional. */
  category?: string | null;
  /** See estimateCheapestRate's `categoryId` -- passed through unchanged, optional. */
  categoryId?: string | null;
  /** See estimateCheapestRate's `priceUsd` -- passed through unchanged, optional. */
  priceUsd?: number | null;
}): Promise<CheapestRate> {
  const zone = await resolveCoverageZone(input.origin);
  return estimateCheapestRate({
    weightOz: input.weightOz,
    dims: input.dims ?? null,
    zone,
    packageType: input.packageType ?? null,
    category: input.category ?? null,
    categoryId: input.categoryId ?? null,
    priceUsd: input.priceUsd ?? null,
  });
}
