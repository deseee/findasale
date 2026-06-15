# ADR — Shipping policy as a single source of truth + live re-pin on change — 2026-06-14

## Context (evidence, this session)
- Organizer `Artifact` (cmnxueoas...) is `shippingMode = FLAT_TIERS`. Weight tiers stop at 111oz ($19.99) then jump to a 720oz "FEDEX 45lb $75" catch-all.
- Item cmqbb252i... (176oz pump) overshoots into that gap → `resolvePoliciesForItem` gap-guard → `ensureFvfFlatRatePolicy` → dynamic FVF flat. Computed **$32** at S975 rates, **$28** at today's (UPS/FedEx tables updated 2026-06-14).
- The shipping **preview** (S979) replicates *only* the FVF-flat formula, so it shows the right number for gap items but a **fabricated** number for items that match a real static tier (a 10oz item shows a computed flat, not the actual "12oz Ground Advantage $7.75" tier rate). **Bug — preview ≠ listing.**
- `publishItemOffer` (edit-item "Re-push") short-circuits at line 2903 ("Already live? Idempotent") → never re-resolves or re-applies shipping. The live listing stays pinned to whatever policy it got at first list. **This is why $32 never moved.**
- `pushSaleToEbay` DOES re-resolve (`resolvePoliciesForItem` @2048) and PUT the offer with `routing.fulfillmentPolicyId` (@2339, offer PUT @2437-2487). So the re-pin machinery exists; it just isn't invoked on edit/re-push of a live item.
- No Item field records the *currently applied* policy/amount → drift can't be detected without an eBay round-trip.

## Decision
One shared shipping resolver is the single source of truth, used by the listing push AND the preview, so they can never disagree. Live listings re-pin their shipping policy whenever the inputs that determine it change (item weight/dims, or carrier rate tables).

### Part A — Shared resolver (correctness; NO schema)
Extract `resolveItemShipping(organizer, mapping, conn, item, { fromZip })` → `{ fulfillmentPolicyId, buyerAmountCents, policyName, source: 'weight-tier'|'fvf-flat'|'calculated'|'free'|'local-pickup' }`.
- `resolvePoliciesForItem` calls it for the `fulfillmentPolicyId` (no behavior change to the push).
- The preview (`getShippingNetPreview` / `getSuggestedPriceForMargin`) calls it for `buyerAmountCents` + `policyName` — replacing the current "always compute FVF flat" branch.
- Weight-tier amount: parse the `$X.XX` embedded in the tier's `policyName` (all current tiers carry it; regex `\$(\d+(?:\.\d{2})?)`), fall back to the FVF-flat compute if a name has no parseable amount. (Follow-up: store `amountCents` in the tier mapping JSON so we stop parsing names — Phase B.)

### Part B — Re-pin a live listing on input change (schema + push path)
- Add to `Item` (additive): `ebayFulfillmentPolicyId String?`, `ebayShippingAmountCents Int?`, `ebayShippingRatedAt DateTime?`, `ebayRateVersion String?`.
- Extract `applyFulfillmentPolicyToOffer(offerId, fulfillmentPolicyId, token)` from the existing offer-PUT block in `pushSaleToEbay` (GET offer → merge → PUT).
- On **edit save** of an item with `ebayListingId` where weight/dims/packageType changed, and on the **edit-item "Re-push"** action: re-resolve via Part A; if `fulfillmentPolicyId !== item.ebayFulfillmentPolicyId`, call `applyFulfillmentPolicyToOffer`, then persist the new `ebayFulfillmentPolicyId/AmountCents/RatedAt/RateVersion`. `publishItemOffer` must stop no-opping for the shipping case.
- `ebayRateVersion` = hash/concat of `USPS_RATE_EFFECTIVE_DATE | UPS_… | FEDEX_…` constants, so drift detection is a cheap string compare.

### Part C — Bulk re-pin on carrier-rate drift (scheduled)
- A scheduled task (or admin endpoint) runs when the combined `ebayRateVersion` differs from what items carry. For each live item (`ebayListingId != null`) whose recomputed `buyerAmountCents` differs from stored by **≥ $0.50 OR ≥ 5%**, re-pin (Part B helper) and update stored fields. Batched + respects the eBay daily-call budget (`isEbayRateLimited`); items skipped when `ebayRateVersion` already current.
- Threshold + cadence are tunable constants.

## Rationale
- A single resolver is the only durable fix for preview≠listing — any second implementation drifts again.
- Storing the applied policy/amount/rate-version turns "did this change?" into a local compare, avoiding an eBay GET per item and enabling the bulk job to scale.
- eBay allows updating an active offer's fulfillment policy via offer PUT (no end+relist needed — unlike category), so re-pin is safe for live listings.

## Consequences
- Buyer-facing shipping on live listings can change after first list (by design now). Bounded by the Part C threshold so trivial cent-drift doesn't churn listings or burn eBay calls.
- Preview becomes authoritative: what it shows is exactly what a push/re-pin applies.

## Constraints added
- Shipping policy/amount must only ever be computed by `resolveItemShipping`. No second copy of the formula anywhere (preview included).

## Rollback: migration `add_item_ebay_shipping_applied_fields`
Down migration: drop columns `ebayFulfillmentPolicyId`, `ebayShippingAmountCents`, `ebayShippingRatedAt`, `ebayRateVersion` from `Item`.
Playbook: "If the deploy fails after migrate, the columns are additive + nullable — code tolerates them absent; re-run `prisma migrate deploy`, or `prisma migrate resolve --rolled-back` then drop columns via the down SQL."

## Sequencing
- **Phase 1 = Part A** — ship now. Pure correctness, no schema, fixes the visible preview≠listing bug. Low risk.
- **Phase 2 = Part B** — schema migration + re-pin on edit/re-push. Needs Patrick's migrate-deploy step.
- **Phase 3 = Part C** — bulk rate-drift job. After Phase 2 lands and is verified.
