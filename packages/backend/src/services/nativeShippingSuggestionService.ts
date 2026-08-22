/**
 * nativeShippingSuggestionService — ADR-104 §3: computes a suggested shipping price
 * for FindA.Sale's own native Stripe checkout (Item.shippingPrice), so an organizer
 * typing a shipping amount isn't unknowingly eating FindA.Sale's platform fee on top
 * of their real carrier cost with zero visibility.
 *
 * Reuses the SAME cheapest-carrier rate engine ADR-103 built for eBay
 * (estimateCheapestRate/computeCheapestForOrigin in ebayRateEstimateService.ts) and the
 * SAME price-shaping helpers (roundUpToBucket + applyCharmPricing, both in
 * utils/shippingPriceMath.ts -- one implementation, imported by the eBay flat-rate path
 * and this one alike). The only thing genuinely different from the eBay flat-rate
 * pipeline is the gross-up rate: FindA.Sale's own platform fee, NOT eBay's 13.6% FVF.
 *
 * Charm pricing (Patrick, 2026-08-16): the final suggested price is charm-priced the same
 * way eBay flat-rate policy prices already are ($10.00 -> $9.99), so a buyer never sees a
 * FindA.Sale shipping charge shaped differently from the same organizer's eBay one. This
 * closes the parity gap ADR-106 deliberately left open pending Patrick's call. It costs
 * the organizer exactly $0.01 against the "never be short" gross-up -- the identical,
 * already-accepted tradeoff documented on applyCharmPricing itself.
 *
 * Rate source (CLAUDE.md §0·EF -- confirmed in code, not assumed): getPlatformFeeRate
 * (packages/backend/src/utils/feeCalculator.ts:16-24) is NOT a flat 10% across all
 * tiers -- it's 10% for SIMPLE/null (default) and 8% for PRO/TEAMS. ADR-104 §3's
 * "confirmed 10% flat across all tiers per tierService.ts" does not match this file
 * (the function actually lives in feeCalculator.ts, not tierService.ts, and grepping
 * tierService.ts for a flat-rate constant returns zero hits). This function mirrors
 * stripeController.ts's checkout path so the suggested price always grosses up by the
 * SAME rate the checkout will actually deduct for this organizer -- a hardcoded flat
 * 10% would silently overstate the suggestion for every PRO/TEAMS organizer (real fee
 * 8%), the identical class of bug already caught once in this schema (see
 * schema.prisma's VendorBoothSaleLeg.platformFeeCents comment, ~line 5867: "the
 * disclosure that said 10% while the charge was 8%").
 *
 * FEE-PRECEDENCE FIX (2026-08-22): this function used to read `feeStructure?.feeRate ??
 * getPlatformFeeRate(subscriptionTier)` -- a global FeeStructure override for
 * listingType='*' checked BEFORE the tier rate. Every FeeStructure row in production is
 * listingType='*', feeRate=0.10 (10/10, confirmed by live query), so that order pinned
 * the gross-up to 10% for every organizer, PRO/TEAMS included, matching the identical
 * bug fixed the same day in stripeController.createPaymentIntent and
 * services/cashFeeService.ts. The FeeStructure read is removed; the tier rate is always
 * resolvable (defaults to SIMPLE for a null tier) so the wildcard row never had a
 * legitimate case to apply.
 */

import { computeCheapestForOrigin, ShippingHardBlockError, ZoneKey } from './ebayRateEstimateService';
import { roundUpToBucket, applyCharmPricing } from '../utils/shippingPriceMath';
import { getPlatformFeeRate, SubscriptionTier } from '../utils/feeCalculator';

export { ShippingHardBlockError };

export interface NativeShippingSuggestion {
  suggestedPrice: number;
  basis: 'actual' | 'dimensional' | 'cubic' | 'oversized' | 'standard_envelope';
  zone: ZoneKey;
  carrier: 'USPS' | 'UPS' | 'FEDEX';
  /** The platform fee rate actually used for the gross-up (the organizer's tier-based
   *  rate) -- matches what stripeController.ts will actually deduct at checkout for
   *  this organizer. */
  feePercentUsed: number;
}

