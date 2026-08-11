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

import { computeCheapestForOrigin, ShippingHardBlockError } from './ebayRateEstimateService';
import { computeFvfFlatRate, roundUpToBucket } from './ebayFlatRatePolicyService';
import { computeCalculatedWithHandling } from './ebayCalculatedPolicyService';

/** Where the resolved buyer-shipping amount came from. */
export type ShippingResolutionSource =
  | 'weight-tier'
  | 'fvf-flat'
  | 'calculated'
  | 'free'
  | 'local-pickup'
  | 'custom-override'
  /** ADR-103 Phase 4: item exceeds the absolute carrier max for every modeled
   *  carrier -- see hardBlockReason for detail. buyerAmountCents is 0 here but
   *  MUST NOT be treated as free shipping; callers should surface hardBlockReason. */
  | 'hard-blocked';

export interface ResolveItemShippingResult {
  /** eBay fulfillment policy id when known (weight-tier match); null for preview-only paths. */
  fulfillmentPolicyId: string | null;
  /** Buyer-paid shipping in cents. 0 for free / local-pickup. */
  buyerAmountCents: number;
  /** Human-readable policy name for the flat policy, or null when not a flat policy. */
  policyName: string | null;
  /** Which decision branch produced the amount. */
  source: ShippingResolutionSource;
  /** ADR-103 Phase 4: set (non-null) only when source === 'hard-blocked' -- a clear,
   *  human-readable reason the item cannot be auto-priced. */
  hardBlockReason?: string | null;
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
  /** ADR-103 Phase 4: packaging-attribute input to the AHS surcharge trigger. */
  packageType?: string | null;
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

  // Helper: build the FVF-flat result (gross up cheapest rate, bucket it). Computes
  // the cheapest carrier rate LAZILY, only when actually reached -- override paths
  // above (local-pickup, custom-override, free, FLAT_TIERS oddball overrides) return
  // before this runs, so they never pay for a rate computation they don't use. ADR-103
  // Phase 4: computeCheapestForOrigin can throw ShippingHardBlockError for an item that
  // exceeds every carrier's absolute max -- caught here and surfaced as a 'hard-blocked'
  // result rather than letting it propagate (an override path shouldn't be affected by
  // a rate computation it never needed, and a genuinely computed-rate path must not
  // silently underprice or crash).
  const fvfFlat = async (): Promise<ResolveItemShippingResult> => {
    try {
      const cheapest = await computeCheapestForOrigin({ weightOz, dims, origin, packageType: item.packageType ?? null });
      const flatRate = roundUpToBucket(computeFvfFlatRate(cheapest.rate));
      return {
        fulfillmentPolicyId: null,
        buyerAmountCents: dollarsToCents(flatRate),
        policyName: `FindA.Sale Flat $${flatRate.toFixed(2)}`,
        source: 'fvf-flat',
      };
    } catch (err) {
      if (err instanceof ShippingHardBlockError) {
        return { fulfillmentPolicyId: null, buyerAmountCents: 0, policyName: null, source: 'hard-blocked', hardBlockReason: err.message };
      }
      throw err;
    }
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

  // ── CALCULATED mode: mirror resolvePoliciesForItem's real routing precedence
  // (ebayController.ts ~line 4178). The push path's PRIMARY route here is real-
  // calculated-shipping-plus-handling (ensureCalculatedPolicyWithHandling in
  // ebayCalculatedPolicyService.ts) -- FVF-flat is only its fallback when eBay
  // policy provisioning fails. The preview can't know in advance whether
  // provisioning will succeed on push, so it shows the PRIMARY number, computed
  // via the SAME shared formula (computeCalculatedWithHandling) the push path
  // uses -- not re-derived through the FVF-flat helper's gross-up-then-bucket
  // order, which rounds to a different total than bucket-then-gross-up (bucketing
  // is a nonlinear step function, so operation order matters). This does NOT call
  // ensureCalculatedPolicyWithHandling itself, since that provisions a real eBay
  // fulfillment policy (network + DB writes) on every call -- exactly what this
  // file's header says the preview must never do.
  try {
    const cheapest = await computeCheapestForOrigin({ weightOz, dims, origin, packageType: item.packageType ?? null });
    const { bucketedRate, handlingCost } = computeCalculatedWithHandling(cheapest.rate);
    return {
      fulfillmentPolicyId: null,
      buyerAmountCents: dollarsToCents(bucketedRate + handlingCost),
      policyName: `FindA.Sale Calculated (+$${handlingCost.toFixed(2)} handling)`,
      source: 'calculated',
    };
  } catch (err) {
    if (err instanceof ShippingHardBlockError) {
      return { fulfillmentPolicyId: null, buyerAmountCents: 0, policyName: null, source: 'hard-blocked', hardBlockReason: err.message };
    }
    throw err;
  }
}
