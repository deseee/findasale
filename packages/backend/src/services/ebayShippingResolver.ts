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
 * (roadmap #624) The one case where it DOES return a real eBay fulfillment policy id is
 * eBay Standard Envelope: those policies already exist on the organizer's own eBay
 * account, so nothing is provisioned — the policy is looked up (read-only) and returned
 * as-is. See the tryStandardEnvelopePolicy helper below — it is shared by BOTH the
 * FLAT_TIERS and CALCULATED branches, so envelope-eligible items resolve identically
 * whichever shipping mode the organizer is on.
 *
 * (2026-08-16) The manual weight-tier ladder is GONE from this file. It is neither
 * read nor parsed here any more: every non-override path resolves through the same
 * freshly-computed carrier rate the push path uses. The 'weight-tier' member of
 * ShippingResolutionSource is retained only because stored/persisted values may still
 * carry it; nothing in this file produces it.
 *
 * (2026-08-16) Precedence is now MODE-AGNOSTIC up front: local-pickup -> item policy
 * override -> classification override -> category override -> UNKNOWN safety policy ->
 * free-shipping opt-in, and only THEN the FLAT_TIERS / CALCULATED fork. The override
 * rules previously sat inside the FLAT_TIERS branch, so CALCULATED organizers (the
 * schema default) never got them.
 */

import { computeCheapestForOrigin, ShippingHardBlockError } from './ebayRateEstimateService';
import { computeFvfFlatRate, roundUpToBucket, applyCharmPricing } from './ebayFlatRatePolicyService';
import { computeCalculatedWithHandling } from './ebayCalculatedPolicyService';
import {
  matchStandardEnvelopePolicy,
  EbayFulfillmentPolicySummary,
} from '../utils/ebayPolicyParser';

/** Where the resolved buyer-shipping amount came from. */
export type ShippingResolutionSource =
  | 'weight-tier'
  | 'fvf-flat'
  /** (roadmap #624) The item genuinely qualifies for eBay's Standard Envelope program AND
   *  the organizer has a real matching envelope policy on their eBay account -- the buyer
   *  is charged that policy's own rate, not a recomputed FindA.Sale flat fee. */
  | 'standard-envelope'
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
  /** (roadmap #624) True when the item genuinely qualified for eBay Standard Envelope but
   *  NO real organizer-configured envelope policy could be matched -- either because no
   *  policy fetcher was supplied (cheap local recompute paths) or the organizer has none
   *  configured. The result falls back to this mode's own computed fee (FLAT_TIERS: the
   *  FindA.Sale flat fee; CALCULATED: calculated-with-handling), but callers that
   *  compare against a STORED amount (the drift cron) must not treat that fallback as
   *  authoritative: the live listing may legitimately sit on the organizer's real envelope
   *  policy at a different price, and re-pinning it would churn every run. */
  standardEnvelopeUnmatched?: boolean;
}

/** Minimal mapping shape needed to resolve shipping (subset of EbayPolicyMapping). */
export interface ShippingResolverMapping {
  shippingMode?: string | null;
  freeShippingOptIn?: boolean | null;
  /** @deprecated ADR-102 -- the weight-tier ladder is retired and this value is IGNORED
   *  by every code path in this file. Kept on the interface only so callers that still
   *  pass it (e.g. jobs/resyncShippingDrift.ts) keep compiling; remove once they stop. */
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
  /** Item's current listing price -- gates eBay Standard Envelope flat-rate eligibility
   *  (evaluateStandardEnvelope requires priceUsd < the envelope max -- see
   *  ebayRateEstimateService.ts). */
  price?: number | null;
  /** (2026-08-14) Whether the organizer has explicitly confirmed packageWeightOz/dims
   *  (vs. an unconfirmed AI estimate). OPTIONAL and permissive-by-default: callers that
   *  don't pass it (the shipping-preview endpoints, where the caller-provided numbers ARE
   *  the confirmation for preview purposes) are unaffected. Real DB-backed callers
   *  (resolvePoliciesForItem's push/resync paths) pass the real flag so an unconfirmed,
   *  possibly-fabricated AI estimate (see ebayController.ts's UNKNOWN-fallback comment for
   *  the "guitar priced from a 3oz/5x4x2in guess" example) can never silently escape the
   *  organizer's UNKNOWN-classification safety policy. */
  packageConfirmedByOrganizer?: boolean | null;
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
  /** (roadmap #624) Optional LAZY fetcher for the organizer's live eBay fulfillment
   *  policies. Invoked at most once, and ONLY when the winning carrier candidate is a
   *  genuine eBay Standard Envelope match -- so callers that pass it pay nothing on the
   *  99% of items that aren't envelope-eligible. Applies in BOTH shipping modes. When
   *  omitted, envelope-eligible items fall back to that mode's own computed fee with
   *  standardEnvelopeUnmatched = true (the cheap local recompute in the drift cron
   *  deliberately omits it -- no eBay call). */
  fetchFulfillmentPolicies?: () => Promise<EbayFulfillmentPolicySummary[]>;
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

