/**
 * ebayShippingResolver — the SINGLE source of truth for "what shipping does this
 * item charge the buyer?". Both the listing-push path (resolvePoliciesForItem) and
 * the shipping PREVIEW (getShippingNetPreview / getSuggestedPriceForMargin) call this
 * so they can never disagree.
 *
 * ADR: claude_docs/feature-notes/adr-shipping-policy-resync.md (Part A).
 *
 * It mirrors the FLAT_TIERS / free / FVF-flat / calculated decision already encoded
 * in resolvePoliciesForItem. It does NOT provision eBay policies — for the FVF-flat
 * case it returns the computed amount + name with a null fulfillmentPolicyId (the
 * preview doesn't need the eBay id; the push path provisions/looks-up the id itself).
 *
 * Weight-tier amount is parsed from the `$X.XX` embedded in the tier's policyName
 * (all current tiers carry it). If a tier name has no parseable amount, we fall
 * back to the FVF-flat compute so the preview never shows a bare/zero number.
 */

import { computeCheapestForOrigin } from './ebayRateEstimateService';
import { computeFvfFlatRate, roundUpToBucket } from './ebayFlatRatePolicyService';

/** Where the resolved buyer-shipping amount came from. */
export type ShippingResolutionSource =
  | 'weight-tier'
  | 'fvf-flat'
  | 'calculated'
  | 'free'
  | 'local-pickup'
  | 'custom-override';

export interface ResolveItemShippingResult {
  /** eBay fulfillment policy id when known (weight-tier match); null for preview-only paths. */
  fulfillmentPolicyId: string | null;
  /** Buyer-paid shipping in cents. 0 for free / local-pickup. */
  buyerAmountCents: number;
  /** Human-readable policy name for the flat policy, or null when not a flat policy. */
  policyName: string | null;
  /** Which decision branch produced the amount. */
  source: ShippingResolutionSource;
}

/** Minimal mapping shape needed to resolve shipping (subset of EbayPolicyMapping). */
export interface ShippingResolverMapping {
  shippingMode?: string | null;
  freeShippingOptIn?: boolean | null;
  weightTierMappings?: unknown;
  /** ADR-102 (roadmap #622): oddball-item manual overrides, checked before the computed rate. */
  categoryOverrides?: unknown;
  heavyOversizedPolicyId?: string | null;
  fragilePolicyId?: string | null;
  unknownPolicyId?: string | null;
}

/** Minimal organizer shape needed to resolve shipping (origin for rate lookup). */
export interface ShippingResolverOrganizer {
  lat?: number | null;
  lng?: number | null;
}

/** Minimal item shape needed to resolve shipping. */
export interface ShippingResolverItem {
  packageWeightOz?: number | null;
  packageLengthIn?: number | null;
  packageWidthIn?: number | null;
  packageHeightIn?: number | null;
  ebayShippingOverride?: string | null;
  /** Organizer-picked eBay fulfillment policy for THIS item (null = Auto). */
  ebayFulfillmentPolicyOverrideId?: string | null;
  /** ADR-102 (roadmap #622): used to check oddball-item overrides before the computed rate. */
  ebayShippingClassification?: string | null;
  ebayCategoryId?: string | null;
}

