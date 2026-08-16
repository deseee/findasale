/**
 * shippingPriceMath — the two pure, dependency-free helpers behind every shipping
 * price FindA.Sale quotes: the bounded bucket ladder (roundUpToBucket) and charm
 * pricing (applyCharmPricing).
 *
 * Extracted from ebayFlatRatePolicyService.ts (2026-08-16) when Patrick extended charm
 * pricing from the eBay flat-rate policy prices to native-checkout shipping.
 * nativeShippingSuggestionService.ts already imported roundUpToBucket out of the eBay
 * service; adding applyCharmPricing to that same import would have deepened a
 * native-checkout -> eBay-service dependency for what is really just shared arithmetic.
 * Both functions now live here and ebayFlatRatePolicyService.ts re-exports them
 * unchanged, so every existing import path -- and the jest mock of that module in
 * services/__tests__/ebayShippingResolver.standardEnvelope.test.ts -- keeps working
 * exactly as before.
 *
 * Nothing in this file touches prisma, the network, or any marketplace-specific constant.
 * Keep it that way: it is imported by both the eBay and the native-checkout pricing paths.
 */

/**
 * Round a rate UP to the next bounded-ladder bucket so the policy set stays small and
 * reusable: $0.50 steps <=$15, $1 <=$40, $2.50 <=$100, $5 above. Round UP so the seller
 * is never short; overage <= one bucket width.
 */
export function roundUpToBucket(rate: number): number {
  let step: number;
  if (rate <= 15) step = 0.5;
  else if (rate <= 40) step = 1;
  else if (rate <= 100) step = 2.5;
  else step = 5;
  const bucketed = Math.ceil((rate - 1e-9) / step) * step;
  return Math.round(bucketed * 100) / 100;
}

/**
 * Charm-price a bucketed rate (Patrick, 2026-08-14; extended to native checkout
 * 2026-08-16): $10.00 -> $9.99, $14.00 -> $13.99. Subtracts one cent from the
 * already-bucketed rate.
 *
 * Applied at every BUYER-FACING standalone shipping price:
 *   - eBay flat-rate policy prices -- ensureFvfFlatRatePolicy, computeNamedWeightTierRate
 *     / ensureNamedWeightTierPolicy, and their preview twin in ebayShippingResolver.ts's
 *     fvfFlat().
 *   - Native FindA.Sale checkout -- nativeShippingSuggestionService's
 *     suggestNativeShippingPrice(), the single function feeding BOTH the organizer-facing
 *     suggestion (GET /api/items/:id/suggested-shipping-price) and ADR-106's auto-set of
 *     Item.shippingPrice. One call site by construction, so the previewed number and the
 *     applied number can never disagree by a cent.
 *
 * Deliberately NOT baked into roundUpToBucket() itself: that helper is also used by
 * ebayCalculatedPolicyService.ts's computeCalculatedWithHandling, where the bucketed rate
 * is an internal intermediate used only to back out a handling-fee markup on a CALCULATED
 * policy and is never shown to a buyer as a standalone charge.
 *
 * Inputs are always roundUpToBucket() output, i.e. a multiple of $0.50 / $1 / $2.50 / $5,
 * so the result is always $X.49 or $X.99. It can never mangle an arbitrary value like
 * $10.47 because no call site passes one. The `> 0` guard fires only for a degenerate
 * non-positive bucketed rate -- unreachable today (the cheapest modeled carrier rate is
 * eBay Standard Envelope 1oz at $0.78, which buckets up to $1.00) -- where subtracting a
 * cent would otherwise emit a negative shipping price.
 *
 * Note this trades away roundUpToBucket's "seller never short" guarantee by exactly $0.01
 * -- an intentional, Patrick-approved tradeoff for charm pricing, not an oversight.
 */
export function applyCharmPricing(bucketedRate: number): number {
  if (!(bucketedRate > 0)) return bucketedRate;
  return Math.round((bucketedRate - 0.01) * 100) / 100;
}
