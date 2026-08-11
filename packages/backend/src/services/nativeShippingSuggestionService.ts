/**
 * nativeShippingSuggestionService — ADR-104 §3: computes a suggested shipping price
 * for FindA.Sale's own native Stripe checkout (Item.shippingPrice), so an organizer
 * typing a shipping amount isn't unknowingly eating FindA.Sale's platform fee on top
 * of their real carrier cost with zero visibility.
 *
 * Reuses the SAME cheapest-carrier rate engine ADR-103 built for eBay
 * (estimateCheapestRate/computeCheapestForOrigin in ebayRateEstimateService.ts) and
 * the SAME bucket-rounding helper (roundUpToBucket in ebayFlatRatePolicyService.ts,
 * already exported -- no change needed there). The only thing genuinely different
 * from the eBay flat-rate pipeline is the gross-up rate: FindA.Sale's own platform
 * fee, NOT eBay's 13.6% FVF.
 *
 * Rate source (CLAUDE.md §0·EF -- confirmed in code, not assumed): getPlatformFeeRate
 * (packages/backend/src/utils/feeCalculator.ts:16-24) is NOT a flat 10% across all
 * tiers -- it's 10% for SIMPLE/null (default) and 8% for PRO/TEAMS. ADR-104 §3's
 * "confirmed 10% flat across all tiers per tierService.ts" does not match this file
 * (the function actually lives in feeCalculator.ts, not tierService.ts, and grepping
 * tierService.ts for a flat-rate constant returns zero hits). The live checkout path
 * itself (stripeController.ts:625-626) never hardcodes 10% either -- it reads
 * `feeStructure?.feeRate ?? getPlatformFeeRate(organizer.subscriptionTier)` (a global
 * FeeStructure override table, default 0.10, then the tier-based function). This
 * function mirrors that EXACT precedence so the suggested price always grosses up by
 * the SAME rate the checkout will actually deduct for this organizer -- a hardcoded
 * flat 10% would silently overstate the suggestion for every PRO/TEAMS organizer
 * (real fee 8%), the identical class of bug already caught once in this schema (see
 * schema.prisma's VendorBoothSaleLeg.platformFeeCents comment, ~line 5867: "the
 * disclosure that said 10% while the charge was 8%").
 */

import { prisma } from '../lib/prisma';
import { computeCheapestForOrigin, ShippingHardBlockError, ZoneKey } from './ebayRateEstimateService';
import { roundUpToBucket } from './ebayFlatRatePolicyService';
import { getPlatformFeeRate, SubscriptionTier } from '../utils/feeCalculator';

export { ShippingHardBlockError };

export interface NativeShippingSuggestion {
  suggestedPrice: number;
  basis: 'actual' | 'dimensional' | 'cubic' | 'oversized' | 'standard_envelope';
  zone: ZoneKey;
  carrier: 'USPS' | 'UPS' | 'FEDEX';
  /** The platform fee rate actually used for the gross-up (global FeeStructure
   *  override if set, else the organizer's tier-based rate) -- matches what
   *  stripeController.ts will actually deduct at checkout for this organizer. */
  feePercentUsed: number;
}

/**
 * Resolve the effective platform fee rate for gross-up, using the EXACT SAME
 * precedence stripeController.ts's checkout path uses at L625-626 (global
 * FeeStructure override for listingType "*", falling back to the organizer's
 * tier-based rate) -- so the suggestion and the real deduction can never disagree.
 */
async function resolveEffectivePlatformFeeRate(subscriptionTier: SubscriptionTier): Promise<number> {
  const feeStructure = await prisma.feeStructure.findFirst({ where: { listingType: '*' } });
  return feeStructure?.feeRate ?? getPlatformFeeRate(subscriptionTier ?? 'SIMPLE');
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
 * platform fee (not eBay's FVF), then rounded UP into the same bounded bucket ladder
 * eBay flat-rate policies use, so the number a real organizer sees is priced the same
 * "never be short" way everywhere else in this codebase.
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
}): Promise<NativeShippingSuggestion> {
  const [cheapest, feeRate] = await Promise.all([
    computeCheapestForOrigin({
      weightOz: input.weightOz,
      dims: input.dims ?? null,
      origin: input.origin,
      packageType: input.packageType ?? null,
    }),
    resolveEffectivePlatformFeeRate(input.subscriptionTier ?? null),
  ]);

  const suggestedPrice = roundUpToBucket(grossUpForPlatformFee(cheapest.rate, feeRate));

  return {
    suggestedPrice,
    basis: cheapest.basis,
    zone: cheapest.zone,
    carrier: cheapest.carrier,
    feePercentUsed: feeRate,
  };
}