/** Round a dollar amount to whole cents (avoids float drift before *100). */
function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Resolve what shipping an item charges the buyer, mirroring resolvePoliciesForItem.
 *
 * Accepts the organizer origin, the policy mapping, the item, and an optional fromZip
 * override — matching what the preview controllers already have on hand. `conn` is not
 * required here (the preview doesn't need the provisioned eBay policy id); the push
 * path keeps owning policy provisioning.
 */
export async function resolveItemShipping(input: {
  organizer: ShippingResolverOrganizer;
  mapping: ShippingResolverMapping | null | undefined;
  item: ShippingResolverItem;
  fromZip?: string | null;
}): Promise<ResolveItemShippingResult> {
  const { organizer, mapping, item } = input;
  const fromZip = input.fromZip ?? null;

  const weightOz = item.packageWeightOz != null ? item.packageWeightOz : 0;
  const dims =
    item.packageLengthIn != null && item.packageWidthIn != null && item.packageHeightIn != null
      ? {
          length: Number(item.packageLengthIn),
          width: Number(item.packageWidthIn),
          height: Number(item.packageHeightIn),
        }
      : null;

  const origin = { zip: fromZip, lat: organizer.lat ?? null, lng: organizer.lng ?? null };

  // Item-level local-pickup override — buyer pays nothing for shipping.
  if (item.ebayShippingOverride === 'LOCAL_PICKUP_ONLY') {
    return { fulfillmentPolicyId: null, buyerAmountCents: 0, policyName: null, source: 'local-pickup' };
  }

  // Item-level custom eBay fulfillment-policy override — the buyer's shipping is set
  // by the organizer's chosen eBay policy, not our calculated/flat model. We don't
  // know the buyer amount here, so surface 0 + the override source (the preview treats
  // this as "set by your eBay policy" rather than fabricating a number).
  if (item.ebayFulfillmentPolicyOverrideId) {
    return {
      fulfillmentPolicyId: item.ebayFulfillmentPolicyOverrideId,
      buyerAmountCents: 0,
      policyName: null,
      source: 'custom-override',
    };
  }

  // Free-shipping opt-in — buyer pays $0, organizer absorbs the label.
  if (mapping?.freeShippingOptIn) {
    return { fulfillmentPolicyId: null, buyerAmountCents: 0, policyName: null, source: 'free' };
  }

  const shippingMode = mapping?.shippingMode || 'CALCULATED';

  // Lazily computed cheapest carrier rate (reused by fvf-flat + calculated branches).
  const cheapest = computeCheapestForOrigin({ weightOz, dims, origin });

  // Helper: build the FVF-flat result (gross up cheapest rate, bucket it).
  const fvfFlat = (): ResolveItemShippingResult => {
    const flatRate = roundUpToBucket(computeFvfFlatRate(cheapest.rate));
    return {
      fulfillmentPolicyId: null,
      buyerAmountCents: dollarsToCents(flatRate),
      policyName: `FindA.Sale Flat $${flatRate.toFixed(2)}`,
      source: 'fvf-flat',
    };
  };

  // ── FLAT_TIERS organizer (ADR-102, roadmap #622): oddball-item manual overrides
  // (classification / category) win first, then the always-fresh computed rate.
  // This mirrors resolvePoliciesForItem's new cascade (ebayController.ts) -- this
  // file's own job is to never disagree with that path, so it has to apply the same
  // precedence. The old weightTierMappings ladder match is retired (it went stale --
  // 0-1lb, 7-45lb coverage gaps -- from being hand-maintained); computeCheapestForOrigin
  // can't develop a gap because it's computed fresh every time.
  if (shippingMode === 'FLAT_TIERS') {
    if (item.ebayShippingClassification === 'HEAVY_OVERSIZED' && mapping?.heavyOversizedPolicyId) {
      return { fulfillmentPolicyId: mapping.heavyOversizedPolicyId, buyerAmountCents: 0, policyName: null, source: 'custom-override' };
    }
    if (item.ebayShippingClassification === 'FRAGILE' && mapping?.fragilePolicyId) {
      return { fulfillmentPolicyId: mapping.fragilePolicyId, buyerAmountCents: 0, policyName: null, source: 'custom-override' };
    }
    const categoryOverrides = (mapping?.categoryOverrides as any[]) || [];
    if (item.ebayCategoryId) {
      const match = categoryOverrides.find((c: any) => c.categoryId === item.ebayCategoryId);
      if (match) {
        return { fulfillmentPolicyId: match.policyId, buyerAmountCents: 0, policyName: null, source: 'custom-override' };
      }
    }
    if ((item.ebayShippingClassification === 'UNKNOWN' || !item.ebayShippingClassification) && mapping?.unknownPolicyId) {
      return { fulfillmentPolicyId: mapping.unknownPolicyId, buyerAmountCents: 0, policyName: null, source: 'custom-override' };
    }
    // No oddball override matched — always use the computed rate (ADR-102 primary path).
    return fvfFlat();
  }

  // ── CALCULATED mode: gross up the cheapest rate through the FVF-flat helper so the
  // preview number equals what the buyer is actually charged. This mirrors the push
  // path's ensureFvfFlatRatePolicy (roundUpToBucket(computeFvfFlatRate(cheapest.rate)))
  // so preview == charged; returning the bare carrier rate here understated it. ──
  return fvfFlat();
}
