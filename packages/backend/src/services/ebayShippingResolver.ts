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

import { matchWeightTier, WeightTierMapping } from '../utils/ebayPolicyParser';
import { computeCheapestForOrigin } from './ebayRateEstimateService';
import { computeFvfFlatRate, roundUpToBucket } from './ebayFlatRatePolicyService';

/** Where the resolved buyer-shipping amount came from. */
export type ShippingResolutionSource =
  | 'weight-tier'
  | 'fvf-flat'
  | 'calculated'
  | 'free'
  | 'local-pickup';

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
}

/** Parse the `$X.XX` (or `$X`) embedded in a flat-tier policy name → cents, or null. */
function parsePolicyAmountCents(policyName: string | null | undefined): number | null {
  if (!policyName) return null;
  const m = policyName.match(/\$(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const dollars = parseFloat(m[1]);
  if (!isFinite(dollars)) return null;
  return Math.round(dollars * 100);
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

  // ── FLAT_TIERS organizer: weight-tier match (with gap guard) → else FVF flat ──
  if (shippingMode === 'FLAT_TIERS') {
    const tiers = (mapping?.weightTierMappings as unknown as WeightTierMapping[]) || [];
    if (tiers.length > 0 && weightOz > 0) {
      const tier = matchWeightTier(weightOz, tiers);
      if (tier) {
        // Gap-overshoot guard (mirrors resolvePoliciesForItem): an item that overshot
        // the granular tiers falls into a much-larger catch-all. weight>16oz AND the
        // matched tier covers items at least ~2x heavier → treat as a gap → FVF flat.
        const isGap = weightOz > 16 && tier.maxOz > weightOz * 2;
        if (isGap) {
          return fvfFlat();
        }
        // Real tier match: parse the embedded $X.XX from the tier name.
        const cents = parsePolicyAmountCents(tier.policyName);
        if (cents != null) {
          return {
            fulfillmentPolicyId: tier.policyId,
            buyerAmountCents: cents,
            policyName: tier.policyName,
            source: 'weight-tier',
          };
        }
        // Tier name had no parseable amount — fall back to FVF flat compute.
        return fvfFlat();
      }
    }
    // No tier match (or no tiers / no weight) → FVF flat.
    return fvfFlat();
  }

  // ── CALCULATED mode: buyer pays the real rate at checkout (representative number) ──
  return {
    fulfillmentPolicyId: null,
    buyerAmountCents: dollarsToCents(cheapest.rate),
    policyName: null,
    source: 'calculated',
  };
}