  // ── MODE-AGNOSTIC ROUTING PREFIX (2026-08-16) ─────────────────────────────
  // Every rule below applies to BOTH shipping modes. The classification /
  // category / UNKNOWN rules used to live INSIDE the FLAT_TIERS branch only, so a
  // CALCULATED-mode organizer's explicit routing choices were silently ignored --
  // and CALCULATED is the schema default for every new organizer. Mirrors the
  // identical reorder in resolvePoliciesForItem (ebayController.ts): these two
  // files are the preview/push twins named in this file's header contract and must
  // never disagree about precedence.

  // 1. Item-level local-pickup override — buyer pays nothing for shipping.
  if (item.ebayShippingOverride === 'LOCAL_PICKUP_ONLY') {
    return { fulfillmentPolicyId: null, buyerAmountCents: 0, policyName: null, source: 'local-pickup' };
  }

  // 2. Item-level custom eBay fulfillment-policy override — the buyer's shipping is set
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

  // 3. Shipping-classification override (oddball items the organizer routed by hand).
  if (item.ebayShippingClassification === 'HEAVY_OVERSIZED' && mapping?.heavyOversizedPolicyId) {
    return { fulfillmentPolicyId: mapping.heavyOversizedPolicyId, buyerAmountCents: 0, policyName: null, source: 'custom-override' };
  }
  if (item.ebayShippingClassification === 'FRAGILE' && mapping?.fragilePolicyId) {
    return { fulfillmentPolicyId: mapping.fragilePolicyId, buyerAmountCents: 0, policyName: null, source: 'custom-override' };
  }

  // 4. Category override (exact ebayCategoryId match).
  const categoryOverrides = (mapping?.categoryOverrides as any[]) || [];
  if (item.ebayCategoryId) {
    const categoryMatch = categoryOverrides.find((c: any) => c.categoryId === item.ebayCategoryId);
    if (categoryMatch) {
      return { fulfillmentPolicyId: categoryMatch.policyId, buyerAmountCents: 0, policyName: null, source: 'custom-override' };
    }
  }

  // 5. UNKNOWN-classification safety policy. (2026-08-14) Only fires when we genuinely
  // have nothing to compute a rate from -- mirrors the same gate in ebayController.ts
  // resolvePoliciesForItem (the live push/resync path) so preview and push can never
  // disagree, per this file's own header contract. See that file's comment for the
  // full root-cause writeup (classifyEbayShipping's narrow keyword list vs. a real
  // organizer-measured weight+dims).
  const hasMeasuredPackage = weightOz > 0 && dims != null && item.packageConfirmedByOrganizer !== false;
  if (
    (item.ebayShippingClassification === 'UNKNOWN' || !item.ebayShippingClassification) &&
    mapping?.unknownPolicyId &&
    !hasMeasuredPackage
  ) {
    return { fulfillmentPolicyId: mapping.unknownPolicyId, buyerAmountCents: 0, policyName: null, source: 'custom-override' };
  }

  // 6. Free-shipping opt-in — buyer pays $0, organizer absorbs the label.
  // Deliberately BELOW the override rules above (it used to sit above them): a blanket
  // "I'll absorb shipping" opt-in must not silently promise free shipping on an item the
  // organizer explicitly routed to a heavy/oversized or local-pickup-only policy.
  if (mapping?.freeShippingOptIn) {
    return { fulfillmentPolicyId: null, buyerAmountCents: 0, policyName: null, source: 'free' };
  }