/**
 * Resolve the effective platform fee rate for gross-up: the organizer's tier-based
 * rate, the same rate stripeController.ts's checkout path actually deducts -- so the
 * suggestion and the real deduction can never disagree. (Fee-precedence fix,
 * 2026-08-22 -- see the file header for why the FeeStructure wildcard lookup that used
 * to sit ahead of the tier rate here was removed.)
 */
async function resolveEffectivePlatformFeeRate(subscriptionTier: SubscriptionTier): Promise<number> {
  return getPlatformFeeRate(subscriptionTier ?? 'SIMPLE');
}

/**
 * Gross up a real carrier rate by a platform fee rate so the organizer's payout
 * (after the platform's cut on price + shipping combined) nets at least the real
 * label cost -- same ceiling-division shape as ebayFlatRatePolicyService.ts's
 * computeFvfFlatRate, parameterized by rate instead of hardcoding
 * EBAY_SHIPPING_FVF_RATE (kept local rather than importing computeFvfFlatRate since
 * that function hardcodes eBay's rate internally and isn't parameterized).
 */
function grossUpForPlatformFee(estimatedRate: number, feeRate: number): number {
  return Math.ceil((estimatedRate / (1 - feeRate)) * 100) / 100;
}

/**
 * Compute a suggested native-checkout shipping price for an item: same real-carrier
 * cheapest-rate engine ADR-103 built for eBay, grossed up for FindA.Sale's OWN
 * platform fee (not eBay's FVF), rounded UP into the same bounded bucket ladder eBay
 * flat-rate policies use, then charm-priced with the same shared helper, so the number a
 * real organizer sees is shaped exactly like every other shipping price in this codebase.
 *
 * This is the ONE function behind both native-checkout shipping surfaces -- the
 * organizer-facing suggestion (GET /api/items/:id/suggested-shipping-price ->
 * getSuggestedShippingPriceHandler) and ADR-106's auto-set of Item.shippingPrice
 * (computeAutoShippingPatch in itemController.ts). Preview and applied value therefore
 * cannot disagree by a cent: there is no second pricing expression to drift. Keep it that
 * way -- never inline this math at a call site.
 *
 * Throws ShippingHardBlockError (same contract as computeCheapestForOrigin/
 * estimateCheapestRate) when the item exceeds the absolute carrier max for every
 * modeled carrier -- callers MUST catch this and fail safe (never block item save on
 * it, per ADR-104 §3 Rollback/Risk: "If the suggestion endpoint errors, the frontend
 * must fail silently to the current plain-input behavior").
 */
export async function suggestNativeShippingPrice(input: {
  weightOz: number;
  dims?: { length?: number | null; width?: number | null; height?: number | null } | null;
  packageType?: string | null;
  origin: { zip?: string | null; lat?: number | null; lng?: number | null };
  subscriptionTier?: SubscriptionTier;
  categoryId?: string | null;
  /** Item's current listing price -- gates eBay Standard Envelope flat-rate eligibility.
   *  This is the item's SALE price, not the shipping price being suggested here. */
  priceUsd?: number | null;
}): Promise<NativeShippingSuggestion> {
  const [cheapest, feeRate] = await Promise.all([
    computeCheapestForOrigin({
      weightOz: input.weightOz,
      dims: input.dims ?? null,
      origin: input.origin,
      packageType: input.packageType ?? null,
      categoryId: input.categoryId ?? null,
      priceUsd: input.priceUsd ?? null,
    }),
    resolveEffectivePlatformFeeRate(input.subscriptionTier ?? null),
  ]);

  const suggestedPrice = applyCharmPricing(roundUpToBucket(grossUpForPlatformFee(cheapest.rate, feeRate)));

  return {
    suggestedPrice,
    basis: cheapest.basis,
    zone: cheapest.zone,
    carrier: cheapest.carrier,
    feePercentUsed: feeRate,
  };
}
