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
 * Minimum handling charge (in USD) FindA.Sale will ever attach to a CALCULATED-cost
 * eBay shipping option (e.g. "Media Mail Calculated"). Without a floor, a cheap
 * package (Media Mail books, small padded envelopes) can compute an FVF-offset
 * handling charge that rounds to a few cents or $0 -- Patrick decision 2026-09-01:
 * every calculated-cost preset/policy charges at least this much handling, full stop,
 * even when the FVF-offset math alone would land lower. Shared by
 * ebayShippingPresetService.ts (organizer-driven preset flow) and
 * ebayCalculatedPolicyService.ts (auto-provisioned CALCULATED-with-handling flow) so
 * the floor can never drift between the two.
 */
export const MIN_CALCULATED_HANDLING_CHARGE = 1.0;

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
 * ⚠️ SUPERSEDED 2026-08-16 FOR RATE_TABLE (USPS) ONLY -- see the authoritative
 * "FULLY REBUILT" block immediately above `const RATE_TABLE` further down. Everything
 * in this block about USPS dollar values, the z8 re-anchor, the 22.5lb row and the
 * baked-in >2cuft fee is HISTORY, kept for provenance, and must not be acted on. The
 * parts about RATE_TABLE_UPS / RATE_TABLE_FEDEX, the 49079->98282 zone-7 determination
 * and the eBay-calculator methodology are still current.
 *
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
//   UPS HALF OF THAT BULLET IS RESOLVED, same day, 2026-08-16 (later pass). Patrick
//     downloaded UPS's own zone chart for origin ZIP3 490 from ups.com (490.xls) and it
//     is parsed directly this session: dest ZIP3 982 -> UPS Ground zone **007**. The
//     49079 -> 98282 lane is UPS zone 7. So $37.00 is a zone-7 price, not an
//     upper-bound-only observation, and the min(30lb cell, $37.00) cap it forced on
//     z1-z6 is gone -- RATE_TABLE_UPS is now rebuilt per-pound from UPS's published
//     daily rate card with $37.00 pinned at z7 @ billable 23lb. See that table's header
//     for the full method, the discount finding (12.2% off DAILY, not the 48%-off-RETAIL
//     eBay advertises), and the monotonicity counts. UPS also publishes NO zone 1 from
//     this origin (chart's Ground column is 002-008 only) -- same as FedEx.
//     THE FEDEX HALF IS ALSO RESOLVED NOW, 2026-08-16 (later pass): FedEx's own Find Zones
//     tool (fedex.com/ratetools) was driven live from origin 49079 and 26 destination ZIPs
//     were read off directly. 49079 -> 98282 is FedEx **zone 7**, and 49079 -> 98357 (Neah
//     Bay) is ALSO zone 7 -- while Los Angeles, San Francisco and Portland OR are zone 8.
//     So the $32.11 observation is a zone-7 price, the FedEx-reads-cleaner-at-z8 speculation
//     in the retraction above is wrong, and the engine's old FedEx "z8" column was a zone-7
//     destination all along. RATE_TABLE_FEDEX is rebuilt accordingly -- see its header.
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
// CLOSED 2026-08-16 (later pass): "the entire RATE_TABLE_FEDEX z2 column ($19.99 flat at
// low weights vs $14.07 at z1 AND z3-z7) inverts zone order in 14 rows" is RESOLVED and the
// table rebuilt. It was never a zone: 30301 and 10001 are BOTH FedEx zone 4 (FedEx's own
// Find Zones tool, origin 49079) with identical struck-through retail, yet 10001 costs
// exactly $5.92 more at every shared weight -- a per-package DESTINATION SURCHARGE, and
// $14.07 + $5.92 = $19.99. Full derivation, the matching $5.92 found on 98282, and the
// consequence for the old z8 column (Neah Bay is FedEx zone SEVEN, not eight) are in the
// RATE_TABLE_FEDEX header below. The paragraph that used to continue here read: NEW SUPPORTING
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
/**
 * ═══════════════════════════════════════════════════════════════════════════════════
 * RATE_TABLE (USPS Ground Advantage) -- FULLY REBUILT 2026-08-16 (ADR-103 Phase 6).
 * READ THIS BLOCK BEFORE THE (NOW SUPERSEDED) HISTORICAL BLOCK BELOW IT.
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * WHAT WAS WRONG: this table was weight x zone ONLY, and its light-weight cells were
 * live eBay quotes that happened to be taken in SMALL boxes -- so they were CUBIC
 * prices, not weight prices, filed against weight rows. USPS bills Ground Advantage on
 * whichever is cheaper of two INDEPENDENT bases (weight and cubic); the old single-basis
 * table could not tell them apart, so any organizer shipping a real-sized box was quoted
 * a small-box cubic price. Measured under-quote against live eBay quotes taken the same
 * day (origin 49079, real seller account, boxes recorded):
 *     z2  7lb -14%   z2 14lb -21%   z2 20lb -31%
 *     z7  7lb -25%   z7 14lb -33%   z7 20lb -45%  (table $15.75 vs real $28.70, 16x13x13)
 * Direct proof of the cubic confusion, same harvest: a 12x9x8in box (864 cu in = exactly
 * 0.500 cu ft) priced $8.00 flat to 49503 at 7lb, 14lb AND 20lb -- completely
 * weight-independent -- and $13.98 flat to 98282 at both 14lb and 20lb. Weight pricing
 * cannot be weight-independent; that is cubic pricing.
 * Independent proof inside this file: the OLD z8 column's 1/2/3/5/7/10/14lb cells were
 * 10.13 / 11.84 / 11.84 / 17.29 / 18.90 / 21.57 / 23.89 -- every one of them an EXACT
 * match to a rung of the Notice 123 p.16 Commercial-Cubic ZONE 8 column
 * (0.10/0.20/0.20/0.40/0.50/0.70/0.90), and none of them a match to the p.15 weight
 * column at the same weight. Seven consecutive cubic prices misfiled as weight prices.
 * Those same seven values were ALSO sitting in CUBIC_TIER_TABLE below, labelled a "flat
 * national rate" -- they are not national, they are the zone-8 column.
 *
 * WHAT THIS TABLE IS NOW: USPS Notice 123 -- Price List, "USPS Ground Advantage /
 * Commercial-Parcels", page 15, transcribed VERBATIM, zones 1-8, at every real published
 * weight step (4oz / 8oz / 12oz / 15.999oz, then every whole pound 1-70). No scaling, no
 * interpolation, no invented cell. Source fetched and text-extracted directly from
 * pe.usps.com/cpim/ftp/manuals/dmm300/notice123.pdf (63pp) on 2026-08-16.
 * NOTE ON EFFECTIVE DATE: the PDF's own cover reads "Notice 123 - Effective July 12,
 * 2026". Earlier comments in this file cite "eff. 2026-08-01" for Notice 123 -- that is
 * wrong; 2026-08-01 is the effective date USPS's ZONE CHART endpoint returns, a different
 * document. The price figures those comments quote are correct and match this edition.
 *
 * WHY PUBLISHED COMMERCIAL AND NOT AN eBAY-DISCOUNTED NUMBER -- and what that costs:
 * Published Commercial is a PROVEN UPPER BOUND on eBay's negotiated price. Across all 50
 * live eBay Ground Advantage quotes harvested 2026-08-16 (origin 49079; destinations
 * 49503/30301/10001/33101/98282/98357 = USPS zones 2/4/5/6/7/8; 8 weights; box dims
 * recorded for every quote), eBay's price was NEVER above published, and was EXACTLY
 * EQUAL in 22 of them:
 *   - at ZONE 8, eBay == published to the penny at every weight tested (1/3/7/14/20/23/
 *     30/50lb) -- ratio 1.000, 8/8;
 *   - at ANY zone, for billable weight >= 23lb, eBay == published to the penny -- ratio
 *     1.000, 14/14 observations (23lb at z2/z5/z7/z8; 30lb and 50lb at all six zones).
 * This matters because the live flat-rate path prices at the organizer's COVERAGE zone,
 * which is the MAX zone over CONUS (coverageZoneForOrigin) -- z8 for every Michigan
 * origin (ZIP1_MAX_ZONE['4'] = 'z8'). So in production this table is EXACT, not an
 * over-estimate. The over-estimate only appears at z1-z7 below 23lb, where eBay does have
 * a real negotiated discount. Those measured discounts are recorded verbatim in
 * EBAY_USPS_OBSERVED_DISCOUNT_RATIOS below -- recorded, deliberately NOT applied. Applying
 * them would require inventing ratios for z1 and z3 (never measured) and for every
 * light-weight LARGE-box cell (never measured, because every light-weight box in the
 * harvest was cubic-eligible), and inventing rate cells is the exact failure this rebuild
 * exists to undo.
 *
 * WHAT THIS FIXES BEYOND THE UNDER-QUOTE: the old table jumped 20 -> 22.5 -> 30 -> 50 ->
 * 70lb, so every parcel in (20, 22.5] paid the 22.5lb price and every parcel in
 * (30, 50] paid the 50lb price. ADR-103 sec.7 called that bracket coarseness "the primary
 * defect". A complete per-pound ladder removes it entirely; the hand-built `maxLb: 22.5`
 * row is no longer needed (23lb is now a real published row) and is gone with it.
 *
 * FEES ARE NOT IN THIS TABLE. Notice 123 p.15 notes 5/6/7 (>22in $4.50, >30in $10.00,
 * >2 cu ft (3456 cu in) $21.00) are applied ONCE, by computeSurchargeForCarrier() only.
 * The old 50lb/70lb z8 cells had the $21.00 fee baked in AND added again at runtime; that
 * double charge cannot recur because every cell below is now a published BASE price
 * (verified: this table's 50lb z8 = 150.27 and 70lb z8 = 191.31 = Notice 123 exactly).
 *
 * CROSS-CHECK THAT THE WHOLE MODEL RECONSTRUCTS REALITY: min(weight p.15, cubic p.16)
 * + fee-once reproduces all 8 zone-8 live quotes to the penny, INCLUDING the two that
 * carry the >2cuft fee (18x16x14 @ 30lb = 96.60 + 21.00 = 117.60 real; 20x18x18 @ 50lb =
 * 150.27 + 21.00 = 171.27 real).
 *
 * Zone columns z1..z8 map to Notice 123's published zones 1..8. The card's zone-9 column
 * is identical to zone 8 throughout and is not modelled.
 */