  const shippingMode = mapping?.shippingMode || 'CALCULATED';

  // (roadmap #624, 2026-08-11) Shared eBay Standard Envelope lookup — used by BOTH
  // shipping modes. Only ever called AFTER computeCheapestForOrigin has already returned
  // basis === 'standard_envelope'; evaluateStandardEnvelope (ebayRateEstimateService)
  // owns the authoritative category / weight / price / dimension gates, so this can never
  // fire on an item that merely happens to be cheap. Returns the organizer's real
  // envelope policy when one matches, or null — in which case the caller keeps its own
  // computed rate and flags standardEnvelopeUnmatched.
  //
  // Extracted from the (previously FLAT_TIERS-only) fvfFlat helper so CALCULATED-mode
  // organizers get identical treatment from one implementation — the two branches cannot
  // drift apart.
  const tryStandardEnvelopePolicy = async (): Promise<ResolveItemShippingResult | null> => {
    if (!input.fetchFulfillmentPolicies) return null;
    try {
      const policies = await input.fetchFulfillmentPolicies();
      const match = matchStandardEnvelopePolicy(weightOz, item.price ?? null, policies || []);
      if (match && match.rateUsd != null) {
        return {
          fulfillmentPolicyId: match.policyId,
          buyerAmountCents: dollarsToCents(match.rateUsd),
          policyName: match.policyName,
          source: 'standard-envelope',
        };
      }
      // Real opportunity the organizer is missing: the item qualifies for eBay's
      // envelope program but they have no matching policy set up. Logged (not
      // silent) so it is visible which organizers should be prompted to add one.
      console.warn(
        `[eBay StdEnv] envelope-eligible item has NO matching organizer policy — falling back to the FindA.Sale computed rate (mode=${shippingMode}, weightOz=${weightOz}, price=${item.price ?? 'null'}, categoryId=${item.ebayCategoryId ?? 'null'}, policiesSeen=${(policies || []).length})`
      );
    } catch (fetchErr) {
      // A failed policy fetch must never break pricing -- fall through to the caller's
      // computed rate, which is the pre-existing, always-safe answer.
      console.warn(
        `[eBay StdEnv] fulfillment policy lookup failed, falling back to the FindA.Sale computed rate: ${(fetchErr as Error)?.message || fetchErr}`
      );
    }
    return null;
  };

  // Helper: build the FVF-flat result (gross up cheapest rate, bucket it). Computes
  // the cheapest carrier rate LAZILY, only when actually reached -- override paths
  // above (local-pickup, custom-override, free, FLAT_TIERS oddball overrides) return
  // before this runs, so they never pay for a rate computation they don't use. ADR-103
  // Phase 4: computeCheapestForOrigin can throw ShippingHardBlockError for an item that
  // exceeds every carrier's absolute max -- caught here and surfaced as a 'hard-blocked'
  // result rather than letting it propagate (an override path shouldn't be affected by
  // a rate computation it never needed, and a genuinely computed-rate path must not
  // silently underprice or crash).
  //
  // (roadmap #624, 2026-08-11) One exception now sits IN FRONT of the flat compute: when
  // the winning candidate is a genuine eBay Standard Envelope match (cheapest.basis ===
  // 'standard_envelope' -- evaluateStandardEnvelope owns the real category/weight/price/
  // dimension gates, so this branch never fires on an item that merely happens to be
  // cheap), eBay prices the item through the SELLER'S OWN envelope policy. Recomputing a
  // grossed-up FindA.Sale flat fee for it overcharged the buyer and ignored a policy the
  // organizer had already configured on their eBay account. So: look up the organizer's
  // real envelope policy and return THAT (real policy id, real name, real rate). If they
  // have none configured -- or no fetcher was supplied -- fall back to the flat compute
  // exactly as before, flagged via standardEnvelopeUnmatched so the gap is visible in logs
  // and the drift cron doesn't churn against it.
  const fvfFlat = async (): Promise<ResolveItemShippingResult> => {
    try {
      const cheapest = await computeCheapestForOrigin({ weightOz, dims, origin, packageType: item.packageType ?? null, categoryId: item.ebayCategoryId ?? null, priceUsd: item.price ?? null });

      let standardEnvelopeUnmatched = false;
      if (cheapest.basis === 'standard_envelope') {
        const envelope = await tryStandardEnvelopePolicy();
        if (envelope) return envelope;
        standardEnvelopeUnmatched = true;
      }

      const flatRate = applyCharmPricing(roundUpToBucket(computeFvfFlatRate(cheapest.rate)));
      return {
        fulfillmentPolicyId: null,
        buyerAmountCents: dollarsToCents(flatRate),
        policyName: `FindA.Sale Flat $${flatRate.toFixed(2)}`,
        source: 'fvf-flat',
        ...(standardEnvelopeUnmatched ? { standardEnvelopeUnmatched: true } : {}),
      };
    } catch (err) {
      if (err instanceof ShippingHardBlockError) {
        return { fulfillmentPolicyId: null, buyerAmountCents: 0, policyName: null, source: 'hard-blocked', hardBlockReason: err.message };
      }
      throw err;
    }
  };

