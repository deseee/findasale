# ADR — Smart Bounded FVF Flat-Rate Shipping Engine — 2026-06-14 (S975)

## Decision
Evolve `ebayFlatRatePolicyService.ts` + `ebayRateEstimateService.ts` from a single
USPS-Ground-Advantage estimator that mints one policy per exact computed cent, into a
**multi-carrier, cheapest-rate, bounded-bucket** flat-rate engine. The computed rate is
the *path to* a finite, reusable set of "FindA.Sale Flat $X.XX" policies — never a new
policy per item. eBay calculated shipping is never used as a fallback.

## How it works (pipeline)
1. **Cheapest-carrier rate.** Maintain three curated rate tables — USPS Ground Advantage
   (exists), UPS Ground, FedEx Home Delivery/Ground — each weight-tier × zone, each with
   its own dimensional divisor (USPS 166; UPS/FedEx 139). Billable weight =
   max(actual, dimWeight) per carrier. Compute each carrier's price for the item's
   weight+dims at the organizer's **coverage zone** (see below); take the **minimum**. (This is what fixes the 11 lb
   pump: USPS GA $20.38 is beaten by UPS/FedEx Ground for heavy/bulky parcels.)
   - The eBay flat-rate policy is carrier-agnostic (GENERIC `ShippingMethodStandard`), so
     carrier choice is purely OUR internal pricing input — the buyer just sees one flat
     price and the seller ships via whichever carrier they bought.
2. **FVF gross-up.** flatRate = ceil(cheapestRate / (1 − 0.136)) so the seller nets ≥ the
   label cost after eBay's 13.6% FVF on shipping. (Already implemented.)
3. **Bounded bucket ladder.** Round the grossed-up rate UP to the next boundary on a fixed
   ladder (proposed: $0.50 steps ≤ $15, $1 steps ≤ $40, $2.50 steps ≤ $100). Round-UP
   guarantees the seller is never short; overage ≤ one bucket width. Policy name = the
   bucket value. Result: ≤ ~40 policies per organizer total, reused across all items.
4. **Idempotent provisioning.** `ensureFvfFlatRatePolicy` already looks up by name + caches,
   so identical buckets reuse the same eBay policy — no sprawl.
5. **No calc fallback.** Remove the `calculated-fallback` branch in `resolvePoliciesForItem`.
   If provisioning genuinely fails, log + soft-block (`ebayNeedsReview`), never use eBay
   calculated. When weight/dims are missing → existing `NEEDS_PACKAGE_DETAILS` block.

## Rate-table staleness detection (Patrick requirement)
- Each table carries `effectiveDate` + `source` constants (USPS table already does).
- New monthly scheduled task `findasale-shipping-rate-audit` (mirrors the existing
  `findasale-monthly-perf-audit` pattern): warns Patrick when any table's `effectiveDate`
  is older than ~10 months OR a known carrier reprice window has passed (USPS ~Jan & Jul,
  UPS/FedEx ~late Dec / GRI). v1 = age + calendar alert (zero metered API calls). A live
  spot-check against a free public calculator can be layered later if desired.

## Rationale
- Curated tables = zero metered API cost (honors the Google-API-billing lockdown lesson)
  and no restricted OAuth scopes (the `sell.logistics` scope is exactly what broke the
  connection in the prior session).
- Cheapest-carrier selection is the only way to price heavy/bulky items sanely.
- Bucketing is the explicit guard against the "endless mess of new policies" Patrick called out.
- Never using calc is the whole point: eBay's calculated shipping leaves the seller short on FVF.

## Consequences
- **Coverage zone is per-organizer (DECIDED S975, Patrick):** = the carrier zone to the
  FARTHEST continental-US destination from the organizer's origin ZIP. Derived from the
  sale-address ZIP via existing geocoding → max distance to CONUS extremes → zone band.
  Central origins reach all CONUS in zone 5-6 (cheaper, more competitive flat rate);
  corner origins (NE/SE/NW/SW) hit zone 7-8 (priced higher, always covered). This makes the
  flat rate origin-specific and guarantees the seller is never short to any CONUS buyer.
  - Nuance: carrier zones cap at 8 (~1800+ mi), so two far-apart corner origins both land at
    zone 8 (same rate at the cap). Differentiation is real mainly for central origins.
  - CONUS only (exclude AK/HI/territories/APO — matches the org's existing FedEx policy).
  - Compute once per organizer/origin and cache; recompute only if the sale origin changes.
- More accurate heavy-item pricing; bounded, predictable policy set on the eBay account.

## Schema / migration
- **None required for v1.** Rate tables, bucket ladder, dim divisors, and carrier selection
  are code constants. Coverage-zone default is a constant (optionally per-organizer later via
  the existing `EbayPolicyMapping` row — additive, deferred). The staleness check is a
  scheduled task. No Prisma migration. (Low-risk, fully reversible by revert.)

## Constraints Added
- eBay flat-rate policies MUST use GENERIC `ShippingMethodStandard` (not carrier-specific
  codes — `USPSGroundAdvantage` is rejected by LSAS as UNKNOWN_SHIPPING_SERVICE_CODE for
  FLAT_RATE; proven via live eBay 400, S975).
- The FVF flat-rate engine never falls back to eBay calculated shipping.

## Dev sequence (when approved)
1. Add UPS Ground + FedEx Ground rate tables (weight×zone) + per-carrier dim divisor to
   `ebayRateEstimateService.ts`; add `coverageZoneForOrigin(originZip)` (geocode origin →
   max distance to CONUS extremes → zone band, cached) and `estimateCheapestRate()` returning
   {carrier, rate, basis} priced at that coverage zone.
2. Add the bucket ladder + `roundToBucket()`; wire `ensureFvfFlatRatePolicy` to price by bucket.
3. Remove the `calculated-fallback` branch in `ebayController.resolvePoliciesForItem`.
4. Add `findasale-shipping-rate-audit` scheduled task (effectiveDate-age + reprice-window alert).
5. Backend `npx tsc --noEmit` 0 errors; no schema change.

## Rollback
Pure code + one scheduled task — `git revert` the commit and delete the scheduled task.
No migration to reverse.