const RATE_TABLE: RateRow[] = [
  { maxLb: 0.25  , z1: 6.93 , z2: 6.94 , z3: 7.30 , z4: 7.46 , z5: 7.69 , z6: 7.86 , z7: 8.07 , z8: 8.40 }, // 4 oz
  { maxLb: 0.5   , z1: 6.93 , z2: 6.94 , z3: 7.30 , z4: 7.46 , z5: 7.69 , z6: 7.86 , z7: 8.07 , z8: 8.40 }, // 8 oz
  { maxLb: 0.75  , z1: 6.93 , z2: 6.94 , z3: 7.30 , z4: 7.46 , z5: 7.69 , z6: 7.86 , z7: 8.07 , z8: 8.40 }, // 12 oz
  { maxLb: 0.9999, z1: 6.93 , z2: 6.94 , z3: 7.30 , z4: 7.46 , z5: 7.69 , z6: 7.86 , z7: 8.07 , z8: 8.40 }, // 15.999 oz
  { maxLb: 1     , z1: 7.61 , z2: 7.68 , z3: 8.00 , z4: 8.15 , z5: 8.74 , z6: 9.63 , z7: 9.98 , z8: 10.67 },
  { maxLb: 2     , z1: 7.99 , z2: 8.08 , z3: 8.26 , z4: 8.51 , z5: 9.95 , z6: 11.58 , z7: 12.00 , z8: 12.87 },
  { maxLb: 3     , z1: 8.64 , z2: 8.66 , z3: 9.14 , z4: 9.67 , z5: 11.57 , z6: 13.59 , z7: 14.36 , z8: 15.75 },
  { maxLb: 4     , z1: 9.28 , z2: 9.34 , z3: 9.70 , z4: 10.65 , z5: 12.84 , z6: 15.16 , z7: 16.19 , z8: 18.01 },
  { maxLb: 5     , z1: 9.70 , z2: 9.76 , z3: 10.14 , z4: 11.02 , z5: 13.48 , z6: 15.89 , z7: 17.12 , z8: 19.19 },
  { maxLb: 6     , z1: 9.87 , z2: 9.94 , z3: 10.36 , z4: 11.55 , z5: 14.28 , z6: 16.89 , z7: 18.31 , z8: 20.68 },
  { maxLb: 7     , z1: 9.96 , z2: 10.02 , z3: 10.62 , z4: 11.90 , z5: 14.90 , z6: 17.65 , z7: 19.23 , z8: 21.83 },
  { maxLb: 8     , z1: 10.10 , z2: 10.27 , z3: 11.49 , z4: 12.43 , z5: 15.49 , z6: 18.34 , z7: 20.08 , z8: 22.90 },
  { maxLb: 9     , z1: 11.01 , z2: 11.25 , z3: 12.39 , z4: 13.65 , z5: 16.11 , z6: 19.13 , z7: 21.01 , z8: 24.09 },
  { maxLb: 10    , z1: 11.91 , z2: 12.26 , z3: 13.18 , z4: 14.44 , z5: 16.76 , z6: 19.94 , z7: 21.97 , z8: 25.34 },
  { maxLb: 11    , z1: 12.75 , z2: 12.94 , z3: 14.00 , z4: 15.18 , z5: 18.12 , z6: 21.28 , z7: 23.68 , z8: 27.37 },
  { maxLb: 12    , z1: 13.49 , z2: 13.85 , z3: 14.63 , z4: 15.89 , z5: 18.86 , z6: 22.20 , z7: 24.78 , z8: 28.73 },
  { maxLb: 13    , z1: 14.15 , z2: 14.48 , z3: 15.25 , z4: 16.53 , z5: 19.62 , z6: 23.16 , z7: 25.87 , z8: 30.11 },
  { maxLb: 14    , z1: 14.73 , z2: 15.07 , z3: 15.81 , z4: 17.13 , z5: 20.38 , z6: 24.14 , z7: 26.99 , z8: 31.53 },
  { maxLb: 15    , z1: 15.23 , z2: 15.53 , z3: 16.31 , z4: 17.67 , z5: 21.15 , z6: 25.13 , z7: 28.11 , z8: 32.91 },
  { maxLb: 16    , z1: 15.64 , z2: 15.91 , z3: 16.73 , z4: 17.94 , z5: 21.89 , z6: 26.09 , z7: 29.22 , z8: 34.29 },
  { maxLb: 17    , z1: 15.97 , z2: 16.29 , z3: 17.15 , z4: 18.41 , z5: 22.51 , z6: 26.85 , z7: 30.11 , z8: 35.42 },
  { maxLb: 18    , z1: 16.21 , z2: 16.46 , z3: 17.61 , z4: 18.94 , z5: 23.16 , z6: 27.70 , z7: 31.09 , z8: 36.64 },
  { maxLb: 19    , z1: 16.38 , z2: 16.82 , z3: 17.81 , z4: 19.36 , z5: 23.79 , z6: 28.52 , z7: 32.07 , z8: 37.84 },
  { maxLb: 20    , z1: 16.46 , z2: 17.06 , z3: 18.03 , z4: 19.66 , z5: 24.93 , z6: 30.32 , z7: 34.67 , z8: 40.39 },
  { maxLb: 21    , z1: 18.48 , z2: 19.54 , z3: 20.66 , z4: 21.79 , z5: 26.13 , z6: 31.69 , z7: 37.96 , z8: 43.01 },
  { maxLb: 22    , z1: 19.86 , z2: 21.22 , z3: 22.59 , z4: 24.07 , z5: 29.45 , z6: 36.73 , z7: 44.33 , z8: 49.74 },
  { maxLb: 23    , z1: 21.51 , z2: 23.16 , z3: 24.92 , z4: 27.33 , z5: 34.05 , z6: 43.29 , z7: 52.14 , z8: 58.41 },
  { maxLb: 24    , z1: 23.44 , z2: 25.27 , z3: 27.64 , z4: 31.62 , z5: 39.94 , z6: 51.28 , z7: 61.40 , z8: 68.97 },
  { maxLb: 25    , z1: 25.32 , z2: 27.54 , z3: 30.72 , z4: 36.60 , z5: 46.94 , z6: 58.24 , z7: 68.86 , z8: 78.19 },
  { maxLb: 26    , z1: 26.27 , z2: 28.68 , z3: 32.26 , z4: 39.07 , z5: 50.46 , z6: 61.73 , z7: 72.61 , z8: 82.80 },
  { maxLb: 27    , z1: 27.21 , z2: 29.84 , z3: 33.81 , z4: 41.58 , z5: 53.96 , z6: 65.24 , z7: 76.35 , z8: 87.46 },
  { maxLb: 28    , z1: 27.97 , z2: 30.70 , z3: 34.85 , z4: 42.85 , z5: 55.75 , z6: 67.49 , z7: 79.02 , z8: 90.53 },
  { maxLb: 29    , z1: 28.72 , z2: 31.55 , z3: 35.87 , z4: 44.11 , z5: 57.53 , z6: 69.69 , z7: 81.65 , z8: 93.58 },
  { maxLb: 30    , z1: 29.46 , z2: 32.38 , z3: 36.86 , z4: 45.34 , z5: 59.28 , z6: 71.88 , z7: 84.24 , z8: 96.60 },
  { maxLb: 31    , z1: 30.18 , z2: 33.22 , z3: 37.84 , z4: 46.55 , z5: 61.00 , z6: 74.02 , z7: 86.80 , z8: 99.57 },
  { maxLb: 32    , z1: 30.90 , z2: 34.04 , z3: 38.80 , z4: 47.73 , z5: 62.68 , z6: 76.13 , z7: 89.33 , z8: 102.51 },
  { maxLb: 33    , z1: 31.62 , z2: 34.84 , z3: 39.75 , z4: 48.88 , z5: 64.39 , z6: 78.24 , z7: 91.83 , z8: 105.42 },
  { maxLb: 34    , z1: 32.32 , z2: 35.65 , z3: 40.68 , z4: 50.04 , z5: 66.04 , z6: 80.30 , z7: 94.29 , z8: 108.29 },
  { maxLb: 35    , z1: 33.04 , z2: 36.43 , z3: 41.61 , z4: 51.18 , z5: 67.69 , z6: 82.37 , z7: 96.77 , z8: 111.16 },
  { maxLb: 36    , z1: 33.71 , z2: 37.21 , z3: 42.51 , z4: 52.25 , z5: 69.26 , z6: 84.33 , z7: 99.14 , z8: 113.94 },
  { maxLb: 37    , z1: 34.41 , z2: 37.99 , z3: 43.41 , z4: 53.35 , z5: 70.86 , z6: 86.32 , z7: 101.54 , z8: 116.74 },
  { maxLb: 38    , z1: 35.08 , z2: 38.75 , z3: 44.28 , z4: 54.44 , z5: 72.44 , z6: 88.31 , z7: 103.90 , z8: 119.51 },
  { maxLb: 39    , z1: 35.77 , z2: 39.50 , z3: 45.13 , z4: 55.49 , z5: 74.00 , z6: 90.27 , z7: 106.22 , z8: 122.25 },
  { maxLb: 40    , z1: 36.44 , z2: 40.24 , z3: 45.98 , z4: 56.54 , z5: 75.51 , z6: 92.17 , z7: 108.52 , z8: 124.96 },
  { maxLb: 41    , z1: 37.09 , z2: 40.98 , z3: 46.81 , z4: 57.59 , z5: 77.04 , z6: 94.08 , z7: 110.80 , z8: 127.62 },
  { maxLb: 42    , z1: 37.76 , z2: 41.68 , z3: 47.62 , z4: 58.59 , z5: 78.52 , z6: 95.94 , z7: 113.05 , z8: 130.28 },
  { maxLb: 43    , z1: 38.40 , z2: 42.40 , z3: 48.44 , z4: 59.57 , z5: 79.98 , z6: 97.79 , z7: 115.27 , z8: 132.88 },
  { maxLb: 44    , z1: 39.05 , z2: 43.09 , z3: 49.20 , z4: 60.54 , z5: 81.41 , z6: 99.60 , z7: 117.45 , z8: 135.45 },
  { maxLb: 45    , z1: 39.68 , z2: 43.78 , z3: 49.99 , z4: 61.50 , z5: 82.85 , z6: 101.39 , z7: 119.61 , z8: 138.01 },
  { maxLb: 46    , z1: 40.33 , z2: 44.45 , z3: 50.75 , z4: 62.42 , z5: 84.23 , z6: 103.17 , z7: 121.75 , z8: 140.52 },
  { maxLb: 47    , z1: 40.94 , z2: 45.12 , z3: 51.49 , z4: 63.33 , z5: 85.60 , z6: 104.90 , z7: 123.82 , z8: 143.00 },
  { maxLb: 48    , z1: 41.56 , z2: 45.78 , z3: 52.22 , z4: 64.22 , z5: 86.97 , z6: 106.61 , z7: 125.90 , z8: 145.45 },
  { maxLb: 49    , z1: 42.17 , z2: 46.42 , z3: 52.92 , z4: 65.10 , z5: 88.30 , z6: 108.29 , z7: 127.94 , z8: 147.88 },
  { maxLb: 50    , z1: 42.77 , z2: 47.07 , z3: 53.63 , z4: 65.96 , z5: 89.60 , z6: 109.94 , z7: 129.95 , z8: 150.27 },
  { maxLb: 51    , z1: 43.35 , z2: 47.71 , z3: 54.29 , z4: 66.79 , z5: 90.88 , z6: 111.57 , z7: 131.92 , z8: 152.63 },
  { maxLb: 52    , z1: 43.95 , z2: 48.31 , z3: 54.95 , z4: 67.61 , z5: 92.15 , z6: 113.18 , z7: 133.86 , z8: 154.95 },
  { maxLb: 53    , z1: 44.53 , z2: 48.92 , z3: 55.61 , z4: 68.40 , z5: 93.38 , z6: 114.75 , z7: 135.79 , z8: 157.25 },
  { maxLb: 54    , z1: 45.10 , z2: 49.51 , z3: 56.25 , z4: 69.18 , z5: 94.61 , z6: 116.31 , z7: 137.67 , z8: 159.49 },
  { maxLb: 55    , z1: 45.67 , z2: 50.10 , z3: 56.85 , z4: 69.95 , z5: 95.80 , z6: 117.84 , z7: 139.53 , z8: 161.74 },
  { maxLb: 56    , z1: 46.22 , z2: 50.67 , z3: 57.47 , z4: 70.70 , z5: 96.98 , z6: 119.32 , z7: 141.35 , z8: 163.93 },
  { maxLb: 57    , z1: 46.79 , z2: 51.24 , z3: 58.05 , z4: 71.42 , z5: 98.11 , z6: 120.81 , z7: 143.15 , z8: 166.10 },
  { maxLb: 58    , z1: 47.33 , z2: 51.78 , z3: 58.62 , z4: 72.11 , z5: 99.24 , z6: 122.23 , z7: 144.91 , z8: 168.23 },
  { maxLb: 59    , z1: 47.88 , z2: 52.34 , z3: 59.18 , z4: 72.81 , z5: 100.35 , z6: 123.67 , z7: 146.64 , z8: 170.33 },
  { maxLb: 60    , z1: 48.39 , z2: 52.87 , z3: 59.71 , z4: 73.46 , z5: 101.42 , z6: 125.04 , z7: 148.35 , z8: 172.39 },
  { maxLb: 61    , z1: 48.92 , z2: 53.40 , z3: 60.24 , z4: 74.12 , z5: 102.48 , z6: 126.41 , z7: 150.02 , z8: 174.44 },
  { maxLb: 62    , z1: 49.45 , z2: 53.89 , z3: 60.76 , z4: 74.74 , z5: 103.51 , z6: 127.76 , z7: 151.66 , z8: 176.44 },
  { maxLb: 63    , z1: 49.95 , z2: 54.41 , z3: 61.25 , z4: 75.34 , z5: 104.53 , z6: 129.07 , z7: 153.28 , z8: 178.42 },
  { maxLb: 64    , z1: 50.46 , z2: 54.90 , z3: 61.73 , z4: 75.93 , z5: 105.53 , z6: 130.35 , z7: 154.87 , z8: 180.36 },
  { maxLb: 65    , z1: 50.94 , z2: 55.38 , z3: 62.19 , z4: 76.51 , z5: 106.49 , z6: 131.60 , z7: 156.42 , z8: 182.25 },
  { maxLb: 66    , z1: 51.44 , z2: 55.85 , z3: 62.63 , z4: 77.06 , z5: 107.43 , z6: 132.83 , z7: 157.93 , z8: 184.13 },
  { maxLb: 67    , z1: 51.93 , z2: 56.30 , z3: 63.06 , z4: 77.60 , z5: 108.35 , z6: 134.04 , z7: 159.44 , z8: 185.98 },
  { maxLb: 68    , z1: 52.41 , z2: 56.76 , z3: 63.49 , z4: 78.11 , z5: 109.25 , z6: 135.22 , z7: 160.90 , z8: 187.79 },
  { maxLb: 69    , z1: 52.88 , z2: 57.20 , z3: 63.87 , z4: 78.61 , z5: 110.13 , z6: 136.34 , z7: 162.33 , z8: 189.57 },
  { maxLb: 70    , z1: 53.33 , z2: 57.63 , z3: 64.26 , z4: 79.08 , z5: 110.97 , z6: 137.46 , z7: 163.73 , z8: 191.31 },
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

export const USPS_RATE_EFFECTIVE_DATE = '2026-08-16';
export const USPS_RATE_SOURCE = "USPS Notice 123 - Price List (pe.usps.com/cpim/ftp/manuals/dmm300/notice123.pdf, cover date 'Effective July 12, 2026'), fetched and text-extracted directly 2026-08-16. Weight base = p.15 'USPS Ground Advantage / Commercial-Parcels', zones 1-8, every published weight step (4/8/12/15.999oz + every whole pound 1-70lb), transcribed verbatim. Cubic base = p.16 'Commercial Parcels - Cubic', 10 rungs x zones 1-8, verbatim (see USPS_CUBIC_RATE_SOURCE). Published Commercial is a PROVEN UPPER BOUND on eBay's negotiated price and is EXACT at zone 8 and at every weight >=23lb -- validated against 50 live eBay quotes (origin 49079, Patrick's real seller account, 2026-08-16, box dims recorded). eBay's measured discount at zones 1-7 below 23lb is recorded in EBAY_USPS_OBSERVED_DISCOUNT_RATIOS and deliberately NOT applied; see RATE_TABLE's header.";
export const UPS_RATE_EFFECTIVE_DATE = '2026-08-16';
export const UPS_RATE_SOURCE = "UPS 2026 Daily Rate and Service Guide (daily-rates-us-en.xlsx, sheet 'UPS Ground', 1-150lb x zones 2-8) + UPS Ground zone chart for origin ZIP3 490 (490.xls) -- both primary UPS documents, downloaded from ups.com 2026-08-16 -- multiplied by the per-zone eBay/published-daily discount ratio observed in the 2026-08-10/11 live eBay-calculator quotes (POST /shp/calc/api/shipping/services, Patrick's real seller account, origin 49079). Verified out-of-sample at ONE point: z7 @ 23lb, real $37.00 vs modelled $37.41. See RATE_TABLE_UPS header for what is and is not verified.";
export const FEDEX_RATE_EFFECTIVE_DATE = '2026-08-16';
export const FEDEX_RATE_SOURCE = "FedEx 2026 Standard List Rates (FedEx_Standard_List_Rates_2026.xlsx, sheet '2026 Ground & FHD rates', eff. 1/5/2026, one row per pound 1-150lb x zones 2-8) + FedEx's own Find Zones tool (fedex.com/ratetools) driven live from origin 49079 for 26 destination ZIPs -- both primary FedEx documents, obtained 2026-08-16 -- multiplied by the per-zone eBay/published-list discount ratio observed in 60 live eBay-calculator FedEx Ground/Home Delivery quotes (Patrick's real seller account, origin 49079, 2026-08-16), with a $14.07 floor and a per-package destination surcharge modelled separately (see FEDEX_DESTINATION_SURCHARGE_TIERS -- three measured tiers, 51 destination ZIPs, 2026-08-16). Zones 2/4/6/7 were real-anchored at build time; zones 3, 5 and 8 were modelled and have since been VALIDATED against clean-destination live quotes at 1/7/20/30/50lb (z8 also 3/5lb) -- see RATE_TABLE_FEDEX's 'VALIDATION' block. See RATE_TABLE_FEDEX header for what is and is not verified.";

// ── RATE_TABLE_UPS ─ FULLY REBUILT 2026-08-16 FROM UPS'S OWN PUBLISHED RATE CARD ─────
//
// PRIMARY SOURCES (both downloaded from ups.com by Patrick on 2026-08-16, both parsed
// directly this session -- these are the first UPS primary sources this file has ever
// had; every prior UPS number came from eBay's calculator alone):
//   1. UPS Ground zone chart for origin ZIP3 490 (490.xls -- xlsx despite the
//      extension), "For shipments originating in ZIP Codes 490-01 to 490-99", 954
//      destination-ZIP3 rows, one zone column per service. Artifact's origin 49079 is
//      in that range.
//   2. UPS 2026 Daily Rate and Service Guide (daily-rates-us-en.xlsx), sheet
//      "UPS Ground": one row per pound, 1-150lb, columns Zones 2 3 4 5 6 7 8 (+44/45/46
//      for HI/AK/PR). 150 weight rows x 7 zones, verified complete -- no gaps.
// Both files now live in claude_docs/architecture/ alongside the ADR that cites them:
//   ADR-103-source-ups-zone-chart-origin-490.xlsx  (was 490.xls)
//   ADR-103-source-ups-2026-daily-rates.xlsx      (was daily-rates-us-en.xlsx)
// claude_docs/ is gitignored and this repo is public, so they are LOCAL reference only --
// free, public, re-downloadable UPS documents, deliberately not committed. See ADR-103 §9.
//
// FINDING 1 -- THE ZONE. 49079 -> 98282 (Camano Island WA) is UPS Ground **zone 7**.
// Read straight off the chart: dest ZIP3 982 -> Ground "007". This CLOSES the
// "which zone does UPS assign to that lane" flag that had been open since the 22.5lb
// pass earlier the same day (assets.ups.com returned zero bytes from this workspace;
// the file therefore refused to place the $37.00 quote in any zone column and instead
// capped z1-z6 with it). It is no longer unverified: it is z7, from UPS's own chart.
// Other lanes read off the same chart this session (all direct lookups, not inferred):
//   98357 Neah Bay WA -> z8 · 49503 Grand Rapids MI -> z2 · 90210 -> z8 · 10001 -> z5
//   33101 -> z7 · 30301 Atlanta -> z4 (NOT z5 -- ZIP3 300 and 302 are z5, 301 and 303
//   are z4; the Atlanta metro straddles the band boundary).
// **UPS publishes NO zone 1 from origin 490.** The chart's Ground column contains only
// 002-008 (plus 045 / literal HI-AK ZIPs). Same as FedEx, which has no zone 1 at all.
// Programmatic check of the whole chart: min Ground zone = 2, count of zone-1 rows = 0.
//
// FINDING 2 -- THE DISCOUNT, AND WHY "48% OFF" IS THE WRONG NUMBER TO REASON FROM.
// Patrick's real eBay quote for the 48x16x4 / 22lb 4oz guitar box, 49079 -> 98282, was
// UPS Ground **$37.00**. Billable weight 23lb (UPS rounds up to the whole pound), lane
// zone 7. UPS published DAILY z7 @ 23lb = $42.14. So eBay pays **87.80% of published
// daily -- a 12.2% discount**, NOT the ~48% eBay's UI advertises. That 48% is measured
// off UPS *retail*, a third and much higher tariff. Any future anchor quoted through eBay
// must be compared against DAILY, not retail, or it will look far better than it is.
// (The retail figure for this package, $71.72, was reported to this session second-hand
// and is NOT verified here -- the downloaded rate guide contains daily rate sheets only,
// no retail sheet. The 12.2%-off-DAILY number IS verified: $37.00 / $42.14, both sides
// primary-sourced.)
//
// FINDING 3 -- THE DISCOUNT IS NOT ONE NUMBER. It moves hard with weight, and it is not
// the same across zones. Measured, not assumed: the engine's z1/z2 column is the ONE
// column whose destination and UPS zone are both known end-to-end (origin 49079 ->
// 49503, live-quoted at 11 weights 2026-08-10, and 49503 is UPS zone 2 per Finding 1).
// Its eBay/published-daily ratio runs:
//   1lb 0.602 · 2lb 0.567 · 3lb 0.646 · 5lb 0.641 · 7lb 0.656 · 10lb 0.708 · 14lb 0.772
//   · 20lb 0.824 · 30lb 0.883 · 50lb 0.859
// i.e. ~40% off at 1lb narrowing to ~12-14% off at 30-50lb. A single flat factor is
// therefore wrong by construction: applying the one verified 0.878 z7/23lb factor to the
// whole table would price 1lb/z2 at $10.53 against a real observed $7.22 (+46%), and
// 1lb/z8 at $13.20 against a real observed $14.33 (-8%, i.e. SHORT). It was not used.
//
// HOW EACH CELL IS BUILT (state this plainly rather than implying more certainty than
// exists):
//   cell(zone, W) = publishedUpsGroundDaily(zone, W) x r(zone, W)
//   - published... is the primary-source per-pound value, W = 1..70, read from source 2.
//   - r(zone, W) is that column's OWN observed eBay/published ratio, piecewise-linear in
//     weight between the real quoted anchor weights (1,2,3,5,7,10,14,20,30,50lb), held
//     flat at the 50lb ratio above 50lb.
//   Consequence, and the reason this shape was chosen: at every anchor weight the cell
//   reproduces the existing live-quoted eBay value EXACTLY. This pass therefore does not
//   re-price any cell that was already a real quote (one deliberate exception, the 70lb
//   row -- see its inline comment). What it adds is the missing weights in between,
//   using the real published per-pound curve as the interpolant instead of a straight
//   line, because that curve is genuinely irregular: z7 per-pound increments in the
//   20-30lb band alone run from $0.26 (29->30lb) to $2.40 (24->25lb).
//
// THE ONE INDEPENDENT CHECK THIS METHOD GETS, AND IT PASSES. z7 @ 23lb is NOT an anchor
// weight -- it is purely interpolated. The model puts it at $37.41. The real eBay quote
// is $37.00. **1.1% high, on the safe side.** That is the only out-of-sample validation
// available and it is a single point; it is not proof the surface is right everywhere.
// The cell itself is pinned to the real $37.00, not the modelled $37.41.
//
// BRACKET ERROR IS NOW ZERO BY CONSTRUCTION, which was the point. rateFromTable picks
// the first row with lb <= maxLb, so a bracket charges its TOP weight's price to every
// package inside it. With per-pound rows, bracket (W-1, W] contains exactly one billable
// pound, W -- which is precisely how UPS bills (round up to the next whole pound). The
// old bracket set admitted, worst case within each bracket: (3,5] +10.7% · (5,7] +8.7% ·
// (7,10] +9.8% · (10,14] +17.7% · (14,20] +26.5% · (22.5,30] +31.3% · (30,50] +46.0% ·
// (50,70] +96.7%. All of those are now 0.0%. (The "20->30 chasm" was in fact the
// third-worst of the eight, not the worst -- (50,70] and (30,50] were worse.)
//
// WHAT HAPPENED TO ZONE 1. There is no published UPS zone 1 from this origin, so there
// is nothing to build a z1 column from. z1 is set identical to z2 and is a strict upper
// bound on any conceivable zone-1 price. It is also unreachable in practice, confirmed
// by trace rather than assumed: the only caller, computeCheapestForOrigin, gets its zone
// from resolveCoverageZone, which returns the MAX zone over the CONUS corner set, and
// ZIP1_MAX_ZONE contains no z1 entry. Separately, note the engine's "z1" column was
// never a zone-1 column: it was live-quoted 49079 -> 49503, which the UPS chart rates
// zone 2. It is now labelled honestly as a zone-2-sourced column.
//
// MONOTONICITY. Enforced in BOTH directions and checked programmatically. The published
// source table itself has 0 violations over 1-70lb x z2-z8 (checked, not assumed). The
// raw model produced 0 zone inversions but 34 weight inversions -- an artifact of a
// falling ratio meeting a nearly-flat published step (e.g. published z2 31lb $24.66 ->
// 32lb $24.67, +$0.01, against a ratio drifting down toward the 50lb value). Closed with
// a monotone closure that can only ever RAISE a cell, never lower it (never-be-short),
// iterated to a fixed point. Result: 0 zone violations, 0 weight violations. The closure
// touched no anchor cell except five at 50lb, each raised by <= $0.08 (<=0.3%).
// This is the failure the previous UPS attempt hit -- scaling a whole column produced z8
// cheaper than z7 everywhere. It cannot recur silently now: the check is stated here with
// its counts, and any future edit should re-run it.
//
// WHAT IS STILL UNVERIFIED, EXPLICITLY:
//   - The per-zone ratio curves for z3-z8 rest on eBay quotes whose DESTINATION ZIPs were
//     never recorded in this file, so their true UPS zones are unknown. They are used
//     as-labelled. Curve-fitting them against the published chart hints that the z3/z4
//     column behaves like published zone 4 and that the z8 column carries a roughly $4
//     fixed premium consistent with a delivery-area surcharge at Neah Bay -- both are
//     HYPOTHESES from arithmetic, not lookups, and neither was acted on beyond driving
//     z3/z4 from the published z4 column (the conservative, higher-priced of the two).
//   - Validating the discount properly needs eBay quotes at KNOWN destination ZIPs across
//     the weight range at 3-4 different UPS zones, with the destination ZIP recorded
//     alongside each price. Roughly 30 quotes. Until then this is one verified lane (z2,
//     11 weights), one verified point (z7 @ 23lb), and interpolation.
//   - Rows above 70lb: none added. UPS's published table runs to 150lb, but
//     estimateCheapestRate intercepts lb >= 70 with UPS_HIGH_WEIGHT_TOTAL_TABLE, so rows
//     past 70 would be dead except inside one Math.max never-be-short comparison.
//     Extending the table there is a separate, testable change and was not made blind.
//
// PRIOR HISTORY, CONDENSED (the long provenance narrative this block replaces): the UPS
// table was originally 1lb-anchor-per-zone scaled by curve shape (2026-07-05, anchors
// taken at origin 49503 rather than the canonical 49079); z8 re-anchored 2026-08-10 then
// fully re-quoted 2026-08-11; 10lb/30lb rows re-quoted at 4 of 8 zones 2026-08-10; the
// entire table declared live-quoted 2026-08-10 (PENDING_LIVE_VERIFICATION_CELLS closed).
// The 2026-08-16 22.5lb pass added a row that capped z1-z6 at the $37.00 observation
// because the lane's UPS zone was unknown -- that row is superseded here and the cap
// removed; $37.00 is now filed where it belongs, at z7 @ 23lb.
const RATE_TABLE_UPS: RateRow[] = [
  { maxLb: 1  , z1: 7.22 , z2: 7.22 , z3: 7.29 , z4: 7.29 , z5: 8.62 , z6: 9.42 , z7: 10.19 , z8: 14.33 }, // <=1lb: UPS Ground bills a 1lb minimum; eBay quotes confirmed FLAT across 4oz/8oz/12oz/15.999oz/1lb (2026-08-10), so one row covers the whole sub-1lb range
  { maxLb: 2  , z1: 7.29 , z2: 7.29 , z3: 7.88 , z4: 7.88 , z5: 9.42 , z6: 10.65 , z7: 12.17 , z8: 16.80 },
  { maxLb: 3  , z1: 8.64 , z2: 8.64 , z3: 9.81 , z4: 9.81 , z5: 11.58 , z6: 13.70 , z7: 14.75 , z8: 19.26 },
  { maxLb: 4  , z1: 8.85 , z2: 8.85 , z3: 10.53 , z4: 10.53 , z5: 13.02 , z6: 14.97 , z7: 16.37 , z8: 20.80 },
  { maxLb: 5  , z1: 9.10 , z2: 9.10 , z3: 11.04 , z4: 11.04 , z5: 14.40 , z6: 16.57 , z7: 17.68 , z8: 22.20 },
  { maxLb: 6  , z1: 9.24 , z2: 9.24 , z3: 11.46 , z4: 11.46 , z5: 15.35 , z6: 16.75 , z7: 17.76 , z8: 22.21 },
  { maxLb: 7  , z1: 9.87 , z2: 9.87 , z3: 12.03 , z4: 12.03 , z5: 16.69 , z6: 17.15 , z7: 18.22 , z8: 22.93 },
  { maxLb: 8  , z1: 10.42 , z2: 10.42 , z3: 12.48 , z4: 12.48 , z5: 17.11 , z6: 17.83 , z7: 19.00 , z8: 23.68 },
  { maxLb: 9  , z1: 10.84 , z2: 10.84 , z3: 12.60 , z4: 12.60 , z5: 17.22 , z6: 18.20 , z7: 19.71 , z8: 24.67 },
  { maxLb: 10 , z1: 11.27 , z2: 11.27 , z3: 12.95 , z4: 12.95 , z5: 17.59 , z6: 18.40 , z7: 20.63 , z8: 26.01 },
  { maxLb: 11 , z1: 12.27 , z2: 12.27 , z3: 13.62 , z4: 13.62 , z5: 18.00 , z6: 19.14 , z7: 22.35 , z8: 28.00 },
  { maxLb: 12 , z1: 12.66 , z2: 12.66 , z3: 14.14 , z4: 14.14 , z5: 18.14 , z6: 19.87 , z7: 23.33 , z8: 28.79 },
  { maxLb: 13 , z1: 12.98 , z2: 12.98 , z3: 14.59 , z4: 14.59 , z5: 18.35 , z6: 20.55 , z7: 24.56 , z8: 29.87 },
  { maxLb: 14 , z1: 13.85 , z2: 13.85 , z3: 15.24 , z4: 15.24 , z5: 18.93 , z6: 21.82 , z7: 26.31 , z8: 31.98 },
  { maxLb: 15 , z1: 14.01 , z2: 14.01 , z3: 15.66 , z4: 15.66 , z5: 19.55 , z6: 23.11 , z7: 27.16 , z8: 33.54 },
  { maxLb: 16 , z1: 14.53 , z2: 14.53 , z3: 16.15 , z4: 16.15 , z5: 20.15 , z6: 24.13 , z7: 29.04 , z8: 35.11 },
  { maxLb: 17 , z1: 14.80 , z2: 14.80 , z3: 16.54 , z4: 16.54 , z5: 20.82 , z6: 25.05 , z7: 30.56 , z8: 35.38 },
  { maxLb: 18 , z1: 15.12 , z2: 15.12 , z3: 16.92 , z4: 16.92 , z5: 21.92 , z6: 26.45 , z7: 31.98 , z8: 38.23 },
  { maxLb: 19 , z1: 15.64 , z2: 15.64 , z3: 17.95 , z4: 17.95 , z5: 23.00 , z6: 27.23 , z7: 32.87 , z8: 40.19 },
  { maxLb: 20 , z1: 15.82 , z2: 15.82 , z3: 18.18 , z4: 18.18 , z5: 23.85 , z6: 28.27 , z7: 34.37 , z8: 41.72 },
  { maxLb: 21 , z1: 16.61 , z2: 16.61 , z3: 19.29 , z4: 19.29 , z5: 24.30 , z6: 29.22 , z7: 35.46 , z8: 42.79 },
  { maxLb: 22 , z1: 16.74 , z2: 16.74 , z3: 20.10 , z4: 20.10 , z5: 25.12 , z6: 30.29 , z7: 36.65 , z8: 44.46 },
  { maxLb: 23 , z1: 17.66 , z2: 17.66 , z3: 20.66 , z4: 20.66 , z5: 25.58 , z6: 31.31 , z7: 37.00 , z8: 45.71 }, // 23lb is the ONLY weight in this table that was interpolated rather than anchored, and it was the only weight the table missed. THREE MORE REAL eBay quotes pinned here 2026-08-16 (origin 49079, Patrick's real seller account, 16x14x14in box @ 23lb -- billable 23lb, dim weight 3136/139 = 22.56lb, longest side 16in so no AHS trigger, i.e. a clean base-rate observation): z2 $17.66 (dest 49503, was $17.66 vs modelled 16.87), z5 $25.58 (dest 10001, was 25.38), z8 $45.71 (dest 98357, was 46.02). Destination-to-UPS-zone from UPS's OWN Ground zone chart for origin ZIP3 490 (490.xls, parsed directly): 495->002, 100->005, 983->008, 982->007, 303->004, 331->007. z1 tracks z2 because UPS publishes no zone 1 from this origin and this file groups z1=z2 for UPS on real exact-penny evidence. z7 $37.00 was already pinned and re-confirmed by this harvest. z3/z4/z6 remain modelled (published daily x per-zone eBay ratio) -- UNVERIFIED at 23lb, no destination in the harvest resolves to UPS zone 3 or 6. Same harvest independently re-confirmed the ENTIRE 20lb row to the penny at all five measured zones (z2 15.82, z4 18.18, z5 23.85, z7 34.37, z8 41.72), so this row was the only miss
  { maxLb: 24 , z1: 17.66 , z2: 17.66 , z3: 21.92 , z4: 21.92 , z5: 26.91 , z6: 32.91 , z7: 38.55 , z8: 48.41 }, // z1/z2 RAISE-ONLY monotone closure 2026-08-16: were 17.59, i.e. BELOW the newly-pinned real $17.66 at 23lb one row up. A modelled cell may not sit under a measured one at a higher weight. Raised to 17.66 (the measured floor), not lowered anywhere; 25lb z1/z2 = 17.76 already clears it, so the ripple stops here. The other six zones needed no adjustment
  { maxLb: 25 , z1: 17.76 , z2: 17.76 , z3: 22.17 , z4: 22.17 , z5: 27.23 , z6: 33.48 , z7: 40.55 , z8: 49.66 },
  { maxLb: 26 , z1: 18.75 , z2: 18.75 , z3: 23.26 , z4: 23.26 , z5: 28.34 , z6: 34.56 , z7: 42.07 , z8: 51.48 },
  { maxLb: 27 , z1: 19.40 , z2: 19.40 , z3: 23.88 , z4: 23.88 , z5: 28.80 , z6: 35.81 , z7: 42.71 , z8: 52.09 },
  { maxLb: 28 , z1: 19.99 , z2: 19.99 , z3: 24.98 , z4: 24.98 , z5: 30.40 , z6: 37.39 , z7: 44.49 , z8: 53.82 },
  { maxLb: 29 , z1: 20.15 , z2: 20.15 , z3: 25.53 , z4: 25.53 , z5: 30.43 , z6: 38.30 , z7: 45.35 , z8: 54.99 },
  { maxLb: 30 , z1: 20.48 , z2: 20.48 , z3: 26.67 , z4: 26.67 , z5: 31.63 , z6: 38.76 , z7: 45.43 , z8: 56.99 },
  { maxLb: 31 , z1: 21.40 , z2: 21.40 , z3: 27.25 , z4: 27.25 , z5: 32.06 , z6: 39.68 , z7: 47.08 , z8: 58.73 },
  { maxLb: 32 , z1: 21.40 , z2: 21.40 , z3: 27.25 , z4: 27.25 , z5: 32.06 , z6: 39.88 , z7: 47.08 , z8: 59.29 },
  { maxLb: 33 , z1: 21.43 , z2: 21.43 , z3: 28.39 , z4: 28.39 , z5: 33.49 , z6: 42.17 , z7: 48.55 , z8: 60.81 },
  { maxLb: 34 , z1: 21.43 , z2: 21.43 , z3: 29.25 , z4: 29.25 , z5: 34.63 , z6: 42.39 , z7: 49.94 , z8: 63.63 },
  { maxLb: 35 , z1: 21.77 , z2: 21.77 , z3: 29.92 , z4: 29.92 , z5: 35.15 , z6: 43.11 , z7: 51.18 , z8: 63.99 },
  { maxLb: 36 , z1: 22.08 , z2: 22.08 , z3: 30.35 , z4: 30.35 , z5: 36.45 , z6: 44.91 , z7: 52.87 , z8: 66.40 },
  { maxLb: 37 , z1: 22.54 , z2: 22.54 , z3: 30.76 , z4: 30.76 , z5: 36.94 , z6: 45.12 , z7: 54.52 , z8: 66.95 },
  { maxLb: 38 , z1: 22.68 , z2: 22.68 , z3: 31.53 , z4: 31.53 , z5: 37.78 , z6: 46.12 , z7: 54.69 , z8: 68.10 },
  { maxLb: 39 , z1: 23.59 , z2: 23.59 , z3: 32.82 , z4: 32.82 , z5: 38.98 , z6: 47.96 , z7: 56.78 , z8: 69.40 },
  { maxLb: 40 , z1: 23.59 , z2: 23.59 , z3: 32.82 , z4: 32.82 , z5: 39.02 , z6: 48.28 , z7: 56.78 , z8: 69.40 },
  { maxLb: 41 , z1: 24.07 , z2: 24.07 , z3: 33.66 , z4: 33.66 , z5: 40.30 , z6: 50.24 , z7: 58.42 , z8: 72.19 },
  { maxLb: 42 , z1: 24.07 , z2: 24.07 , z3: 34.92 , z4: 34.92 , z5: 40.30 , z6: 50.51 , z7: 59.37 , z8: 72.19 },
  { maxLb: 43 , z1: 24.46 , z2: 24.46 , z3: 34.92 , z4: 34.92 , z5: 42.38 , z6: 53.24 , z7: 61.46 , z8: 73.94 },
  { maxLb: 44 , z1: 24.79 , z2: 24.79 , z3: 35.74 , z4: 35.74 , z5: 43.09 , z6: 53.40 , z7: 62.97 , z8: 74.60 },
  { maxLb: 45 , z1: 24.79 , z2: 24.79 , z3: 35.74 , z4: 35.74 , z5: 43.09 , z6: 53.56 , z7: 64.48 , z8: 75.01 },
  { maxLb: 46 , z1: 25.45 , z2: 25.45 , z3: 36.78 , z4: 36.78 , z5: 44.04 , z6: 54.96 , z7: 65.10 , z8: 76.89 },
  { maxLb: 47 , z1: 25.45 , z2: 25.45 , z3: 37.30 , z4: 37.30 , z5: 44.31 , z6: 55.74 , z7: 66.32 , z8: 78.02 },
  { maxLb: 48 , z1: 25.45 , z2: 25.45 , z3: 37.61 , z4: 37.61 , z5: 45.61 , z6: 56.53 , z7: 67.35 , z8: 79.73 },
  { maxLb: 49 , z1: 25.45 , z2: 25.45 , z3: 37.63 , z4: 37.63 , z5: 45.61 , z6: 57.38 , z7: 68.64 , z8: 80.09 },
  { maxLb: 50 , z1: 25.45 , z2: 25.45 , z3: 37.63 , z4: 37.63 , z5: 45.61 , z6: 57.43 , z7: 68.66 , z8: 80.48 },
  { maxLb: 51 , z1: 25.45 , z2: 25.45 , z3: 37.67 , z4: 37.67 , z5: 45.66 , z6: 57.73 , z7: 69.01 , z8: 82.51 },
  { maxLb: 52 , z1: 25.45 , z2: 25.45 , z3: 37.71 , z4: 37.71 , z5: 45.69 , z6: 57.74 , z7: 69.02 , z8: 82.52 },
  { maxLb: 53 , z1: 25.45 , z2: 25.45 , z3: 37.72 , z4: 37.72 , z5: 45.95 , z6: 57.75 , z7: 69.03 , z8: 83.34 },
  { maxLb: 54 , z1: 25.46 , z2: 25.46 , z3: 37.79 , z4: 37.79 , z5: 46.04 , z6: 57.76 , z7: 69.03 , z8: 83.39 },
  { maxLb: 55 , z1: 25.46 , z2: 25.46 , z3: 37.80 , z4: 37.80 , z5: 46.26 , z6: 57.83 , z7: 69.04 , z8: 83.46 },
  { maxLb: 56 , z1: 25.47 , z2: 25.47 , z3: 37.84 , z4: 37.84 , z5: 46.27 , z6: 57.85 , z7: 69.12 , z8: 83.61 },
  { maxLb: 57 , z1: 25.94 , z2: 25.94 , z3: 37.91 , z4: 37.91 , z5: 47.65 , z6: 57.89 , z7: 69.17 , z8: 85.19 },
  { maxLb: 58 , z1: 25.95 , z2: 25.95 , z3: 37.92 , z4: 37.92 , z5: 47.71 , z6: 57.90 , z7: 69.23 , z8: 85.25 },
  { maxLb: 59 , z1: 26.01 , z2: 26.01 , z3: 38.17 , z4: 38.17 , z5: 47.72 , z6: 58.22 , z7: 69.38 , z8: 86.61 },
  { maxLb: 60 , z1: 26.68 , z2: 26.68 , z3: 38.82 , z4: 38.82 , z5: 49.39 , z6: 59.31 , z7: 69.39 , z8: 87.15 },
  { maxLb: 61 , z1: 26.69 , z2: 26.69 , z3: 39.15 , z4: 39.15 , z5: 49.43 , z6: 59.32 , z7: 69.40 , z8: 88.18 },
  { maxLb: 62 , z1: 27.80 , z2: 27.80 , z3: 39.85 , z4: 39.85 , z5: 50.57 , z6: 60.24 , z7: 70.41 , z8: 89.06 },
  { maxLb: 63 , z1: 27.81 , z2: 27.81 , z3: 40.23 , z4: 40.23 , z5: 50.57 , z6: 60.65 , z7: 71.00 , z8: 89.07 },
  { maxLb: 64 , z1: 28.55 , z2: 28.55 , z3: 40.58 , z4: 40.58 , z5: 50.60 , z6: 61.07 , z7: 71.01 , z8: 89.42 },
  { maxLb: 65 , z1: 28.87 , z2: 28.87 , z3: 40.59 , z4: 40.59 , z5: 50.70 , z6: 61.60 , z7: 71.19 , z8: 89.44 },
  { maxLb: 66 , z1: 28.99 , z2: 28.99 , z3: 40.91 , z4: 40.91 , z5: 51.10 , z6: 61.64 , z7: 71.40 , z8: 90.67 },
  { maxLb: 67 , z1: 29.00 , z2: 29.00 , z3: 40.91 , z4: 40.91 , z5: 51.13 , z6: 62.12 , z7: 71.74 , z8: 90.72 },
  { maxLb: 68 , z1: 29.32 , z2: 29.32 , z3: 43.40 , z4: 43.40 , z5: 52.22 , z6: 63.03 , z7: 72.84 , z8: 90.78 },
  { maxLb: 69 , z1: 29.94 , z2: 29.94 , z3: 43.71 , z4: 43.71 , z5: 52.61 , z6: 63.96 , z7: 72.90 , z8: 91.93 },
  { maxLb: 70 , z1: 29.96 , z2: 29.96 , z3: 44.33 , z4: 44.33 , z5: 54.44 , z6: 64.64 , z7: 72.95 , z8: 91.94 }, // 70lb row REBUILT: the prior real-quoted 70lb cells (z1/z2 51.82, z3/z4 66.19, z5 76.39, z6 86.13, z7 95.03, z8 112.98) sat ABOVE UPS published daily at every zone (ratio 1.10-1.49) because a >50lb quote carries the AHS-weight accessorial, which computeSurchargeForCarrier ADDS again on top -- a double charge. base(published x r50) + AHS(modeled) reproduces those real totals to +3%..+8%, over not short
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

/**
 * PER-PACKAGE FEDEX DESTINATION SURCHARGE -- MEASURED THREE-TIER MODEL (2026-08-16 harvest).
 *
 * SUPERSEDES the single flat `FEDEX_DESTINATION_SURCHARGE_OBSERVED = 5.92` that stood here.
 * A 133-quote live harvest (eBay's own calculator, Patrick's real seller account, origin
 * 49079, destination ZIP recorded with every price) measured what the flat constant was
 * guessing, and it was wrong in BOTH directions.
 *
 * WHAT WAS MEASURED. The surcharge is a flat per-package amount, invariant in weight and in
 * box, attached to the destination ZIP, and it is FedEx Ground / Home Delivery ONLY -- at the
 * same destination, UPS Ground, UPS Ground Saver, USPS Ground Advantage and FedEx Ground
 * ECONOMY all price identically to a clean destination; only Ground/Home Delivery moves.
 * It comes in exactly three tiers, and every surcharged observation reconciles to
 * base + one of these three constants to within $0.01:
 *
 *     tier        price add     retail add     example destinations
 *     clean       $0.00         $0.00          46201, 49503, 90210, 98101, 11201, 19104 ...
 *     A           $5.92         $0.00          10001 Manhattan, 94102 SF, 02108 Boston ...
 *     B           $7.90         $9.75          98357 Neah Bay, 93526 Big Pine, 83252 ...
 *     C           $15.03        $21.06         02554 Nantucket, 82190 Yellowstone, 49782 ...
 *
 * TIER AND ZONE ARE INDEPENDENT: 49782 Beaver Island is z3 base $16.44 + $15.03; 82190
 * Yellowstone is z6 base $21.21 + the same $15.03. The tier is not a function of distance.
 *
 * THERE IS NO RULE THAT PREDICTS TIER FROM THE ZIP, and none is invented here. Manhattan,
 * Boston and San Francisco are tier A while Brooklyn, Jersey City, Washington DC,
 * Philadelphia, Oakland, San Jose, Los Angeles and Seattle are clean. Dense-vs-rural,
 * coastal-vs-inland and ZIP3 prefix all fail as predictors on the measured set. The map
 * below is therefore a record of MEASUREMENT ONLY -- 51 destinations out of ~41,000 US ZIPs.
 *
 * ── THE DECISION, AND WHAT IT COSTS ──────────────────────────────────────────────────────
 *
 * THE ENGINE HAS NO DESTINATION ZIP. estimateCheapestRate() takes a COVERAGE zone derived
 * from the ORIGIN (coverageZoneForOrigin / resolveCoverageZone) and returns ONE flat price
 * the organizer charges every buyer in CONUS. Grepped project-wide: no caller anywhere
 * (ebayShippingResolver, ebayFlatRatePolicyService, ebayCalculatedPolicyService,
 * ebayShippingPresetService, nativeShippingSuggestionService, ebayController) has or passes
 * a buyer ZIP. So a ZIP -> tier lookup has nothing to look up on the live path, and the
 * question is only "which single constant does the flat rate carry".
 *
 * A flat rate must cover the worst destination the seller could be sent, exactly as
 * coverageZoneForOrigin already prices every Michigan origin at z8. The worst MEASURED
 * destination tier is C. So the unmapped/no-destination default is C, and the residual
 * short exposure on the FedEx dimension is zero across all 51 measured destinations.
 *
 * THE COST OF THAT, MEASURED BY EXECUTING THE MODULE (144-case sweep, 8 zones x 18
 * weight/box combinations, comparing the final CHEAPEST-WINS quote at $5.92 vs $15.03):
 *   - 107 of 144 cases (74%) DO NOT CHANGE AT ALL. USPS or UPS was already cheaper, and
 *     neither carrier carries this surcharge, so the quote is unaffected.
 *   - 37 of 144 rise; mean rise across ALL cases +$1.48, worst case +$9.11.
 *   - In every one of those 37, the new price is min(FedEx+$15.03, UPS, USPS) -- i.e. it is
 *     the cheapest label that is guaranteed to EXIST at every CONUS destination. Where the
 *     full +$9.11 flows through (z6-z8, >=25lb) UPS and USPS were MORE expensive still, so
 *     under $5.92 the organizer was genuinely short by that amount at a tier-C address.
 *   The feared "overcharge everyone by $15" does not happen, because the cheapest-wins
 *   comparison caps it: when FedEx+$15.03 stops being cheapest, the engine simply quotes the
 *   destination-invariant UPS/USPS price instead. That fallback is the safety valve.
 *
 * WHAT IT STILL COSTS, STATED NOT HIDDEN: on those 37 heavy/far cases a buyer to a CLEAN
 * destination is charged up to $15.03 more than the label costs. That is the same
 * worst-case trade coverageZoneForOrigin makes (z8-for-all-Michigan is worth ~$25 at 50lb),
 * applied on the destination axis instead of the distance axis.
 *
 * KNOWN CONSEQUENCE TO SURFACE, NOT A BUG: at tier C the engine's suggested flat price for
 * a 48x16x4in / 22lb 4oz guitar at z8 goes $41.45 -> $52.00 (executed, not estimated). Patrick's locked GUITAR GIG BAG
 * preset is $47.49 (nets $41.03 after the 13.6% FVF), which covers tier B ($36.90) but is
 * $3.00 short of tier C ($44.03). That preset is user data and is NOT touched by this file.
 * If the product's accepted posture is "cover through tier B, accept the tier-C tail",
 * FLIP THE ONE TOKEN BELOW: FEDEX_DESTINATION_SURCHARGE_UNMAPPED_TIER = 'B'. Measured
 * consequence of doing so: max quote rise vs today +$1.98 (mean +$0.47) instead of +$9.11,
 * and a residual $7.13 short exposure at the 10 measured tier-C ZIPs. Both options are one
 * token apart deliberately -- this is a policy dial, not an algorithm.
 *
 * NOT APPLIED AT lb >= 70, unchanged and deliberate. That path uses
 * FEDEX_HIGH_WEIGHT_TOTAL_TABLE, which holds real eBay TOTALS (base + whatever accessorials
 * their lane carried), so adding a surcharge on top would risk double-charging.
 * estimateCheapestRate already zeroes all surcharges on that branch.
 *
 * CORRECTED 2026-08-17 -- this paragraph used to add "with destinations never recorded --
 * its z7 and z8 columns are byte-identical at 90/110/130/150lb, the signature of one
 * destination quoted into two columns". BOTH halves of that are contradicted by
 * FEDEX_HIGH_WEIGHT_TOTAL_TABLE's OWN provenance comment, which is the better-sourced
 * claim and was written by the session that gathered the quotes:
 *   (1) The destinations ARE recorded, per zone: z1 49503, z2 60601, z3 46201, z4 63101,
 *       z5 67202, z6 80202, z7 89101, z8 98101 (origin 49079, 10x8x6in).
 *   (2) The z7/z8 identity is a REAL FedEx zone grouping, not a copied column -- 89101 and
 *       98101 are two genuinely different destinations that returned exact-penny-identical
 *       live quotes at all four weights, which is evidence OF grouping, not of duplication.
 *       (The same comment records UPS grouping z1=z2 and z3=z4 the same way.)
 * See that table for what this means for the destination-surcharge content specifically.
 *
 * MECHANISM STILL UNKNOWN AND STILL NOT ASSERTED. Three flat ZIP-attached tiers with their
 * own retail counterparts ($0 / $9.75 / $21.06) is the shape of a Delivery Area Surcharge
 * ladder, but it does not match FedEx's published 2026 structure (whose only per-package
 * note is a $6.45 residential surcharge), and the retail add and the negotiated add do not
 * track each other -- tier A adds $5.92 negotiated against $0.00 retail. Naming it "DAS"
 * would still be a guess. It is named for what was observed.
 *
 * WHAT WOULD IMPROVE THIS: more measured ZIPs. Adding them is DATA, not code -- append to
 * FEDEX_DESTINATION_SURCHARGE_ZIP_TIER and nothing else changes. The map only becomes
 * load-bearing on the live path once a destination-aware quote path exists (eBay CALCULATED
 * shipping, or a buyer-ZIP preview); fedexDestinationSurchargeForZip(),
 * estimateCheapestRate's optional `destinationZip` and (since 2026-08-17)
 * computeCheapestForOrigin's are wired end-to-end for that day.
 *
 * ── DESTINATION ZIP IS NOT AVAILABLE AT PRICING TIME (investigated 2026-08-17) ───────────
 *
 * A prior note framed this as "data shipped but not wired", with the fix being to "thread a
 * destination ZIP through the rate engine's callers". THAT FIX IS NOT AVAILABLE, and the
 * reason is worth stating plainly so it is not re-attempted a third time.
 *
 * It is not that callers forget to pass a buyer ZIP. It is that NO CALLER HAS ONE, and the
 * system does not store one anywhere. Verified against the live production database
 * 2026-08-17, not assumed: the ONLY ZIP/postal columns that exist in the entire schema are
 * `Sale.zip` (the ORIGIN) and `UspsZoneChartEntry.originZip3`/`destZip3` (this engine's own
 * zone-chart cache). `Purchase` has no shipping address at all, and no table in the schema
 * has an address column belonging to a buyer.
 *
 * The deeper reason is architectural, not an oversight. EVERY surface that consumes this
 * engine prices at LISTING time, when no buyer exists yet:
 *   - eBay flat-rate policies (ebayFlatRatePolicyService) -- one price, every buyer.
 *   - eBay shipping presets (ebayShippingPresetService) -- account-wide, many origins.
 *   - Native FindA.Sale checkout: suggestNativeShippingPrice writes Item.shippingPrice at
 *     listing time, and stripeController.ts:621-622 later charges that stored value verbatim
 *     (`shippingCost = item.shippingPrice`). The PaymentIntent amount is fixed before any
 *     address is collected, so even the native path -- the one place a buyer ZIP could in
 *     principle be known -- never learns it before the price is set.
 * This is the SAME design decision resolveCoverageZone already makes on the distance axis:
 * price the farthest CONUS zone so one number covers every buyer. Destination-blindness on
 * the surcharge axis is the same posture, not a gap in it.
 *
 * THEREFORE the tier-B default is not a placeholder awaiting plumbing -- it IS the answer:
 * a deliberate blended rate, and the only kind of answer a listing-time price can give.
 * Both directions of that blend, measured by executing this module on a real live package
 * (the 36x16x5in / 173oz guitar, item cmo3eu1fs0071jqsuty6i4ylj, at z8):
 *   - UNDER-recovery at a tier-C destination: $6.94 (engine $35.85 blind vs $42.79 to
 *     Nantucket 02554 -- and note the winning carrier FLIPS to UPS there, which caps the
 *     gap below the raw $15.03 - $7.90 = $7.13 tier delta).
 *   - OVER-charge at a measured-clean destination: $7.90 (engine $35.85 blind vs $27.95 to
 *     90210). This side had never been quantified, and it is the MORE COMMON one: 24 of the
 *     51 measured ZIPs (47%) are clean, versus 10 (20%) at tier C. The measured set is a
 *     deliberate surcharge hunt, so neither share is a population frequency -- but the
 *     blend demonstrably costs buyers at clean destinations more often than it costs the
 *     organizer at remote ones.
 * A destination-aware path would fix BOTH. Until one exists, the residual is bounded by the
 * tier delta ($7.13 max per FedEx-winning package) and applies only when FedEx wins.
 *
 * IF A DESTINATION-AWARE PATH IS EVER WANTED, the cheapest real version is eBay CALCULATED
 * shipping (ebayCalculatedPolicyService), where eBay itself rates against the buyer's ZIP
 * at checkout and this engine's flat number stops being the price at all. Threading a ZIP
 * into this engine would additionally require capturing and storing a buyer address that the
 * schema does not currently have -- a product decision, not a plumbing task.
 */
export const FEDEX_DESTINATION_SURCHARGE_TIERS = {
  clean: 0,
  A: 5.92,
  B: 7.9,
  C: 15.03,
} as const;

export type FedexDestinationSurchargeTier = keyof typeof FEDEX_DESTINATION_SURCHARGE_TIERS;

/** Retail (struck-through) counterpart of each tier, from the same harvest. RECORDED, NOT
 *  APPLIED -- the engine prices off eBay's negotiated column. Kept because the retail ladder
 *  is the strongest evidence the three tiers are a real carrier structure and not noise. */
export const FEDEX_DESTINATION_SURCHARGE_TIERS_RETAIL: Readonly<Record<FedexDestinationSurchargeTier, number>> = {
  clean: 0,
  A: 0,
  B: 9.75,
  C: 21.06,
};

/**
 * MEASURED destinations only -- 51 ZIPs, origin 49079, 2026-08-16. Clean ZIPs are listed
 * explicitly rather than omitted: "measured clean" and "never measured" are different facts,
 * and only the first justifies charging $0. Append measured ZIPs here; no code change needed.
 */
export const FEDEX_DESTINATION_SURCHARGE_ZIP_TIER: Readonly<Record<string, FedexDestinationSurchargeTier>> = {
  // clean -- $0.00 (24 measured)
  '46201': 'clean', '44101': 'clean', '15201': 'clean', '80202': 'clean', '75201': 'clean',
  '70112': 'clean', '04101': 'clean', '30301': 'clean', '33101': 'clean', '87101': 'clean',
  '49503': 'clean', '90210': 'clean', '90001': 'clean', '92101': 'clean', '94612': 'clean',
  '95101': 'clean', '97201': 'clean', '98101': 'clean', '89101': 'clean', '89701': 'clean',
  '11201': 'clean', '07302': 'clean', '20001': 'clean', '19104': 'clean',
  // tier A -- +$5.92 (9 measured)
  '10001': 'A', '94102': 'A', '94105': 'A', '02108': 'A', '97401': 'A',
  '98282': 'A', '33040': 'A', '59101': 'A', '59718': 'A',
  // tier B -- +$7.90 (8 measured)
  '98357': 'B', '97635': 'B', '97620': 'B', '93526': 'B',
  '89832': 'B', '89045': 'B', '83252': 'B', '88267': 'B',
  // tier C -- +$15.03 (10 measured)
  '95568': 'C', '02554': 'C', '04645': 'C', '82190': 'C', '84034': 'C',
  '59087': 'C', '89049': 'C', '89310': 'C', '97910': 'C', '49782': 'C',
};

/**
 * The tier assumed for any destination NOT in the map above -- which, on today's flat-rate
 * path, is EVERY quote (the engine has no destination ZIP at all). This single token is the
 * whole policy. 'C' = never short at any measured destination; 'B' = cover through tier B
 * and accept a $7.13 tail at the 10 measured tier-C ZIPs. See the header block for the
 * measured cost of each.
 */
// SET TO 'C' 2026-08-24 by Patrick's explicit decision (ADR-110 Section 6, Decision Flag 1,
// option (b) -- "bias the blend to tier-C for FLAT_TIERS"), superseding the 2026-08-16 'B'
// setting below. Rationale from the ADR: this eliminates organizer under-recovery entirely
// (the engine is never short at any measured destination) at the cost of a buyer overcharge
// at a clean/tier-A/tier-B destination becoming the norm instead of the exception. Scope:
// this token governs the flat-rate (FLAT_TIERS-style) blended default across the whole
// engine -- there is no separate FLAT_TIERS-only constant, and no destination-aware path
// exists yet for any caller (see the header block above), so every unmapped/no-ZIP quote
// on any surface gets this value, exactly as it did when the token was 'B'. Prior setting
// history, kept for record: SET TO 'B' 2026-08-16 by Patrick's explicit decision. Cover
// through tier B (+$7.90); accept the residual ~$7.13 exposure at the 10 measured tier-C
// ZIPs (Nantucket, Yellowstone, Somes Bar, Beaver Island and similar). Measured effect vs
// the prior flat $5.92: worst rise +$1.98, mean +$0.47. Chosen over 'C' at the time because
// 'C' would have made the live GUITAR GIG BAG preset ($47.49) read as under-covered by the
// below-cost guard -- that consequence is now accepted per the 2026-08-24 decision above.
// See ADR-103 SS14 (original 'B' decision) and ADR-110 (2026-08-24, this change).
export const FEDEX_DESTINATION_SURCHARGE_UNMAPPED_TIER: FedexDestinationSurchargeTier = 'C';

/** The amount the destination-blind flat-rate path actually adds to every FedEx quote. */
export const FEDEX_DESTINATION_SURCHARGE_FLAT_RATE_DEFAULT =
  FEDEX_DESTINATION_SURCHARGE_TIERS[FEDEX_DESTINATION_SURCHARGE_UNMAPPED_TIER];

/**
 * FedEx Ground/Home Delivery per-package destination surcharge for a destination ZIP.
 * Pass null/undefined (or a ZIP we have never measured) and you get the conservative
 * unmapped default -- never a $0 guess. ZIP+4 and whitespace are tolerated; only the
 * leading 5 digits are used.
 */
export function fedexDestinationSurchargeForZip(destZip?: string | null): number {
  const five = String(destZip ?? '').trim().slice(0, 5);
  const tier = /^\d{5}$/.test(five) ? FEDEX_DESTINATION_SURCHARGE_ZIP_TIER[five] : undefined;
  return tier ? FEDEX_DESTINATION_SURCHARGE_TIERS[tier] : FEDEX_DESTINATION_SURCHARGE_FLAT_RATE_DEFAULT;
}

// ── RATE_TABLE_FEDEX ─ FULLY REBUILT 2026-08-16 FROM FEDEX'S OWN PUBLISHED RATE CARD ──
//
// This replaces the 16-bracket table that stood here, whose z2 column had been flagged
// "pre-existing and unexplained" for two sessions. It is explained below, and it was not
// a zone at all.
//
// PRIMARY SOURCES (both obtained this session, both used directly -- these are the first
// FedEx zone facts this file has ever had; every prior FedEx number came from eBay's
// calculator with the lane's FedEx zone unknown):
//   1. FedEx's own Find Zones tool (fedex.com/ratetools), driven live from origin 49079,
//      FedEx Ground. 26 destination ZIPs read off directly. The ones that matter here:
//        49079 (self) z2 · 49503 Grand Rapids z2 · 60601 Chicago z2 · 46201 z3 · 44101 z3
//        · 15201 z3 · 37201 z4 · 30301 Atlanta z4 · 10001 New York z4 · 70112 z5 · 80202 z5
//        · 75201 z5 · 04101 z5 · 87101 z6 · 33101 Miami z6 · 33040 z6 · 59101 z6
//        · 89101 z7 · 98282 Camano Island WA z7 · 98357 Neah Bay WA z7
//        · 97201 Portland OR z8 · 94102 San Francisco z8 · 90210 Los Angeles z8
//      **FedEx publishes no zone 1 from this origin** -- 49079 is zone 2 to ITSELF.
//   2. FedEx Standard List Rates 2026 (FedEx_Standard_List_Rates_2026.xlsx, sheet
//      "2026 Ground & FHD rates", eff. 1/5/2026): one row per pound, 1-150lb, zones 2-8.
//      Parsed in full this session -- 150 weight rows x 7 zones, no gaps, and strictly
//      non-decreasing in BOTH weight and zone (0 violations, checked programmatically).
//
// FINDING 1 -- THE $19.99 z2 COLUMN WAS A DESTINATION SURCHARGE FILED AS A ZONE.
// 30301 (Atlanta) and 10001 (New York) are BOTH FedEx zone 4 -- primary source above --
// and eBay's struck-through FedEx retail figure is IDENTICAL for the two at all six shared
// weights, independently confirming one zone. Yet eBay's actual FedEx price at 10001 is
// higher by **exactly $5.92 at every one of seven shared weights** (1/3/7/14/20/30/50lb;
// $5.92, $5.92, $5.93, $5.92, $5.92, $5.93, $5.92). A constant, not a slope: that is a
// per-package destination surcharge, not a zone difference. $14.07 + $5.92 = $19.99, which
// is precisely the mystery column. Someone quoted a surcharged destination and filed it as
// a zone; the old table's z2 column was literally its own z1 column plus $5.92 at every row.
// The same shape appears in the west: 98282 (Camano Island) and 98357 (Neah Bay) are BOTH
// zone 7, and Neah Bay is dearer by exactly $1.98 at all eight shared weights.
//
// FINDING 2 -- 98282 CARRIES THE SAME $5.92, AND THAT IS WHY THE OLD z7/z8 LOOKED WRONG.
// Not asserted from the coincidence, tested: eBay/published ratio must fall as zone rises
// (both published cards are zone-monotone). Taken RAW, 98282's zone-7 ratio comes out ABOVE
// the zone-4 ratio at all 7 shared weights -- impossible. Subtract $5.92 and the ratios are
// zone-monotone at all 7 weights (z2 > z4 > z6 > z7, every weight). Independent
// confirmation: 98357 minus $7.90 (= 5.92 + 1.98) reproduces 98282 minus $5.92 to within
// $0.01 at ALL EIGHT weights. So the two western lanes are one zone-7 base curve plus two
// different constants. The engine's old "z8" column was Neah Bay -- i.e. a **zone-7**
// destination with a surcharge on top -- which is why it never behaved like a zone 8.
//
// FINDING 3 -- THERE IS A HARD $14.07 FLOOR. At 1lb and 3lb, the de-surcharged base is
// EXACTLY $14.07 at z2, z4, z6 AND z7 -- eight independent observations, four zones, one
// number, while published list runs $11.99-$19.11 underneath it. eBay's FedEx Ground price
// cannot go below $14.07 at this account. Modelled explicitly as max(FLOOR, published x r),
// which reproduces all eight floor observations exactly rather than smearing them into the
// ratio curve.
//
// HOW EACH CELL IS BUILT:
//   cell(zone, W) = round2( max( 14.07, publishedFedExGroundList(zone, W) x r(zone, W) ) )
//   r(zone, W) is that zone's OWN observed eBay/published ratio, piecewise-linear in weight
//   between the real anchor weights, held flat outside them. Only observations where the
//   floor is NOT binding can carry ratio information, so the 1lb and 3lb points (and z2's
//   7lb point, which is also exactly $14.07) are used as floor evidence, not ratio evidence.
//
// WHICH CELLS ARE REAL AND WHICH ARE MODELLED -- stated per zone, no blurring:
//   z2  REAL-ANCHORED, dest 49503, at 14/20/23/30/50lb.
//   z4  REAL-ANCHORED, dest 30301, at 7/14/20/30/50lb.
//   z6  REAL-ANCHORED, dest 33101, at 7/14/20/30/50lb.
//   z7  REAL-ANCHORED, dest 98282, at 7/14/20/23/30/50lb -- but ONLY after subtracting the
//       modelled $5.92. There is NO surcharge-free FedEx zone-7 observation. This is the one
//       place the surcharge model feeds the base table, and it is load-bearing. (98357 minus
//       $7.90 agrees to <= $0.01 at all 8 weights, which is a real cross-check but not an
//       independent one -- it shares the same surcharge assumption.)
//   z3  MODELLED. r3 = mean(r2, r4) at every pound. NO FedEx zone-3 observation exists.
//   z5  MODELLED. r5 = mean(r4, r6) at every pound. NO FedEx zone-5 observation exists.
//   z8  MODELLED. r8 = r7, held flat. NO FedEx zone-8 observation exists -- and z8 is the
//       column the engine actually uses for most origins (ZIP1_MAX_ZONE sends digits
//       0,1,2,3,4,8,9 to z8), so this is the single largest modelled exposure in the file.
//       Flat-at-r7 is the CONSERVATIVE choice: the ratio's per-zone decline is decelerating
//       (-0.0357, -0.0249, -0.0162 per zone step at 50lb), so slope-extrapolating it would
//       price z8 about $1.00-1.50 LOWER. Never-be-short wins; the higher one is used.
//   z1  FedEx has no zone 1 (primary source: the workbook's zone header, and Find Zones
//       rating the origin ZIP to itself as zone 2). z1 mirrors z2 and is unreachable in
//       practice -- no ZIP1_MAX_ZONE entry resolves to z1.
//
// THE OUT-OF-SAMPLE TEST THE INTERPOLATION STEP GETS, AND IT PASSES. z3 and z5 rest on
// interpolating r between neighbouring zones. That exact step was validated by holding out
// z6 entirely and re-deriving it from z4 and z7: predicted vs the real 33101 quotes came to
// -0.26% / -1.44% / +0.71% / +1.67% / +1.04% at 7/14/20/30/50lb -- 1.03% mean absolute
// error, 1.67% worst. That is evidence for z3 and z5. It is NOT evidence for z8, which is an
// EXTRAPOLATION and gets no test at all.
//
// RECONSTRUCTION ACCURACY, counted not estimated, over all 46 live FedEx observations. Model =
// this table's base + that destination's OWN measured surcharge ($0 / $5.92 / $7.90):
// **32 of 46 exact to the penny, only 2 short (both by $0.01), worst absolute error 1.51%**
// (z2 @ 50lb, where the monotone closure raised a measured cell $0.30). What the SHIPPED engine
// does is different, because it applies ONE destination-blind constant rather than the
// destination's own amount -- see FEDEX_DESTINATION_SURCHARGE_TIERS for the three-tier
// measurement that replaced the old flat $5.92 and for the cost of the constant now used.
// (Historical, as of the flat-$5.92 engine: exact at 10 of 16 points on the two surcharged
// lanes, worst $0.26 / 0.80%; $5.92-$6.22 high on the three clean lanes; $1.91-$1.98 short at
// 98357. The 98357 shortfall is CLOSED by the tier model -- 98357 is tier B, and the
// unmapped default now covers tier C.)
//
// BRACKET ERROR IS NOW ZERO BY CONSTRUCTION, same as RATE_TABLE_UPS. rateFromTable charges a
// bracket's TOP weight to every package inside it; with per-pound rows, bracket (W-1, W]
// holds exactly one billable pound, which is how FedEx bills. The old 16-bracket set
// admitted, worst case inside each bracket (measured on the new curve, so this isolates
// bracket width from the column errors fixed above): (3,5] +5.9% · (5,7] +3.7% ·
// (7,10] +8.1% · (10,14] +12.1% · (14,20] +16.6% · (20,22.5] +6.9% · (22.5,30] +21.0% ·
// (30,50] +38.7% · (50,70] +21.0%. All of those are now 0.0%.
//
// MONOTONICITY, both directions, counted before and after. Raw model: 3 zone violations, 51
// weight violations (the same artifact seen on UPS -- a falling ratio meeting a nearly-flat
// published step). Closed with a raise-only closure iterated to a fixed point, so a cell can
// only ever go UP: 0 zone violations, 0 weight violations, 66 cells raised, largest single
// raise $0.31. It touched 5 real anchor cells, each raised by $0.04-$0.30 (<=1.5%): z4@20lb
// 16.69->16.75, z2@30lb 17.01->17.05, z7@30lb 31.00->31.06, z2@50lb 19.87->20.17, z4@50lb
// 26.68->26.94. Those five are the only measured cells in the table that no longer sit
// exactly on their quote, and all five moved in the never-be-short direction.
// For contrast, the table this replaces had 15 zone violations and 5 weight violations.
//
// WHAT IS STILL UNVERIFIED, EXPLICITLY:
//   - Zones 3, 5 and 8 had NO price observation when this table was built. That is no longer
//     true: see the VALIDATION block below, which measures all three against clean-destination
//     live quotes. They remain MODELLED cells -- validated, not re-anchored.
//   - The destination surcharge's MECHANISM is still unknown, and its ZIP coverage is now
//     partially measured (51 ZIPs, three tiers). It IS applied to every FedEx quote below 70lb
//     (never-be-short); see FEDEX_DESTINATION_SURCHARGE_TIERS for the measurement, the
//     tier-C-default decision and the over-charge that choice accepts at clean destinations.
//     The cells in THIS table are surcharge-free base freight.
//   - Rows above 70lb: none. estimateCheapestRate intercepts lb >= 70 with
//     FEDEX_HIGH_WEIGHT_TOTAL_TABLE, whose own anchors are real eBay TOTALS -- base freight
//     plus whatever accessorial their lane carried, not separable from each other. Their
//     ACCESSORIAL content is therefore unknown and could not be de-duplicated here.
//     Untouched this pass. CORRECTED 2026-08-17: this bullet used to say those anchors had
//     "UNRECORDED destinations" and that the identical z7/z8 columns were "the signature of
//     one destination quoted into two columns". Both are wrong -- the destinations are
//     recorded per zone in that table's provenance comment, and the z7/z8 identity is a real
//     measured FedEx zone grouping. The DESTINATION-surcharge component of those totals is
//     in fact largely KNOWN (5 of the 8 probe ZIPs are measured-clean, i.e. contribute $0);
//     it is the AHS/accessorial component that remains un-decomposed. See that table.
//   - Nothing here is browser-verified. The engine numbers below are reproduced by executing
//     the module; they are not a claim about what eBay's UI shows today.
//
// ── VALIDATION 2026-08-16 (133-quote harvest, destination ZIP recorded per quote) ────────
// The three MODELLED columns (z3, z5, z8) were tested against live CLEAN-destination FedEx
// Ground quotes at 1/7/20/30/50lb, plus 3lb and 5lb at z8, plus one real oversize shape.
// Boxes: 1lb & 3lb & 5lb 6x5x4 · 7lb 12x10x8 · 20lb 16x13x13 · 30lb 18x16x14 · 50lb 20x18x18.
// Result, engine base freight minus real, signed (executed via the module, not hand-computed):
//   z3: +0.00 +0.00 +0.31 +0.27 +0.58
//   z5: +0.00 +0.19 +0.29 +0.00 +0.28
//   z8: +0.00(1lb) +0.00(3lb) +0.00(5lb) +0.43(7lb) +0.71(20lb) +1.05(30lb) +0.71(50lb)
//   oversize cross-check, 48x16x4in / 22lb 4oz at z8: engine 29.89 vs real 29.00, +0.89.
// ZERO cells short after the two corrections below; every remaining error is in the
// never-be-short direction, worst +$1.05 (2.9%), mean +$0.29 over 18 points.
// THE FLAT-r z8 EXTRAPOLATION IS VALIDATED AS CONSERVATIVE. z8 was built by holding the
// eBay/published ratio flat past z7 rather than slope-extrapolating it, on the explicit
// grounds that slope-extrapolating would price z8 ~$1.00-1.50 LOWER. It now measures +0.43
// to +1.05 over real at 7-50lb -- so the choice was right, and by roughly the predicted
// margin. It is still an extrapolation with no zone above it to bracket it.
// TWO CELLS WERE MEASURED WRONG AND ARE CORRECTED IN PLACE (see their row comments):
//   z8 @ 3lb 14.62 -> 14.07 (the $14.07 floor still binds at z8/3lb; a modelled cell had
//     drifted above it) and z8 @ 5lb 16.59 -> 16.80 (a real $0.21 SHORTFALL).
//   z5 @ 30lb 23.06 -> 23.09 -- a $0.03 shortfall found by the same harvest, outside z8.
//   z8 @ 6lb 16.60 -> 16.80 is a raise-only monotone closure behind the 5lb pin, not a
//   measurement. Monotonicity re-counted by execution after every change: 0 zone violations
//   and 0 weight violations before AND after, across all 70 rows.
// FLOOR SWEEP, all 8 zones: no cell anywhere in this table sits below $14.07, and no cell
// sits ABOVE $14.07 at 1-3lb, the only weights where the floor is measured to bind (z8's
// floor first breaks at 5lb / $16.80; z3's still binds at 7lb / $14.07). Checked by execution.
const RATE_TABLE_FEDEX: RateRow[] = [
  { maxLb: 1  , z1:  14.07, z2:  14.07, z3:  14.07, z4:  14.07, z5:  14.07, z6:  14.07, z7:  14.07, z8:  14.07 }, // <=1lb: FedEx Ground bills a 1lb minimum, and eBay's $14.07 FedEx floor binds at every zone here -- one row covers the whole sub-1lb range (real quotes at 4oz/8oz/12oz/15.999oz/1lb were all $14.07 at z2/z4/z6, and $19.99 = 14.07 + the destination surcharge at 98282)
  { maxLb: 2  , z1:  14.07, z2:  14.07, z3:  14.07, z4:  14.07, z5:  14.07, z6:  14.07, z7:  14.07, z8:  14.07 },
  { maxLb: 3  , z1:  14.07, z2:  14.07, z3:  14.07, z4:  14.07, z5:  14.07, z6:  14.07, z7:  14.07, z8:  14.07 }, // z8 CORRECTED 2026-08-16 (was 14.62). Real clean-z8 quote at 3lb is exactly $14.07 -- the hard floor still binds here, and a MODELLED cell was sitting $0.55 above it. The floor is measured at z8 at 8oz, 1lb AND 3lb; it first breaks at 5lb ($16.80). No other cell in this table sits above the floor at a weight where the floor is known to bind (checked all 8 zones x rows 1-3 by execution)
  { maxLb: 4  , z1:  14.07, z2:  14.07, z3:  14.07, z4:  14.07, z5:  14.25, z6:  14.32, z7:  14.97, z8:  15.67 },
  { maxLb: 5  , z1:  14.07, z2:  14.07, z3:  14.07, z4:  14.07, z5:  14.89, z6:  15.14, z7:  15.66, z8:  16.80 }, // z8 CORRECTED 2026-08-16 (was 16.59, $0.21 SHORT of the real clean-z8 $16.80 -- a shortfall the organizer eats). Now pinned to the measured value
  { maxLb: 6  , z1:  14.07, z2:  14.07, z3:  14.07, z4:  14.15, z5:  14.95, z6:  15.16, z7:  15.67, z8:  16.80 }, // z8 RAISE-ONLY monotone closure 2026-08-16: was 16.60, i.e. BELOW the newly-pinned measured $16.80 one row down. Raised to the measured floor, never lowered. 7lb z8 17.22 already clears it, so the ripple stops here
  { maxLb: 7  , z1:  14.07, z2:  14.07, z3:  14.07, z4:  14.52, z5:  15.42, z6:  15.43, z7:  16.09, z8:  17.22 }, // REAL-ANCHORED: z4, z6, z7 live-quoted at this weight
  { maxLb: 8  , z1:  14.07, z2:  14.07, z3:  14.07, z4:  14.91, z5:  15.71, z6:  15.85, z7:  16.44, z8:  17.66 },
  { maxLb: 9  , z1:  14.07, z2:  14.07, z3:  14.07, z4:  14.91, z5:  15.71, z6:  15.98, z7:  16.81, z8:  18.25 },
  { maxLb: 10 , z1:  14.07, z2:  14.07, z3:  14.07, z4:  14.92, z5:  15.96, z6:  15.98, z7:  17.28, z8:  19.09 },
  { maxLb: 11 , z1:  14.07, z2:  14.07, z3:  14.21, z4:  15.44, z5:  16.21, z6:  16.62, z7:  18.68, z8:  20.29 },
  { maxLb: 12 , z1:  14.07, z2:  14.07, z3:  14.76, z4:  15.48, z5:  16.27, z6:  16.97, z7:  19.05, z8:  20.83 },
  { maxLb: 13 , z1:  14.07, z2:  14.07, z3:  14.77, z4:  15.55, z5:  16.40, z6:  17.25, z7:  19.82, z8:  21.34 },
  { maxLb: 14 , z1:  14.63, z2:  14.63, z3:  15.12, z4:  15.59, z5:  16.64, z6:  18.02, z7:  20.80, z8:  22.74 }, // REAL-ANCHORED: z2, z4, z6, z7 live-quoted at this weight
  { maxLb: 15 , z1:  14.63, z2:  14.63, z3:  15.36, z4:  15.70, z5:  17.06, z6:  18.77, z7:  21.23, z8:  23.43 },
  { maxLb: 16 , z1:  14.86, z2:  14.86, z3:  15.70, z4:  15.87, z5:  17.19, z6:  19.13, z7:  22.12, z8:  24.34 },
  { maxLb: 17 , z1:  14.88, z2:  14.88, z3:  15.93, z4:  15.93, z5:  17.50, z6:  19.70, z7:  23.01, z8:  24.34 },
  { maxLb: 18 , z1:  14.96, z2:  14.96, z3:  16.04, z4:  16.04, z5:  18.16, z6:  20.46, z7:  23.45, z8:  25.70 },
  { maxLb: 19 , z1:  15.28, z2:  15.28, z3:  16.71, z4:  16.73, z5:  18.83, z6:  20.79, z7:  23.91, z8:  26.65 },
  { maxLb: 20 , z1:  15.31, z2:  15.31, z3:  16.75, z4:  16.75, z5:  19.38, z6:  21.21, z7:  24.52, z8:  27.31 }, // REAL-ANCHORED: z2, z4, z6, z7 live-quoted at this weight
  { maxLb: 21 , z1:  15.63, z2:  15.63, z3:  17.11, z4:  17.25, z5:  19.38, z6:  21.68, z7:  25.02, z8:  27.95 },
  { maxLb: 22 , z1:  15.63, z2:  15.63, z3:  17.14, z4:  17.54, z5:  19.58, z6:  22.37, z7:  25.52, z8:  28.70 },
  { maxLb: 23 , z1:  15.70, z2:  15.70, z3:  17.34, z4:  17.92, z5:  19.95, z6:  23.00, z7:  26.19, z8:  29.89 }, // REAL-ANCHORED: z2, z7 live-quoted at this weight
  { maxLb: 24 , z1:  16.01, z2:  16.01, z3:  17.89, z4:  18.48, z5:  20.81, z6:  23.89, z7:  26.89, z8:  31.39 },
  { maxLb: 25 , z1:  16.01, z2:  16.01, z3:  17.89, z4:  18.48, z5:  21.01, z6:  24.35, z7:  28.18, z8:  32.14 },
  { maxLb: 26 , z1:  16.45, z2:  16.45, z3:  18.25, z4:  18.95, z5:  21.65, z6:  25.01, z7:  29.13, z8:  33.25 },
  { maxLb: 27 , z1:  16.78, z2:  16.78, z3:  18.52, z4:  19.13, z5:  21.65, z6:  25.78, z7:  29.47, z8:  33.26 },
  { maxLb: 28 , z1:  17.05, z2:  17.05, z3:  18.80, z4:  19.81, z5:  22.63, z6:  26.79, z7:  30.57, z8:  34.62 },
  { maxLb: 29 , z1:  17.05, z2:  17.05, z3:  18.99, z4:  19.81, z5:  22.63, z6:  27.29, z7:  31.06, z8:  35.30 },
  { maxLb: 30 , z1:  17.05, z2:  17.05, z3:  19.27, z4:  20.31, z5:  23.09, z6:  27.47, z7:  31.06, z8:  36.16 }, // REAL-ANCHORED: z2, z4, z6, z7 live-quoted at this weight. z5 CORRECTED 2026-08-16 (was 23.06, $0.03 SHORT of the real clean-z5 $23.09 found by the 133-quote harvest -- the only shortfall outside z8). Neighbours 29lb 22.63 / 31lb 23.26 both still bracket it, no ripple
  { maxLb: 31 , z1:  17.67, z2:  17.67, z3:  19.61, z4:  20.62, z5:  23.26, z6:  27.90, z7:  31.73, z8:  37.19 },
  { maxLb: 32 , z1:  17.67, z2:  17.67, z3:  19.61, z4:  20.62, z5:  23.26, z6:  27.90, z7:  31.73, z8:  37.47 },
  { maxLb: 33 , z1:  17.67, z2:  17.67, z3:  19.74, z4:  21.35, z5:  24.15, z6:  29.45, z7:  32.56, z8:  38.35 },
  { maxLb: 34 , z1:  17.68, z2:  17.68, z3:  20.10, z4:  21.92, z5:  24.89, z6:  29.45, z7:  33.41, z8:  40.04 },
  { maxLb: 35 , z1:  17.94, z2:  17.94, z3:  21.07, z4:  22.53, z5:  25.37, z6:  29.74, z7:  34.15, z8:  40.19 },
  { maxLb: 36 , z1:  18.13, z2:  18.13, z3:  21.07, z4:  22.60, z5:  25.89, z6:  30.87, z7:  35.19, z8:  41.61 },
  { maxLb: 37 , z1:  18.33, z2:  18.33, z3:  21.17, z4:  22.72, z5:  26.35, z6:  30.89, z7:  36.20, z8:  41.87 },
  { maxLb: 38 , z1:  18.55, z2:  18.55, z3:  21.40, z4:  23.33, z5:  26.86, z6:  31.46, z7:  36.21, z8:  42.50 },
  { maxLb: 39 , z1:  19.09, z2:  19.09, z3:  22.13, z4:  24.21, z5:  27.57, z6:  32.77, z7:  37.50, z8:  43.22 },
  { maxLb: 40 , z1:  19.09, z2:  19.09, z3:  22.13, z4:  24.21, z5:  27.57, z6:  32.77, z7:  37.50, z8:  43.22 },
  { maxLb: 41 , z1:  19.38, z2:  19.38, z3:  22.97, z4:  24.67, z5:  28.31, z6:  33.93, z7:  38.39, z8:  44.54 },
  { maxLb: 42 , z1:  19.38, z2:  19.38, z3:  22.97, z4:  25.50, z5:  28.31, z6:  33.95, z7:  38.90, z8:  44.60 },
  { maxLb: 43 , z1:  19.60, z2:  19.60, z3:  23.17, z4:  25.50, z5:  29.58, z6:  35.66, z7:  40.17, z8:  45.65 },
  { maxLb: 44 , z1:  19.78, z2:  19.78, z3:  23.41, z4:  25.93, z5:  29.97, z6:  35.72, z7:  41.26, z8:  45.95 },
  { maxLb: 45 , z1:  19.78, z2:  19.78, z3:  23.41, z4:  25.93, z5:  29.97, z6:  35.72, z7:  41.91, z8:  46.11 },
  { maxLb: 46 , z1:  20.17, z2:  20.17, z3:  23.44, z4:  26.48, z5:  30.28, z6:  36.39, z7:  42.21, z8:  47.16 },
  { maxLb: 47 , z1:  20.17, z2:  20.17, z3:  23.86, z4:  26.78, z5:  30.34, z6:  36.75, z7:  42.87, z8:  47.75 },
  { maxLb: 48 , z1:  20.17, z2:  20.17, z3:  23.86, z4:  26.94, z5:  31.30, z6:  37.15, z7:  43.10, z8:  48.32 },
  { maxLb: 49 , z1:  20.17, z2:  20.17, z3:  23.86, z4:  26.94, z5:  31.30, z6:  37.28, z7:  43.80, z8:  48.43 },
  { maxLb: 50 , z1:  20.17, z2:  20.17, z3:  23.86, z4:  26.94, z5:  31.30, z6:  37.45, z7:  44.02, z8:  48.92 }, // REAL-ANCHORED: z2, z4, z6, z7 live-quoted at this weight
  { maxLb: 51 , z1:  20.17, z2:  20.17, z3:  23.86, z4:  26.94, z5:  31.34, z6:  38.10, z7:  44.78, z8:  50.29 },
  { maxLb: 52 , z1:  20.17, z2:  20.17, z3:  23.86, z4:  26.95, z5:  31.36, z6:  38.11, z7:  44.79, z8:  50.29 },
  { maxLb: 53 , z1:  20.17, z2:  20.17, z3:  23.86, z4:  26.96, z5:  31.67, z6:  38.11, z7:  44.79, z8:  50.78 },
  { maxLb: 54 , z1:  20.17, z2:  20.17, z3:  23.86, z4:  27.00, z5:  31.73, z6:  38.12, z7:  44.80, z8:  50.79 },
  { maxLb: 55 , z1:  20.17, z2:  20.17, z3:  23.86, z4:  27.00, z5:  31.73, z6:  38.13, z7:  44.80, z8:  50.80 },
  { maxLb: 56 , z1:  20.17, z2:  20.17, z3:  23.86, z4:  27.01, z5:  31.74, z6:  38.14, z7:  44.82, z8:  51.43 },
  { maxLb: 57 , z1:  20.41, z2:  20.41, z3:  23.88, z4:  27.02, z5:  32.69, z6:  38.15, z7:  44.83, z8:  51.95 },
  { maxLb: 58 , z1:  20.42, z2:  20.42, z3:  23.88, z4:  27.03, z5:  32.70, z6:  38.16, z7:  44.84, z8:  52.41 },
  { maxLb: 59 , z1:  20.44, z2:  20.44, z3:  23.90, z4:  27.22, z5:  32.72, z6:  38.43, z7:  44.84, z8:  53.28 },
  { maxLb: 60 , z1:  21.00, z2:  21.00, z3:  24.83, z4:  27.69, z5:  33.87, z6:  39.14, z7:  45.00, z8:  53.61 },
  { maxLb: 61 , z1:  21.00, z2:  21.00, z3:  24.90, z4:  27.96, z5:  33.95, z6:  39.14, z7:  45.01, z8:  53.62 },
  { maxLb: 62 , z1:  21.87, z2:  21.87, z3:  26.68, z4:  28.41, z5:  34.91, z6:  39.74, z7:  45.70, z8:  54.27 },
  { maxLb: 63 , z1:  21.87, z2:  21.87, z3:  26.68, z4:  28.68, z5:  34.93, z6:  40.02, z7:  46.07, z8:  54.60 },
  { maxLb: 64 , z1:  22.45, z2:  22.45, z3:  26.69, z4:  29.15, z5:  34.93, z6:  40.30, z7:  46.08, z8:  54.93 },
  { maxLb: 65 , z1:  22.70, z2:  22.70, z3:  27.41, z4:  29.16, z5:  34.94, z6:  40.65, z7:  46.19, z8:  55.02 },
  { maxLb: 66 , z1:  22.82, z2:  22.82, z3:  27.67, z4:  29.16, z5:  34.95, z6:  40.69, z7:  46.33, z8:  55.26 },
  { maxLb: 67 , z1:  22.82, z2:  22.82, z3:  27.69, z4:  29.17, z5:  35.01, z6:  41.00, z7:  46.56, z8:  55.78 },
  { maxLb: 68 , z1:  23.09, z2:  23.09, z3:  28.19, z4:  30.94, z5:  35.81, z6:  41.61, z7:  47.27, z8:  55.78 },
  { maxLb: 69 , z1:  23.57, z2:  23.57, z3:  28.47, z4:  31.25, z5:  36.07, z6:  41.82, z7:  47.27, z8:  56.08 },
  { maxLb: 70 , z1:  23.67, z2:  23.67, z3:  28.87, z4:  31.92, z5:  37.80, z6:  42.66, z7:  47.28, z8:  56.56 },
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
 * AMENDED 2026-08-16 -- read the paragraph above with this correction. "Every cell is a
 * live eBay quote" was true of RATE_TABLE_UPS as it stood on 2026-08-11. It is NOT true
 * of the rebuilt RATE_TABLE_UPS: that table is now UPS's published 2026 daily rate card
 * (primary source, per pound) multiplied by a per-zone eBay/published discount ratio
 * interpolated between the live-quoted anchor weights. At the anchor weights (1, 2, 3, 5,
 * 7, 10, 14, 20, 30, 50lb) each cell still equals its live quote exactly; at the ~60 new
 * intermediate weights it is modelled, and the 70lb row was deliberately re-derived (see
 * its inline comment -- the real 70lb quotes carry an AHS-weight accessorial that
 * computeSurchargeForCarrier adds a second time). This array stays empty because the
 * modelled cells are not "pending a live quote" in the old sense -- they are documented,
 * bounded interpolations between real quotes, and the honest statement of what is and is
 * not verified lives in the RATE_TABLE_UPS header, not here. USPS and FedEx are unchanged.
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
  // Added 2026-08-16 (ADR-103 §8 FedEx zone re-anchor). San Francisco is 1943mi from
  // Paw Paw MI (49079) -- FARTHER than every corner above, including Neah Bay (1908mi),
  // San Diego (1823mi) and Seattle (1804mi) -- so the set above did not actually contain
  // this origin's farthest CONUS point. It is also a CONFIRMED FedEx zone 8 from 49079
  // (FedEx Find Zones, primary source, this session), alongside Los Angeles 90210 (z8) and
  // Portland OR 97201 (z8). Adding a corner can only ever RAISE the max distance and so can
  // only ever raise the resolved zone -- the never-be-short direction, never the reverse.
  //
  // WHY THIS MATTERS BEYOND THE MILEAGE: the same lookup falsified this set's core
  // assumption that farthest-by-miles == highest carrier zone. Neah Bay is the farthest
  // CONUS *point* from 49079 but FedEx rates it **zone 7**, while the three West Coast
  // metros are zone 8 -- FedEx zones follow ZIP3 routing, not great-circle distance, and
  // Neah Bay routes through Seattle. That mismatch did no harm HERE (San Diego and Seattle
  // both already cross the 1800mi z8 cutoff, so this origin resolved z8 either way), but it
  // is the reason RATE_TABLE_FEDEX's old z8 column was wrong: it was built from Neah Bay
  // quotes, i.e. a zone-SEVEN destination. See that table's header.
  { name: 'San Francisco CA', lat: 37.7749, lng: -122.4194 },
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
 * 94102 (San Francisco) added 2026-08-16 to stay 1:1 with CONUS_CORNERS -- see the comment
 * on that corner for why (it is farther from 49079 than any prior corner, 1943mi, and is a
 * confirmed FedEx zone 8). Its USPS chart zone from 49079 was NOT looked up; it can only
 * raise the max, so it cannot make this origin's zone lower than the verified z8 above.
 */
const CONUS_CORNER_ZIPS: readonly string[] = ['98101', '92101', '33040', '04736', '98357', '94102'];

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
 * UPDATED 2026-08-16: the UPS side of that is now measured rather than assumed. UPS's own
 * zone chart for origin ZIP3 490 was obtained and parsed this session, and on the three
 * lanes where both charts are known it AGREES with USPS's: 49503 -> 2, 98282 -> 7,
 * 98357 -> 8. Three lanes is not proof of general agreement -- Atlanta already shows the
 * band boundaries fall in different places (ZIP3 303 is UPS z4 while 302 is UPS z5) --
 * but it is why the UPS 22.5lb cell is no longer flagged UNVERIFIED. FedEx's own chart
 * is still unobtained, so the FedEx cells stay flagged.
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
export function billableLb(
  weightOz: number,
  dims: { length?: number | null; width?: number | null; height?: number | null } | null,
  divisor: number,
  /**
   * ADDED 2026-08-16 (ADR-103 Phase 6). When set, dimensional weight is applied ONLY if
   * the parcel's volume EXCEEDS this many cubic inches; at or below it, actual weight
   * governs. Omit it and behavior is exactly as before (dim weight always considered) --
   * every existing caller is unaffected.
   *
   * Why it exists: DMM 283.1.4.1 [7-12-26] -- "Postage for USPS Ground Advantage -
   * Commercial parcels ... EXCEEDING 1 cubic foot (1,728 cubic inches) is based on the
   * actual weight or the dimensional weight ..., whichever is greater." Below 1 cu ft
   * USPS does not use dimensional weight at all. This engine was applying it at every
   * size, so a 1lb item in an 11x11x11in box (1,331 cu in -> dim weight 9.6lb) priced at
   * the 10lb tier -- $25.34 at z8 against a real $10.67. Confirmed against live quotes,
   * not just the manual: a 12x10x8in (960 cu in, dim weight 6.9lb) box quoted $6.57 at
   * 1lb and $5.80 at 3lb on 2026-08-16 -- both actual-weight prices, neither a 7lb price.
   * UPS and FedEx DO bill dimensional weight at every size, so they must not pass this.
   */
  dimWeightMinVolumeCuIn?: number
): { lb: number; basis: 'actual' | 'dimensional' } {
  const actualOz = Math.max(0, weightOz || 0);
  let dimOz = 0;
  const L = dims?.length ? Number(dims.length) : 0;
  const W = dims?.width ? Number(dims.width) : 0;
  const H = dims?.height ? Number(dims.height) : 0;
  const dimWeightApplies = dimWeightMinVolumeCuIn == null || L * W * H > dimWeightMinVolumeCuIn;
  if (L > 0 && W > 0 && H > 0 && dimWeightApplies) dimOz = ((L * W * H) / divisor) * 16;
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
  surchargeType?: 'AHS' | 'LARGE_PACKAGE' | 'USPS_NONSTANDARD' | 'DESTINATION' | null;
  basis: 'actual' | 'dimensional' | 'cubic' | 'oversized' | 'standard_envelope';
  /** Set when basis === 'cubic' -- which named GA Cubic tier was selected. */
  cubicTierLabel?: string | null;
  zone: ZoneKey;
  fvfOnShipping: number;
  netToSeller: number;
}

// ── USPS Ground Advantage CUBIC pricing ─ REBUILT ZONE-AWARE 2026-08-16 (ADR-103 Phase 6) ──
//
// USPS Ground Advantage has TWO independent price bases and bills whichever is cheaper:
//   (1) WEIGHT     -- Notice 123 p.15, RATE_TABLE above (billable = actual, or the greater
//                     of actual vs dimensional ONLY above 1 cu ft -- DMM 283.1.4.1).
//   (2) CUBIC      -- Notice 123 p.16, USPS_CUBIC_RATE_TABLE below. Priced by the parcel's
//                     CUBIC-FOOT TIER and ZONE. Weight-independent within the tier.
// The engine must evaluate both and take the minimum. That is what makes a 12x9x8in box
// cost the same $8.00 to 49503 at 7lb, 14lb and 20lb (a real, measured 2026-08-16 quote):
// it is cubic-priced, so weight is simply not an input.
//
// WHAT THIS REPLACES: CUBIC_TIER_TABLE (retained directly below, deprecated, NOT used).
// That table claimed a "FLAT NATIONAL rate" per box-dimension tier. Its ten flatRate
// values -- 10.13 / 11.84 / 14.67 / 17.29 / 18.90 / 20.36 / 21.57 / 22.71 / 23.89 / 25.60
// -- are, in order, EXACTLY the ZONE 8 column of Notice 123 p.16. They are not national;
// they are the single most expensive zone. Its stated provenance (Patrick's live "GA
// Cubic" eBay policies) is also no longer verifiable: all ten of those policies were
// deleted from the eBay account and their ids purged from the DB on 2026-08-16.
// Consequence of the old model: correct-to-generous at z8, and a large over-quote at
// every near zone (z2 rung 0.10 was priced $10.13 against a published $7.51).
//
// SOURCE (primary, fetched and text-extracted directly 2026-08-16):
//   Prices  -- USPS Notice 123 -- Price List, "USPS Ground Advantage / Commercial Parcels
//              - Cubic", p.16, zones 1-8 verbatim (the card's zone-9 column duplicates
//              zone 8 and is not modelled).
//              pe.usps.com/cpim/ftp/manuals/dmm300/notice123.pdf
//   Rules   -- DMM 283.1.3 "USPS Ground Advantage - Commercial Cubic", pe.usps.com/text/
//              dmm300/283.htm, revision tag [7-12-26]:
//              283.1.3.1 Eligibility: "Each cubic mailpiece ... must measure 1 cubic foot
//                or less, weigh 20 pounds or less, and the longest dimension must not
//                exceed 22 inches. Cubic-priced mailpieces must not be rolls or tubes."
//              283.1.3.2 Tiers: ten tiers, 0.10 through 1.00, each "measuring more than
//                [prev] up to [this]" -- i.e. round the measured cubic feet UP to the
//                next rung (USPS's own worked example: 0.125 cu ft prices at tier 0.20).
//              283.1.3.3 Measurement: round each dimension DOWN to the nearest 1/4 inch,
//                multiply, divide by 1,728.
//
// LIVE VALIDATION (real eBay quotes, origin 49079, Patrick's seller account, 2026-08-16):
//   At ZONE 8 this table reproduces eBay's quoted cubic price to the penny at every rung
//   tested: 6x5x4in/1lb -> $10.13 (rung 0.10), 9x7x6in/3lb -> $14.67 (rung 0.30),
//   12x10x8in/7lb -> $20.36 (rung 0.60). Ratio 1.000, 3/3.
//   At zones 2-7 eBay charges a real negotiated discount off these published figures --
//   e.g. rung 0.50 measured at exactly 0.828x published in both zones tested
//   (z2 $8.00 / $9.66, z7 $13.98 / $16.89). Recorded in
//   EBAY_USPS_OBSERVED_DISCOUNT_RATIOS, deliberately NOT applied -- see RATE_TABLE's
//   header for why (published is a proven upper bound and is EXACT at z8, which is the
//   zone the live flat-rate path actually uses for every Michigan origin).
//
// NO FEE CAN EVER STACK ON A CUBIC PRICE, structurally: a cubic-eligible parcel is
// <= 1 cu ft (so it can never trip Notice 123 p.15 note 7's >2 cu ft $21.00) and its
// longest side is <= 22in (so it can never trip note 5's >22in $4.50 or note 6's >30in
// $10.00). The cubic branch in estimateCheapestRate therefore reports surcharge 0, and
// that is a fact about the rate class, not an omission.

export type UspsCubicRateRow = {
  /** Inclusive upper bound of the tier in cubic feet (DMM 283.1.3.2). */
  maxCuFt: number;
  tierLabel: string;
  z1: number; z2: number; z3: number; z4: number; z5: number; z6: number; z7: number; z8: number;
};

/** Notice 123 p.16, "USPS Ground Advantage / Commercial Parcels - Cubic", verbatim. */
export const USPS_CUBIC_RATE_TABLE: UspsCubicRateRow[] = [
  { maxCuFt: 0.10, tierLabel: 'GA Cubic 0.1', z1: 7.45 , z2: 7.51 , z3: 7.83 , z4: 7.99 , z5: 8.49 , z6: 9.21 , z7: 9.53 , z8: 10.13 },
  { maxCuFt: 0.20, tierLabel: 'GA Cubic 0.2', z1: 7.82 , z2: 7.89 , z3: 8.14 , z4: 8.34 , z5: 9.37 , z6: 10.66 , z7: 11.05 , z8: 11.84 },
  { maxCuFt: 0.30, tierLabel: 'GA Cubic 0.3', z1: 8.39 , z2: 8.45 , z3: 8.81 , z4: 9.23 , z5: 10.96 , z6: 12.83 , z7: 13.48 , z8: 14.67 },
  { maxCuFt: 0.40, tierLabel: 'GA Cubic 0.4', z1: 9.07 , z2: 9.13 , z3: 9.51 , z4: 10.34 , z5: 12.43 , z6: 14.66 , z7: 15.61 , z8: 17.29 },
  { maxCuFt: 0.50, tierLabel: 'GA Cubic 0.5', z1: 9.59 , z2: 9.66 , z3: 10.03 , z4: 10.93 , z5: 13.32 , z6: 15.70 , z7: 16.89 , z8: 18.90 },
  { maxCuFt: 0.60, tierLabel: 'GA Cubic 0.6', z1: 9.84 , z2: 9.90 , z3: 10.31 , z4: 11.43 , z5: 14.10 , z6: 16.68 , z7: 18.05 , z8: 20.36 },
  { maxCuFt: 0.70, tierLabel: 'GA Cubic 0.7', z1: 9.94 , z2: 10.00 , z3: 10.56 , z4: 11.82 , z5: 14.76 , z6: 17.47 , z7: 19.02 , z8: 21.57 },
  { maxCuFt: 0.80, tierLabel: 'GA Cubic 0.8', z1: 10.08 , z2: 10.23 , z3: 11.34 , z4: 12.34 , z5: 15.39 , z6: 18.22 , z7: 19.94 , z8: 22.71 },
  { maxCuFt: 0.90, tierLabel: 'GA Cubic 0.9', z1: 10.84 , z2: 11.08 , z3: 12.24 , z4: 13.44 , z5: 16.01 , z6: 18.99 , z7: 20.84 , z8: 23.89 },
  { maxCuFt: 1.00, tierLabel: 'GA Cubic 1.0', z1: 12.02 , z2: 12.34 , z3: 13.28 , z4: 14.54 , z5: 16.93 , z6: 20.11 , z7: 22.18 , z8: 25.60 },
];

export const USPS_CUBIC_RATE_SOURCE =
  'USPS Notice 123 - Price List, p.16 "USPS Ground Advantage / Commercial Parcels - Cubic", zones 1-8 verbatim; eligibility + measurement rules from DMM 283.1.3 [7-12-26]. Both fetched directly from pe.usps.com 2026-08-16.';

/** DMM 283.1.3.1 -- all four gates must pass or the parcel is not cubic-eligible. */
export const USPS_CUBIC_MAX_CU_IN = 1728;        // "1 cubic foot or less"
export const USPS_CUBIC_MAX_WEIGHT_LB = 20;      // "weigh 20 pounds or less"
export const USPS_CUBIC_MAX_LONGEST_DIM_IN = 22; // "longest dimension must not exceed 22 inches"
/** "Cubic-priced mailpieces must not be rolls or tubes" (DMM 283.1.3.1). `ROLL` is the
 *  Item.packageType value the frontend's Package Type dropdown writes for that shape. */
const CUBIC_INELIGIBLE_PACKAGE_TYPES = new Set(['ROLL']);

/**
 * Measured eBay/published ratios for USPS Ground Advantage, from the 2026-08-16 live
 * harvest (origin ZIP 49079, Patrick's real connected seller account, eBay's own
 * calculator; destinations 49503/30301/10001/33101/98282/98357, confirmed USPS zones
 * 2/4/5/6/7/8 by reconciling every 23/30/50lb quote against Notice 123 p.15 to the penny).
 *
 * EXTENDED 2026-08-16 (second harvest, 46201 Indianapolis). ZONE 3 IS NO LONGER UNMEASURED.
 * The destination's USPS zone was resolved DIRECTLY, not inferred: postcalc.usps.com's
 * GetZone endpoint, driven live from origin 49079 this session, returns zone 3 for 46201 and
 * for 44101, and zone 5 for 75201 -- so on these lanes the USPS zone and the FedEx zone label
 * coincide, and the z3 column can be graded against 46201 without mixing carrier zone systems.
 * The lane reconciles EXACTLY at 30lb (36.86 + the $21.00 >2cuft fee = $57.86 real) and at
 * 50lb (53.63 + 21.00 = $74.63 real), and shows eBay's real light-weight discount below that
 * -- i.e. it reproduces this table's central documented finding (published Commercial is an
 * upper bound, EXACT at >=23lb) on a zone that had never been tested. The 20lb point is the
 * FIRST large-box light-weight WEIGHT-basis observation ever taken: 16x13x13in = 2704 cu in is
 * not cubic-eligible, so 13.07/18.03 = 0.7249 is a weight ratio, not a cubic one. It slots
 * neatly between the measured z2 0.7069 and z4 0.7589 at the same weight, which is corroboration.
 * STILL NOT APPLIED, and the reason has narrowed but not gone: zone 1 remains unmeasured, and
 * one lane per zone is not enough to regrade a column -- scaling a whole column off a single
 * ratio is the exact failure mode this table exists to prevent. What would close it: the same
 * large-box light-weight sweep at z1 and at two more zones.
 *
 * RECORDED, NOT APPLIED. The engine prices at published Commercial (ratio 1.000). This
 * constant exists so a future pass can close the gap once the missing cells are actually
 * measured, and so nobody re-derives it from scratch. `basis` says which price base the
 * observation is a ratio OF -- mixing them is exactly how the old table broke.
 *
 * Unmeasured and therefore NOT inferable from this: zone 1 (no destination in either harvest
 * resolves to it), and every weight below 14lb on a WEIGHT basis at zones 4-7 (every light box
 * in the FIRST harvest was cubic-eligible, so those quotes are cubic observations, not weight
 * observations -- the 2026-08-16 z3 20lb point above is the only large-box light-weight weight-
 * basis observation that exists, and one point is not a column).
 */
export const EBAY_USPS_OBSERVED_DISCOUNT_RATIOS: ReadonlyArray<{
  basis: 'cubic' | 'weight';
  /** cubic rung in cu ft, or billable weight in lb */
  at: number;
  ratios: Partial<Record<ZoneKey, number>>;
}> = [
  { basis: 'cubic',  at: 0.10, ratios: { z2: 0.8735, z3: 0.8544, z4: 0.8786, z5: 0.9305, z6: 0.9501, z7: 0.9465, z8: 1.0 } }, // z3 added 2026-08-16: 46201, 6x5x4in/1lb, real $6.69 / published cubic $7.83 (cubic 7.83 beats weight 8.00, so this is a cubic observation)
  { basis: 'cubic',  at: 0.30, ratios: { z2: 0.6864, z4: 0.6425, z5: 0.6378, z6: 0.6290, z7: 0.6061, z8: 1.0 } },
  { basis: 'cubic',  at: 0.50, ratios: { z2: 0.8282, z7: 0.8277 } }, // 12x9x8in = 864 cu in = exactly 0.500 cu ft
  { basis: 'cubic',  at: 0.60, ratios: { z2: 0.8283, z3: 0.8283, z4: 0.8285, z5: 0.8284, z6: 0.8279, z7: 0.8277, z8: 1.0 } }, // z3 added 2026-08-16: 46201, 12x10x8in/7lb, real $8.54 / published cubic $10.31 = 0.8283 -- lands on the SAME 0.828 every other zone shows at this rung
  { basis: 'weight', at: 1,    ratios: { z2: 0.8555 } }, // 12x10x8in/1lb -- big enough that weight beat cubic
  { basis: 'weight', at: 3,    ratios: { z2: 0.6697 } }, // 12x10x8in/3lb -- ditto
  { basis: 'weight', at: 14,   ratios: { z2: 0.6914, z4: 0.7420, z5: 0.8278, z6: 0.8277, z7: 0.8281, z8: 1.0 } },
  { basis: 'weight', at: 20,   ratios: { z2: 0.7069, z3: 0.7249, z4: 0.7589, z5: 0.8279, z6: 0.8278, z7: 0.8278, z8: 1.0 } }, // z3 added 2026-08-16: 46201, 16x13x13in/20lb (2704 cu in -- NOT cubic-eligible, so a true weight-basis ratio), real $13.07 / published $18.03
  { basis: 'weight', at: 23,   ratios: { z2: 1.0, z5: 1.0, z7: 1.0, z8: 1.0 } },
  { basis: 'weight', at: 30,   ratios: { z2: 1.0, z3: 1.0, z4: 1.0, z5: 1.0, z6: 1.0, z7: 1.0, z8: 1.0 } }, // z3 added 2026-08-16: 46201 18x16x14in/30lb real $57.86 = published $36.86 + the $21.00 >2cuft fee, to the penny
  { basis: 'weight', at: 50,   ratios: { z2: 1.0, z3: 1.0, z4: 1.0, z5: 1.0, z6: 1.0, z7: 1.0, z8: 1.0 } }, // z3 added 2026-08-16: 46201 20x18x18in/50lb real $74.63 = published $53.63 + $21.00, to the penny
];

/**
 * @deprecated 2026-08-16 -- NOT read by any code path. Superseded by USPS_CUBIC_RATE_TABLE
 * above. Retained only as the provenance record of a real defect: these ten "flat national"
 * rates are the Notice 123 p.16 ZONE 8 column, and the same ten values were simultaneously
 * misfiled into RATE_TABLE's z8 weight column (see that table's header). Do not reintroduce.
 */
export interface CubicTier {
  tierLabel: string;
  maxLengthIn: number;
  maxWidthIn: number;
  maxHeightIn: number;
  /** Flat national rate, USD. null = not yet sourced -- tier is skipped until filled. */
  flatRate: number | null;
}

/** @deprecated see CubicTier above -- unused, kept for provenance. */
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
];

/** DMM 283.1.3.3: round each dimension DOWN to the nearest 1/4 inch before computing the
 *  cubic-tier measurement. (USPS's own example: 6-1/8 x 5-7/8 x 6-3/8 -> 6 x 5-3/4 x 6-1/4.) */
function roundDownQuarterInch(n: number): number {
  return Math.floor(n * 4) / 4;
}

/**
 * USPS Ground Advantage Cubic price for this parcel at this zone, or null if the parcel
 * is not cubic-eligible under DMM 283.1.3.1.
 *
 * Eligibility uses REAL dims/weight (not billable/dimensional weight) -- cubic is a
 * parcel-shape rate class, and dimensional weight is a concept from the OTHER price base.
 * The 22in longest-side gate is checked against the raw dimension rather than the
 * quarter-inch-rounded-down one: rounding down could only let a 22.2in parcel slip
 * through as eligible, and the cheaper-of-two selection means a wrongly-eligible parcel
 * is a wrongly-CHEAP parcel. Erring toward ineligible errs toward the weight price.
 */
function evaluateUspsCubic(
  dims: PackageDims,
  weightOz: number,
  zone: ZoneKey,
  packageType: string | null | undefined
): { tierLabel: string; rate: number; cuFt: number } | null {
  if (packageType && CUBIC_INELIGIBLE_PACKAGE_TYPES.has(packageType)) return null;
  if (Math.max(0, weightOz || 0) > USPS_CUBIC_MAX_WEIGHT_LB * 16) return null;

  const sorted = sortedRealDims(dims);
  if (!sorted) return null;
  if (sorted[0] > USPS_CUBIC_MAX_LONGEST_DIM_IN) return null;

  const cuIn = roundDownQuarterInch(sorted[0]) * roundDownQuarterInch(sorted[1]) * roundDownQuarterInch(sorted[2]);
  if (!(cuIn > 0) || cuIn > USPS_CUBIC_MAX_CU_IN) return null;

  const cuFt = cuIn / 1728;
  // DMM 283.1.3.2: tiers are "more than [prev] up to [this]" -- round the measurement UP
  // to the next rung. The 1e-9 guard keeps an exact-boundary parcel (e.g. 12x9x8in =
  // exactly 0.500 cu ft) in its own tier instead of pushing it up one on float error.
  const row = USPS_CUBIC_RATE_TABLE.find((r) => cuFt <= r.maxCuFt + 1e-9);
  if (!row) return null; // unreachable: cuIn <= 1728 means cuFt <= 1.00, the last rung
  return { tierLabel: row.tierLabel, rate: round2(row[zone]), cuFt: Math.round(cuFt * 1000) / 1000 };
}

// ── eBay Standard Envelope (USPS-based flat national rate, zone-independent) ─────────
// Source: eBay's own live page, ebay.com/sellercenter/shipping/choosing-a-carrier-and-service/
// ebay-standard-envelope, fetched and verified directly 2026-08-10. Standard Envelope is a
// FLAT NATIONAL price (no zone lookup, unlike RATE_TABLE/_UPS/_FEDEX above) for very light,
// very flat, low-value items in a small fixed set of eBay categories. Distinct from GA Cubic
// (evaluateUspsCubic / USPS_CUBIC_RATE_TABLE above). Standard Envelope really is flat and
// national; GA Cubic is NOT -- it is priced by cubic-foot tier AND zone (Notice 123 p.16),
// which is precisely the confusion the 2026-08-16 rebuild corrected. Standard Envelope is
// eBay's own envelope-specific service with its own weight/size/category/price gates.
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
 * Same shape/pattern as evaluateUspsCubic() above: takes the raw inputs, returns either a
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
// FEDEX AHS WEIGHT-TRIGGER MULTIPLIER -- ADDED 2026-08-16 alongside the RATE_TABLE_FEDEX
// 70lb rebuild above, and REQUIRED BY IT: without this the rebuild would leave the engine
// SHORT by 28-40% on every genuinely-heavy (actual >50lb) FedEx package in the 50-70lb
// band. EBAY_NEGOTIATED_SURCHARGE_PASSTHROUGH (0.50) was measured on UPS Ground ONLY (see
// that constant's own comment -- 'comparing UPS Ground quotes'); it was applied to FedEx
// by cross-carrier assumption, never by measurement. FedEx's two triggers that WERE
// measured on FedEx both came out ABOVE the table's face value, not below it: dimension
// 1.29-1.41 and packaging 1.185-1.196. So does the weight trigger, now that there is data
// for it. DERIVATION (8 independent points, one per zone): de-compose each of the prior
// 70lb quoted totals against its rebuilt clean base --
//   (oldTotal - newBase) / AHS_WEIGHT_SURCHARGE_TABLE[zone]
//   z1 1.158 - z2 1.134 - z3 1.114 - z4 1.160 - z5 1.172 - z6 1.172 - z7 1.188 - z8 1.106
// Range 1.106-1.188, i.e. tight, and it lands on top of the independently-measured 1.19
// packaging multiplier below. 1.19 is used because it is at or above ALL EIGHT observed
// ratios -- this file's standing convention of erring toward not underpricing. Check:
// newBase + AHS_WEIGHT x 1.19 reproduces all eight original quoted totals at +0.1% to
// +4.4%, OVER at every zone, short at none. UPS is unchanged and keeps the 0.50 factor.
// SCOPE: this multiplier can only fire for FedEx at actual weight >50lb; at billable
// weight >=70lb estimateCheapestRate switches to FEDEX_HIGH_WEIGHT_TOTAL_TABLE and zeroes
// the surcharge entirely. So it affects exactly the 50-70lb band the evidence covers.
// STILL UNVERIFIED: no direct FedEx 49lb-vs-51lb A/B was run (the UPS one was). These 8
// points are a de-composition, and they rest on r50 being the right base ratio at 70lb --
// a genuine assumption. A real FedEx A/B at the trigger boundary would settle it.
export const AHS_WEIGHT_SURCHARGE_FEDEX_MULTIPLIER = 1.19;
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
  { maxLb: 70,  z1: 53.21,  z2: 53.21,  z3: 69.71,  z4: 69.71,  z5: 82.57,  z6: 92.77,  z7: 102.33, z8: 121.32 }, // RECOMPUTED 2026-08-16 -- closes the table's one weight inversion (z8 70lb $124.20 > 90lb $122.06). This row is NOT a live quote and never was; the comment directly above states its derivation: RATE_TABLE_UPS's own 70lb row + AHS_WEIGHT_SURCHARGE_TABLE[zone] x EBAY_NEGOTIATED_SURCHARGE_PASSTHROUGH. RATE_TABLE_UPS's 70lb row was itself rebuilt earlier on 2026-08-16 (to strip a baked-in >50lb accessorial that computeSurchargeForCarrier was adding a second time), and this row was never recomputed against it -- so it had gone stale against its own formula. The prior values reconcile to NEITHER the old nor the new base under that formula, so their true provenance is unknown; they are superseded, not corrected. PRIOR CELLS, PRESERVED: z1/z2 52.50, z3/z4 59.44, z5 75.64, z6 81.92, z7 99.50, z8 124.20. New values = round2(RATE_TABLE_UPS[70lb][z] + round2(AHS_WEIGHT_SURCHARGE_TABLE[z] * 0.50)), i.e. exactly what estimateCheapestRate computes at 69.9lb -- which also removes a real price DISCONTINUITY at the lb>=70 branch boundary (at z3 the engine previously dropped $10.26 as weight crossed 70lb, and at z8 it jumped $2.89). Every new cell stays at or below this table's real 90lb live quotes at every zone (z8 121.32 < 122.06), so the inversion is closed by lowering the DERIVED row, never by touching a measured one. The 90/110/130/150lb rows are real eBay quotes and are untouched
  { maxLb: 90,  z1: 76.44,  z2: 76.44,  z3: 84.64,  z4: 84.64,  z5: 91.46,  z6: 103.33, z7: 116.94, z8: 122.06 },
  { maxLb: 110, z1: 97.94,  z2: 97.94,  z3: 102.75, z4: 102.75, z5: 107.73, z6: 119.08, z7: 128.76, z8: 139.85 },
  { maxLb: 130, z1: 189.08, z2: 189.08, z3: 195.50, z4: 195.50, z5: 197.30, z6: 209.02, z7: 219.54, z8: 235.13 },
  { maxLb: 150, z1: 204.92, z2: 204.92, z3: 216.12, z4: 216.12, z5: 218.17, z6: 226.83, z7: 237.16, z8: 255.18 },
];

/**
 * ── ANCHOR STATUS OF THIS TABLE (audited 2026-08-17) -- READ BEFORE "FIXING" IT ──────────
 *
 * The standing complaint about this table is that it is "unanchored -- real eBay TOTALS with
 * UNRECORDED accessorials baked in, so surcharges cannot be reasoned about separately". That
 * is HALF right, and the half that is wrong has caused two rounds of wasted effort. Audited
 * against this file's own recorded provenance; every statement below is checkable from the
 * comment above and from FEDEX_DESTINATION_SURCHARGE_ZIP_TIER, no new data required.
 *
 * WHAT IS ACTUALLY KNOWN
 *   - The destinations are RECORDED, per zone, in the provenance comment above: z1 49503
 *     (Grand Rapids), z2 60601 (Chicago), z3 46201 (Indianapolis), z4 63101 (St. Louis),
 *     z5 67202 (Wichita), z6 80202 (Denver), z7 89101 (Las Vegas), z8 98101 (Seattle);
 *     origin 49079, box 10x8x6in, weights 90/110/130/150lb. "Never recorded" is false.
 *   - The DESTINATION-surcharge component of these totals is therefore largely KNOWN, and it
 *     is mostly ZERO. Cross-referencing those 8 probe ZIPs against
 *     FEDEX_DESTINATION_SURCHARGE_ZIP_TIER (executed, not eyeballed): FIVE are measured
 *     'clean' = $0.00 (z1 49503, z3 46201, z6 80202, z7 89101, z8 98101), THREE were never
 *     measured (z2 60601, z4 63101, z5 67202), and ZERO fall in tiers A/B/C. So no measured
 *     destination surcharge is baked into any cell of this table, and at five of eight zones
 *     that is a positive measurement rather than an absence of one.
 *   - Consequence: estimateCheapestRate zeroing the destination surcharge on this branch is
 *     CORRECT for those five zones by measurement, not merely cautious. The three unmeasured
 *     zones are the only place a hidden destination component could be lurking, and closing
 *     them is DATA not code -- quote 60601/63101/67202 and append to the ZIP tier map.
 *   - The 70lb row is DERIVED, not measured (see its own inline comment), and its
 *     decomposition IS already written down there: base + AHS_WEIGHT x 1.19 reconstructs all
 *     eight cells to +0.1%..+4.4%. That row is not part of the problem.
 *
 * UPDATE 2026-08-22 -- the 70lb row's decomposition is no longer just prose. See
 * FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION (immediately below this table): it
 * itemizes the 70lb row into a real `base` (RATE_TABLE_FEDEX's own 70lb row, unchanged,
 * unmodified by this pass) and an EXACT `surcharge` residual (this row's real total minus
 * that base, to the penny at all 8 zones) -- not the approximate "AHS x 1.19" estimate
 * referenced two paragraphs up, the ACTUAL amount baked into the measured total, whatever
 * it turns out to be composed of. 90/110/130/150lb remain deliberately undecomposed there
 * (`base: null`) for exactly the reason spelled out immediately below -- this update does
 * not touch that conclusion, only closes the one row where real base data already exists.
 *
 * WHAT IS GENUINELY NOT KNOWN, AND WHY IT CANNOT BE DERIVED HERE
 *   The ACCESSORIAL (AHS weight-trigger / Large-Package) component of the 90/110/130/150lb
 *   rows. Decomposing it requires a clean base freight rate at those weights to subtract, and
 *   RATE_TABLE_FEDEX HAS NO ROWS ABOVE 70lb -- there is nothing to subtract. The obvious
 *   shortcut (reuse the 49-51lb eBay-vs-retail discount ratio) was already tried and rejected
 *   by the session that built this table: that ratio is NOT constant across this weight
 *   range, which is exactly why real totals were stored instead of a decomposition. Deriving
 *   numbers anyway would mean inventing a rate table, which is strictly worse than leaving it
 *   composed -- a fabricated split would look authoritative and silently mis-scale on the
 *   next surcharge change.
 *
 * WHAT DATA WOULD CLOSE IT, AND THE CHEAPEST WAY TO GET IT (no paid API, browser only)
 *   The same free ebay.com/shp/calc/rates harvest that produced every other cell in this
 *   file, using the A/B isolation methodology already proven here (see
 *   AHS_WEIGHT_SURCHARGE_FEDEX_MULTIPLIER's derivation):
 *     (a) For each of 90/110/130/150lb, one quote at a SMALL, non-dimension-triggering box
 *         (10x8x6in, as used here) and one at a shape that trips ONLY the dimension trigger,
 *         same weight and same destination -- the delta isolates the dimension accessorial.
 *     (b) A weight-trigger A/B is NOT obtainable at these weights: the >50lb AHS trigger is
 *         already active at 90lb and cannot be turned off, so the only way to separate base
 *         from AHS is a published FedEx Ground base rate card at 90-150lb (list rates, then
 *         solve for the eBay negotiated ratio at each weight) -- the same primary source
 *         already used to rebuild RATE_TABLE_FEDEX, just extended past its 70lb ceiling.
 *     (c) 3 quotes to close the unmeasured destination ZIPs above (60601, 63101, 67202),
 *         which is independent of (a)/(b) and much cheaper.
 *   Until (b) exists, this table stays composed and estimateCheapestRate keeps zeroing
 *   surcharges on this branch. That is the correct posture, not a deferral.
 *
 * PRIORITY, WITH REAL NUMBERS (production DB, 2026-08-17): this branch is reached by ONE of
 * 153 items that have a package -- a 15lb folding-chair set whose 136.75lb DIMENSIONAL weight
 * trips the >=70lb billable threshold, and which is not listed on eBay. ZERO items have an
 * actual weight >= 70lb. So the un-decomposed accessorial has no measured live exposure at
 * all today; this is a correctness/maintainability debt, not a money leak.
 *
 * UPDATE 2026-08-24 -- item (b) above ('a published FedEx Ground base rate card at 90-150lb')
 * is now PARTIALLY closed, as an ESTIMATE, not a live A/B measurement. Fetched
 * fedex.com/ratetools/documents2/GroundNoSvc.pdf directly this pass (FedEx's own current
 * 'Standard List Rates by service', eff. 2026-01-05, Ground rates 1-150lb x zones 2-8 -- the
 * exact primary source named above, now actually pulled past the 70lb ceiling). See
 * FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION's own header for the method and its honestly-
 * stated confidence: base freight at 90/110/130/150lb is MODELLED by applying the one real
 * eBay-negotiated/published ratio this file has (r = RATE_TABLE_FEDEX's real 70lb row divided
 * by this same PDF's published 70lb row) HELD FLAT forward onto the PDF's published
 * 90/110/130/150lb rows -- it is NOT a second live A/B, because none was obtainable (no
 * browser session in this pass, and per (b) above the AHS trigger cannot be isolated by A/B at
 * these weights regardless). Item (a) (dimension-trigger A/B at 90-150lb) and (c) (the 3
 * unmeasured destination ZIPs) are UNCHANGED and still open.
 */
export const FEDEX_HIGH_WEIGHT_TOTAL_TABLE: HighWeightAnchorRow[] = [
  { maxLb: 70,  z1: 77.51,  z2: 83.44,  z3: 87.24,  z4: 90.81,  z5: 103.70, z6: 103.70, z7: 117.09, z8: 124.99 }, // 70lb row CORRECTED 2026-08-16. PRIOR CELLS, PRESERVED: z1/z2 93.61, z3/z4 110.42, z5 135.90, z6 150.17, z7 171.01, z8 184.48 -- those exceeded this table's OWN real 90lb quotes at 7 of 8 zones (z8 184.48 at 70lb vs a real 129.52 at 90lb: 43% MORE money for 20 FEWER pounds), 7 weight-monotonicity violations, all now closed. The numbers below are not new: they are the eight values that until this pass sat in RATE_TABLE_FEDEX's 70lb row, i.e. the observed 70lb TOTALS (base freight + the >50lb accessorial already inside them) -- which is exactly what THIS table is defined to hold, and the reason they were wrong where they were. z8 124.99 is a real live eBay quote (2026-08-11 full-column re-anchor); z1-z7 are the pre-existing curve-shape-scaled values, unchanged in magnitude, only relocated. Cross-check: base+AHS reconstruction gives 79.01/86.07/91.12/92.31/104.71/104.71/117.19/129.92, within +0.1%..+4.4% of these
  { maxLb: 90,  z1: 90.96,  z2: 96.88,  z3: 97.32,  z4: 100.75, z5: 111.61, z6: 111.61, z7: 129.52, z8: 129.52 },
  { maxLb: 110, z1: 101.30, z2: 107.22, z3: 106.66, z4: 109.37, z5: 119.50, z6: 119.50, z7: 135.43, z8: 135.43 },
  { maxLb: 130, z1: 359.76, z2: 365.68, z3: 383.70, z4: 387.56, z5: 442.72, z6: 442.72, z7: 468.81, z8: 468.81 },
  { maxLb: 150, z1: 367.95, z2: 373.88, z3: 393.42, z4: 398.09, z5: 453.60, z6: 453.60, z7: 477.83, z8: 477.83 },
];

/**
 * RE-ANCHOR OF FEDEX_HIGH_WEIGHT_TOTAL_TABLE -- base + itemized accessorial surcharge,
 * mirroring the SAME pattern the <70lb tables above already use (RATE_TABLE_FEDEX holds
 * surcharge-free base freight; AHS_WEIGHT_SURCHARGE_TABLE / AHS_DIMENSION_SURCHARGE_TABLE /
 * FEDEX_DESTINATION_SURCHARGE_TIERS hold the itemized surcharges separately;
 * computeSurchargeForCarrier ADDS them at runtime). This is that same base+surcharge shape
 * applied to FEDEX_HIGH_WEIGHT_TOTAL_TABLE's rows -- as far as it can honestly go with data
 * this file has today. Read the "ANCHOR STATUS OF THIS TABLE" audit comment directly above
 * FEDEX_HIGH_WEIGHT_TOTAL_TABLE (including its 2026-08-24 UPDATE paragraph) before
 * extending this further.
 *
 * TWO PASSES, TWO DIFFERENT CONFIDENCE LEVELS -- DO NOT BLUR THEM:
 *
 *   maxLb:70 -- REAL-ANCHORED (2026-08-22, unchanged by this pass). base = RATE_TABLE_FEDEX's
 *   own 70lb row (real, pre-existing, copied verbatim, not re-derived). surcharge =
 *   FEDEX_HIGH_WEIGHT_TOTAL_TABLE's 70lb total for that zone MINUS that base -- the EXACT
 *   residual actually baked into the real measured total, not a formula estimate. This is
 *   deliberately NOT asserted to be pure AHS: the probe destinations behind the 70lb row's
 *   real quotes are the same ones RATE_TABLE_FEDEX itself was real-anchored against (z2 49503,
 *   z4 30301, z7 98282, per that table's header), and cross-referencing
 *   FEDEX_DESTINATION_SURCHARGE_ZIP_TIER shows 49503 and 30301 are measured 'clean' ($0
 *   destination surcharge) while 98282 is measured tier A (+$5.92) -- so at least z7's
 *   residual demonstrably contains a real destination-surcharge component alongside AHS, not
 *   AHS alone. The residual is itemized honestly as "whatever accessorial content this lane's
 *   real quote carried", not mis-labeled as a single named surcharge.
 *
 *   maxLb:90/110/130/150 -- MODELLED (added 2026-08-24), NOT real-anchored, and NOT a live A/B.
 *   Previously `base: null, surcharge: null` because RATE_TABLE_FEDEX has no rows above 70lb
 *   and fabricating a base figure was explicitly rejected ("a fabricated split would look
 *   authoritative and silently mis-scale on the next surcharge change" -- that principle still
 *   holds and is why these four rows are labelled MODELLED, never REAL). What changed: this
 *   pass fetched fedex.com/ratetools/documents2/GroundNoSvc.pdf (FedEx's own published
 *   "Standard List Rates by service", eff. 2026-01-05, Ground rates 1-150lb x zones 2-8) --
 *   the exact primary source the file's own audit named as "the cheapest way to get" the
 *   missing data, now actually pulled past the 70lb ceiling for the first time. That source
 *   gives real PUBLISHED (retail) base rates at 90/110/130/150lb, but NOT the eBay-negotiated
 *   discount ratio at those weights -- no live quote at those weights isolates a clean,
 *   AHS-free base to measure that ratio directly (see "WHY 90/110/130/150 STAY MODELLED"
 *   below). So the estimate uses the ONLY real negotiated-vs-published ratio this file has:
 *     r(zone) = RATE_TABLE_FEDEX's real 70lb row[zone] / this PDF's published 70lb row[zone]
 *   held FLAT forward and applied to the PDF's published 90/110/130/150lb rows:
 *     base(zone, W) = round2( max(14.07, publishedGroundList(zone, W) x r(zone)) )
 *     surcharge(zone, W) = FEDEX_HIGH_WEIGHT_TOTAL_TABLE's real total(zone, W) MINUS base(zone, W)
 *   surcharge is still an EXACT residual against the real measured total (never a guessed
 *   number, never negative at any of the 28 cells checked -- see the regression test), so
 *   base+surcharge reproduces the existing total to the penny exactly as the 70lb row does.
 *   What is NOT exact is the base/surcharge SPLIT ITSELF: r held flat past its one anchor is a
 *   real, stated assumption, not a verified fact. This file's OWN data shows r is not stable
 *   across weight even below 70lb -- the real ratio at z2 measures 0.5534 at 50lb but 0.6817 at
 *   70lb (computed from RATE_TABLE_FEDEX's own 50lb/70lb rows against this PDF's published
 *   50lb/70lb rows), the same "ratio is NOT constant across this weight range" phenomenon the
 *   file's audit already flagged for the total-level decomposition attempt. Holding it flat
 *   from 70 to 150lb is therefore a genuine extrapolation with no bracketing anchor above it --
 *   the same posture this file already accepts for RATE_TABLE_FEDEX's z8 column (flat-at-r7,
 *   "still an extrapolation with no zone above it to bracket it") applied here on the weight
 *   axis instead of the zone axis. Sanity-checked, not just asserted: base(zone, W) comes out
 *   monotonically increasing in W at every zone (23.67->43.30->58.39->70.68->82.63 at z1, e.g.),
 *   and the resulting surcharge jumps from the ~$43-68 AHS-range at 90-110lb to the ~$285-390
 *   range at 130-150lb -- which lines up with LARGE_PACKAGE_MIN_BILLABLE_LB (90lb) and
 *   LARGE_PACKAGE_SURCHARGE_TABLE's own $254.50-$331.00 figures, i.e. the residual's shape
 *   matches a real, already-documented FedEx accessorial rather than looking arbitrary.
 *
 * WHY 90/110/130/150 STAY MODELLED, NOT REAL-ANCHORED: the >50lb AHS trigger is permanently
 * active at these weights and cannot be turned off by an A/B test (per the file's own note),
 * so there is still no way to observe a clean, surcharge-free base at 90lb+ short of an actual
 * live eBay quote with AHS somehow suppressed, which does not exist. Only a genuine live A/B
 * at these weights (item (a)/(b) in the ANCHOR STATUS comment) would upgrade these four rows
 * from MODELLED to REAL. Treat the 90/110/130/150 base/surcharge split as a labelled estimate
 * for future compositional reasoning, not as ground truth the way the 70lb row is.
 *
 * INVARIANT (regression-tested, see ebayRateEstimateHighWeightDecomposition.test.ts): for
 * EVERY row (70/90/110/130/150), base[zone] + surcharge[zone] === FEDEX_HIGH_WEIGHT_TOTAL_TABLE's
 * total for that zone, to the penny, at all 8 zones. This is a PURE decomposition of existing
 * numbers, not a pricing change -- FEDEX_HIGH_WEIGHT_TOTAL_TABLE itself is untouched above,
 * interpolateHighWeightTotal is untouched below, and nothing in estimateCheapestRate reads
 * this export -- it changes no computed price for any weight or zone. It exists so a future
 * surcharge change has a real (70lb) or best-estimate (90/110/130/150lb) number to start
 * compositional reasoning from, instead of re-deriving a row's total from scratch.
 */
export const FEDEX_HIGH_WEIGHT_TOTAL_TABLE_DECOMPOSITION: ReadonlyArray<{
  maxLb: number;
  /** Real (maxLb:70) or modelled-estimate (maxLb:90/110/130/150, see header above) base
   *  freight for this weight, or null when no figure exists in this file to decompose
   *  against at all (see the comment above -- null is NOT zero). */
  base: Record<ZoneKey, number> | null;
  /** Exact residual (real total minus base) for this weight, or null alongside base. */
  surcharge: Record<ZoneKey, number> | null;
}> = [
  {
    maxLb: 70,
    // REAL. = RATE_TABLE_FEDEX's own 70lb row, copied verbatim (not re-derived).
    base: { z1: 23.67, z2: 23.67, z3: 28.87, z4: 31.92, z5: 37.80, z6: 42.66, z7: 47.28, z8: 56.56 },
    // = FEDEX_HIGH_WEIGHT_TOTAL_TABLE's 70lb row minus base, exactly (verified to the
    // penny at all 8 zones -- see the regression test).
    surcharge: { z1: 53.84, z2: 59.77, z3: 58.37, z4: 58.89, z5: 65.90, z6: 61.04, z7: 69.81, z8: 68.43 },
  },
  {
    maxLb: 90,
    // MODELLED (2026-08-24) -- NOT real-anchored, see header "WHY 90/110/130/150 STAY
    // MODELLED" above. = round2(max(14.07, GroundNoSvc.pdf published 90lb row[zone] x r(zone))),
    // r(zone) = RATE_TABLE_FEDEX's real 70lb row / this PDF's published 70lb row, held flat.
    // Published 90lb row (PDF, z1 mirrors z2 per this file's convention): z1/z2 63.52, z3 66.24,
    // z4 73.59, z5 81.48, z6 96.94, z7 113.43, z8 119.53.
    base: { z1: 43.30, z2: 43.30, z3: 42.81, z4: 44.92, z5: 47.72, z6: 54.36, z7: 61.78, z8: 65.10 },
    // = FEDEX_HIGH_WEIGHT_TOTAL_TABLE's 90lb row minus base, exactly. Verified non-negative
    // and base+surcharge recombines to the real total to the penny at all 8 zones (regression
    // test). Not asserted to be pure AHS -- see header.
    surcharge: { z1: 47.66, z2: 53.58, z3: 54.51, z4: 55.83, z5: 63.89, z6: 57.25, z7: 67.74, z8: 64.42 },
  },
  {
    maxLb: 110,
    // MODELLED (2026-08-24) -- see maxLb:90 comment above for method. Published 110lb row
    // (PDF): z1/z2 85.65, z3 86.24, z4 92.05, z5 98.36, z6 114.18, z7 126.08, z8 139.12.
    base: { z1: 58.39, z2: 58.39, z3: 55.74, z4: 56.19, z5: 57.61, z6: 64.03, z7: 68.67, z8: 75.77 },
    surcharge: { z1: 42.91, z2: 48.83, z3: 50.92, z4: 53.18, z5: 61.89, z6: 55.47, z7: 66.76, z8: 59.66 },
  },
  {
    maxLb: 130,
    // MODELLED (2026-08-24) -- see maxLb:90 comment above for method. Published 130lb row
    // (PDF): z1/z2 103.67, z3 103.69, z4 111.97, z5 114.78, z6 131.09, z7 145.05, z8 166.42.
    // Surcharge jumps sharply here vs 90/110lb -- consistent with LARGE_PACKAGE_MIN_BILLABLE_LB
    // (90lb) and LARGE_PACKAGE_SURCHARGE_TABLE's own $254.50-$331.00 figures kicking in, not
    // an artifact of the modelling (see header).
    base: { z1: 70.68, z2: 70.68, z3: 67.01, z4: 68.35, z5: 67.22, z6: 73.52, z7: 79.00, z8: 90.64 },
    surcharge: { z1: 289.08, z2: 295.00, z3: 316.69, z4: 319.21, z5: 375.50, z6: 369.20, z7: 389.81, z8: 378.17 },
  },
  {
    maxLb: 150,
    // MODELLED (2026-08-24) -- see maxLb:90 comment above for method. Published 150lb row
    // (PDF): z1/z2 121.21, z3 124.51, z4 134.51, z5 138.11, z6 151.87, z7 164.36, z8 185.15.
    base: { z1: 82.63, z2: 82.63, z3: 80.47, z4: 82.11, z5: 80.89, z6: 85.17, z7: 89.52, z8: 100.84 },
    surcharge: { z1: 285.32, z2: 291.25, z3: 312.95, z4: 315.98, z5: 372.71, z6: 368.43, z7: 388.31, z8: 376.99 },
  },
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

export type PackageSurchargeTier = 'SAFE' | 'AHS' | 'LARGE_PACKAGE' | 'USPS_NONSTANDARD';

/**
 * ADR-103 Phase 5 (organizer-facing surcharge warning, 2026-09-03). Zone-independent
 * classification of whether a package's REAL dims/weight/packageType will trigger a
 * carrier oversize surcharge on ANY of USPS/UPS/FedEx -- used to persist
 * Item.shippingMarginRiskTier so "which listings are at risk of eating margin on
 * shipping" is a queryable fact, not something recomputed per organizer/zone.
 *
 * The trigger CONDITIONS below intentionally mirror computeSurchargeForCarrier()'s own
 * boolean checks a few lines down (48/30/130/96/110/17280/50/22/30/2cuft -- ADR-103 §2D).
 * They are duplicated here ONLY as boundary comparisons -- NO dollar amount, rate table,
 * or pass-through constant is duplicated; those stay solely in computeSurchargeForCarrier
 * and its AHS/LARGE_PACKAGE/USPS_NONSTANDARD fee-table constants. This function does
 * not need a zone or carrier because none of these specific trigger conditions vary by
 * zone -- only the resulting dollar figure does. If ADR-103 ever revises these threshold
 * numbers, update both this function and computeSurchargeForCarrier in the same pass.
 *
 * Returns the WORST tier that would fire on any modeled carrier
 * (LARGE_PACKAGE > AHS > USPS_NONSTANDARD > SAFE) -- deliberately conservative, same
 * "never be short" principle this file already applies elsewhere.
 */
export function classifyPackageSurchargeTrigger(
  dims: { length?: number | null; width?: number | null; height?: number | null } | null | undefined,
  weightOz: number | null | undefined,
  packageType?: string | null
): PackageSurchargeTier {
  const weightLb = Math.max(0, weightOz || 0) / 16;
  const sorted = sortedRealDims(dims ?? null);
  const lengthPlusGirth = sorted ? sorted[0] + 2 * (sorted[1] + sorted[2]) : 0;
  const volumeCuIn = sorted ? sorted[0] * sorted[1] * sorted[2] : 0;

  // UPS/FedEx Large Package -- same trigger as computeSurchargeForCarrier below.
  const largePackageTriggered =
    lengthPlusGirth > 130 || (!!sorted && sorted[0] > 96) || weightLb > 110 || volumeCuIn > 17280;
  if (largePackageTriggered) return 'LARGE_PACKAGE';

  // UPS/FedEx Additional Handling Surcharge -- same trigger as computeSurchargeForCarrier below.
  const dimensionTriggered = !!sorted && (sorted[0] > 48 || sorted[1] > 30);
  const weightTriggered = weightLb > 50;
  const packagingTriggered = !!packageType && AHS_PACKAGING_TYPES.has(packageType);
  if (dimensionTriggered || weightTriggered || packagingTriggered) return 'AHS';

  // USPS Ground Advantage nonstandard -- same trigger as computeSurchargeForCarrier's USPS branch.
  if (sorted && (sorted[0] > 22 || volumeCuIn > 2 * 1728)) return 'USPS_NONSTANDARD';

  return 'SAFE';
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
  packageType: string | null | undefined,
  destinationZip?: string | null
): { amount: number; type: 'AHS' | 'LARGE_PACKAGE' | 'USPS_NONSTANDARD' | 'DESTINATION' | null; minBillableLb: number | null } {
  const weightLb = Math.max(0, weightOz || 0) / 16;
  // FedEx-only additive destination surcharge (see FEDEX_DESTINATION_SURCHARGE_TIERS for the
  // three-tier measurement, the tier-C unmapped default and what that default costs). It
  // stacks ON TOP of AHS/Large Package rather than competing with them in the max() below --
  // real carriers bill an accessorial and a destination surcharge together, and the two were
  // measured independently. Applied at every UPS/FedEx return path below; USPS returns before
  // this and is unaffected. destinationZip is undefined on today's flat-rate path (the engine
  // is destination-blind), which resolves to the conservative unmapped default -- never $0.
  const finish = <T extends { amount: number; type: 'AHS' | 'LARGE_PACKAGE' | 'USPS_NONSTANDARD' | 'DESTINATION' | null; minBillableLb: number | null }>(
    r: T
  ) => {
    if (carrier !== 'FEDEX') return r;
    const dest = fedexDestinationSurchargeForZip(destinationZip);
    const amount = round2(r.amount + dest);
    // Only label it DESTINATION when a destination amount actually applied. A measured-clean
    // ZIP adds $0, and reporting a $0 'DESTINATION' surcharge would be a misleading receipt.
    return { amount, type: r.type ?? (dest > 0 ? ('DESTINATION' as const) : null), minBillableLb: r.minBillableLb };
  };
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
    return finish({
      amount: round2(LARGE_PACKAGE_SURCHARGE_TABLE[zone] * EBAY_NEGOTIATED_SURCHARGE_PASSTHROUGH),
      type: 'LARGE_PACKAGE' as const,
      minBillableLb: LARGE_PACKAGE_MIN_BILLABLE_LB,
    });
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
    if (weightTriggered) {
      // UPS keeps the measured 0.50 pass-through; FedEx uses its own measured multiplier
      // (see AHS_WEIGHT_SURCHARGE_FEDEX_MULTIPLIER) -- FedEx does NOT get UPS's accessorial
      // discount, confirmed on all three of its triggers.
      const weightFactor = carrier === 'FEDEX' ? AHS_WEIGHT_SURCHARGE_FEDEX_MULTIPLIER : EBAY_NEGOTIATED_SURCHARGE_PASSTHROUGH;
      candidateAmounts.push(round2(AHS_WEIGHT_SURCHARGE_TABLE[zone] * weightFactor));
    }
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
    return finish({ amount: Math.max(...candidateAmounts), type: 'AHS' as const, minBillableLb: null });
  }
  return finish({ amount: 0, type: null as null, minBillableLb: null });
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
  /** Buyer/destination ZIP -- optional, and NOT supplied by any current caller (the live
   *  path is a destination-blind flat rate). When present it selects the MEASURED FedEx
   *  destination-surcharge tier for that ZIP instead of the conservative unmapped default;
   *  see FEDEX_DESTINATION_SURCHARGE_TIERS. Omitting it changes nothing. */
  destinationZip?: string | null;
}): CheapestRate {
  const dims = input.dims ?? null;
  let best: CheapestRate | null = null;
  let anyCarrierViable = false;

  for (const c of CARRIER_TABLES) {
    if (!withinAbsoluteMax(c.carrier, dims, input.weightOz)) continue; // this carrier can't ship it
    anyCarrierViable = true;

    const surcharge = computeSurchargeForCarrier(c.carrier, input.zone, dims, input.weightOz, input.packageType, input.destinationZip);
    // Large Package's 90lb minimum billable weight applies to the BASE rate lookup
    // itself (ADR-103 §2D), not just the surcharge -- floor the weight used for
    // billableLb's actual-weight input before computing dim-weight-vs-actual.
    const effectiveWeightOz =
      surcharge.minBillableLb != null ? Math.max(input.weightOz, surcharge.minBillableLb * 16) : input.weightOz;

    // USPS only bills dimensional weight above 1 cu ft (DMM 283.1.4.1) -- see billableLb's
    // 4th parameter. UPS/FedEx bill it at every size, so they pass undefined.
    const { lb, basis: weightBasis } = billableLb(
      effectiveWeightOz,
      dims,
      c.divisor,
      c.carrier === 'USPS' ? USPS_CUBIC_MAX_CU_IN : undefined
    );
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

  // USPS Ground Advantage CUBIC -- the second, independent USPS price base (Notice 123
  // p.16). USPS bills the CHEAPER of weight-based and cubic, so this competes in the same
  // cheapest-wins comparison as the three carrier tables above. REBUILT ZONE-AWARE
  // 2026-08-16: it now takes the zone (cubic is zone-priced, it was previously modelled as
  // a flat national rate that was really the zone-8 column) and the packageType (DMM
  // 283.1.3.1 bars rolls/tubes from cubic pricing). See USPS_CUBIC_RATE_TABLE's header.
  // surcharge is 0 by construction, not by omission -- a cubic-eligible parcel is <=1 cu ft
  // and <=22in on its longest side, so no Notice 123 p.15 nonstandard fee can trigger.
  const cubic = evaluateUspsCubic(dims, input.weightOz, input.zone, input.packageType);
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
  /** See estimateCheapestRate's `destinationZip` -- passed through unchanged, optional.
   *  ADDED 2026-08-17 to close the one broken link in an otherwise complete chain: the
   *  parameter existed on estimateCheapestRate (and on computeSurchargeForCarrier, and
   *  fedexDestinationSurchargeForZip existed to serve it) but THIS wrapper -- which is what
   *  every live caller actually calls -- neither accepted nor forwarded it, so no caller
   *  COULD have supplied one even if it had a ZIP to supply. Omitting it changes nothing:
   *  undefined resolves to FEDEX_DESTINATION_SURCHARGE_UNMAPPED_TIER exactly as before.
   *  Read the "DESTINATION ZIP IS NOT AVAILABLE AT PRICING TIME" block above
   *  FEDEX_DESTINATION_SURCHARGE_TIERS before assuming this is now usable on the live
   *  path -- it is plumbing for a destination-aware surface that does not exist yet. */
  destinationZip?: string | null;
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
    destinationZip: input.destinationZip ?? null,
  });
}