  // ── FLAT_TIERS organizer (ADR-102, roadmap #622): the always-fresh computed
  // rate. The oddball-item manual overrides that used to live here were lifted into
  // the mode-agnostic prefix above (2026-08-16) so CALCULATED organizers get them
  // too. The old weightTierMappings ladder match is retired -- it went stale (0-1lb,
  // 7-45lb coverage gaps) from being hand-maintained; computeCheapestForOrigin can't
  // develop a gap because it's computed fresh every time.
  if (shippingMode === 'FLAT_TIERS') {
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
  //
  // (roadmap #624, 2026-08-11 — CALCULATED parity) One exception sits IN FRONT of the
  // calculated-with-handling compute, exactly as it does for FLAT_TIERS above: when the
  // winning candidate is a genuine eBay Standard Envelope match, eBay prices the item
  // through the SELLER'S OWN flat envelope policy. Leaving such an item on a calculated
  // policy is strictly worse than the FLAT_TIERS bug this mirrors — eBay's calculated
  // rate at checkout is a real parcel rate (Ground Advantage etc.), never the ~$1.03–$1.65
  // envelope rate, so the buyer is quoted several dollars over a service the organizer
  // has already configured. shippingMode is a FindA.Sale routing preference, not an eBay
  // constraint: the fulfillment policy is chosen per-offer, so assigning the organizer's
  // real flat envelope policy to one item is fully compatible with a CALCULATED-mode
  // organizer (the same is already true of the custom-override / local-pickup paths above).
  // If they have no envelope policy configured -- or no fetcher was supplied -- fall back
  // to calculated-with-handling exactly as before, flagged via standardEnvelopeUnmatched
  // so the drift cron doesn't churn against it.
  try {
    const cheapest = await computeCheapestForOrigin({ weightOz, dims, origin, packageType: item.packageType ?? null, categoryId: item.ebayCategoryId ?? null, priceUsd: item.price ?? null });

    let standardEnvelopeUnmatched = false;
    if (cheapest.basis === 'standard_envelope') {
      const envelope = await tryStandardEnvelopePolicy();
      if (envelope) return envelope;
      standardEnvelopeUnmatched = true;
    }

    const { bucketedRate, handlingCost } = computeCalculatedWithHandling(cheapest.rate);
    return {
      fulfillmentPolicyId: null,
      buyerAmountCents: dollarsToCents(bucketedRate + handlingCost),
      policyName: `FindA.Sale Calculated (+$${handlingCost.toFixed(2)} handling)`,
      source: 'calculated',
      ...(standardEnvelopeUnmatched ? { standardEnvelopeUnmatched: true } : {}),
    };
  } catch (err) {
    if (err instanceof ShippingHardBlockError) {
      return { fulfillmentPolicyId: null, buyerAmountCents: 0, policyName: null, source: 'hard-blocked', hardBlockReason: err.message };
    }
    throw err;
  }
}
