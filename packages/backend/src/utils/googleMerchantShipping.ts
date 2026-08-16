/**
 * googleMerchantShipping.ts — Feature #463: per-item shipping for the Google Merchant feed
 *
 * (2026-08-16) REPOINTED off the retired weight-tier ladder. This file used to price
 * every feed row by running the item's billable ounces through
 * EbayPolicyMapping.weightTierMappings and parsing the `$X.XX` out of the matched rung's
 * NAME. ADR-102 had already retired that ladder from eBay routing, but the feed kept
 * consulting it, so a hand-maintained table nothing else read was still setting the price
 * advertised to real Google Shopping shoppers -- and matchWeightTier returns the FIRST
 * rung with maxOz >= weight, so a ladder gap advertised the NEXT rung up. On the live
 * Artifact ladder the 111oz -> 720oz gap meant a 10 lb item was advertised at the 45 lb
 * FedEx catch-all price. A price you can't honor is worse than no listing.
 *
 * It now resolves through resolveItemShipping (ebayShippingResolver.ts) — the SAME single
 * source of truth the eBay push path and the shipping preview use. One rate model, three
 * surfaces, no third table to keep in sync and no gap to fall into: the rate is computed
 * fresh from real carrier tables on every build.
 *
 * Shippability is still OPT-IN per organizer: no EbayPolicyMapping row => the item is
 * DROPPED from the feed. We never promise shipping a seller can't honor and never emit a
 * flat default.
 *
 * computeItemShipping(item, policyMapping, origin) returns the shipping cells for the row,
 * or null to signal the item must be EXCLUDED from the feed.
 *
 * Decision order (first match wins):
 *   a. ebayShippingOverride in {LOCAL_PICKUP_ONLY, DONT_LIST} -> null (exclude — organizer's
 *      explicit pickup-only call)
 *   b. FREIGHT check -> null ONLY for genuine freight/LTL items, judged by REAL package
 *      data (weight > 150 lb, or oversized dimensions). Unknown weight/dims never excludes
 *      here — almost everything parcel-ships.
 *   c. no EbayPolicyMapping at all -> null (exclude; shippability is opt-in)
 *   d. packageWeightOz set -> resolveItemShipping -> real computed rate, label "flat"
 *   e. else category->estimated oz -> SAME resolver -> real computed rate, label "estimated"
 *
 * Any resolver outcome whose buyer price we cannot state honestly — an organizer-routed
 * custom policy, local pickup, or a carrier hard-block — EXCLUDES the item rather than
 * guessing a number. Only 'free' may emit $0.00.
 */

import { resolveItemShipping } from '../services/ebayShippingResolver';

/**
 * Parcel-carrier ceiling: 150 lb = 2400 oz. Anything heavier genuinely requires
 * freight/LTL (pallet) and is excluded from the parcel-shipping feed.
 */
const FREIGHT_WEIGHT_OZ = 2400;

/**
 * UPS/parcel oversize limits. A package is "oversized" (freight) when any single
 * dimension exceeds 108 in, OR length + 2*(width+height) exceeds 165 in.
 */
const MAX_SINGLE_DIMENSION_IN = 108;
const MAX_LENGTH_PLUS_GIRTH_IN = 165;

/**
 * Minimal organizer EbayPolicyMapping shape needed for feed shipping. Structurally a
 * subset of ShippingResolverMapping so it can be handed straight to resolveItemShipping.
 * (2026-08-16) weightTierMappings is gone from this shape — the ladder is not read here
 * any more. The column still exists in the database; nothing prices from it.
 */
export interface FeedPolicyMapping {
  shippingMode?: string | null;
  freeShippingOptIn?: boolean | null;
  categoryOverrides?: unknown;
  heavyOversizedPolicyId?: string | null;
  fragilePolicyId?: string | null;
  unknownPolicyId?: string | null;
}

/** Origin the carrier rate is computed FROM (organizer geo + the sale's ZIP). */
export interface ShippingFeedOrigin {
  lat?: number | null;
  lng?: number | null;
  zip?: string | null;
}

/** Item fields needed to compute shipping. */
export interface ShippingFeedItem {
  category: string | null;
  tags: string[];
  ebayShippingOverride: string | null;
  packageWeightOz: number | null;
  /** (2026-08-16) Feeds the resolver's oddball-item override rules — an item the
   *  organizer routed to a hand-picked policy is EXCLUDED rather than guessed at. */
  ebayShippingClassification?: string | null;
  ebayCategoryId?: string | null;
  /** Gates eBay Standard Envelope eligibility inside the resolver. */
  price?: number | null;
  // Package dimensions (inches) — used for the freight/oversize check. Prisma
  // Decimal columns may arrive as Decimal objects, so we coerce defensively.
  packageLengthIn: number | null;
  packageWidthIn: number | null;
  packageHeightIn: number | null;
}

export interface ComputedShipping {
  shipping: string; // e.g. "US::Standard:6.99 USD"
  shippingLabel: string; // "flat" | "estimated"
  shippingWeight?: string; // e.g. "12 oz"
  shipsFromCountry: string; // "US"
  maxHandlingTime: string; // "3"
}

const SHIPS_FROM_COUNTRY = 'US';
const MAX_HANDLING_TIME = '3';

/**
 * Standard parcel bucket (oz) — the universal fallback for any item whose
 * category does not match a specific small-flat or heavier bucket. This is the
 * default for unmapped, null, undefined, or empty categories: an unknown
 * category is treated as a normal parcel-shippable good, never dropped.
 */
const STANDARD_PARCEL_OZ = 12;

/**
 * Estimate package weight (oz) from category for items with no explicit
 * packageWeightOz. Buckets: small flats ~3oz, standard collectibles ~12oz,
 * heavier small goods ~32oz.
 *
 * CONTRACT: this function ALWAYS returns a sane, positive ounce value. It never
 * returns null/0/undefined. Any category that does not match a specific bucket —
 * including null, undefined, or empty — falls back to the standard parcel bucket
 * (12 oz). This guarantees rule (e) in computeItemShipping can always derive a
 * ladder price for a configured organizer, so no no-weight item is dropped from
 * the feed merely because its category isn't in this map.
 */
export function estimateWeightOzFromCategory(category: string | null | undefined): number {
  const c = (category || '').toLowerCase();

  // Small flats (~3 oz): coins, comics, cards, magazines, paper ephemera
  const SMALL_FLAT = ['coin', 'comic', 'card', 'magazine', 'paper', 'stamp', 'postcard', 'photograph', 'ephemera', 'currency', 'banknote'];
  if (SMALL_FLAT.some((k) => c.includes(k))) return 3;

  // Heavier small goods (~32 oz): tins, lighters, golf, tools, glassware-blocks
  const HEAVY_SMALL = ['tin', 'lighter', 'golf', 'tool', 'cast iron', 'cast-iron', 'flatware', 'silverware', 'kitchenware', 'stoneware'];
  if (HEAVY_SMALL.some((k) => c.includes(k))) return 32;

  // FALLBACK — standard collectibles / books / media / small electronics, and
  // every unmapped/null/undefined/empty category. Never returns null or 0.
  return STANDARD_PARCEL_OZ;
}

/**
 * Coerce a possibly-Decimal/string value to a finite number, or null.
 */
function toNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * True ONLY for genuine freight/LTL items, judged by real package data:
 *   - weight is known AND exceeds the parcel ceiling (150 lb / 2400 oz), OR
 *   - dimensions are known AND oversized (any dim > 108 in, or length+girth > 165 in).
 * Unknown weight/dims do NOT make an item freight — default to parcel-shippable.
 */
function isFreightItem(item: ShippingFeedItem): boolean {
  // Weight test — only when weight is actually set.
  if (typeof item.packageWeightOz === 'number' && item.packageWeightOz > FREIGHT_WEIGHT_OZ) {
    return true;
  }

  // Dimension test — only when all three dimensions are known.
  const l = toNum(item.packageLengthIn);
  const w = toNum(item.packageWidthIn);
  const h = toNum(item.packageHeightIn);
  if (l !== null && w !== null && h !== null) {
    const maxDim = Math.max(l, w, h);
    // length + girth: longest side + 2*(sum of the other two sides).
    const sides = [l, w, h].sort((a, b) => b - a);
    const lengthPlusGirth = sides[0] + 2 * (sides[1] + sides[2]);
    if (maxDim > MAX_SINGLE_DIMENSION_IN || lengthPlusGirth > MAX_LENGTH_PLUS_GIRTH_IN) {
      return true;
    }
  }

  return false;
}

/**
 * Compute the per-item shipping for the Google Merchant feed.
 * Returns null when the item must be EXCLUDED from the feed.
 *
 * Async since 2026-08-16: pricing now resolves through resolveItemShipping, which
 * computes a real carrier rate (one cached coverage-zone lookup per distinct origin,
 * then pure arithmetic) instead of reading a hand-maintained table.
 */
export async function computeItemShipping(
  item: ShippingFeedItem,
  policyMapping: FeedPolicyMapping | null | undefined,
  origin?: ShippingFeedOrigin | null
): Promise<ComputedShipping | null> {
  // (a) explicit non-ship overrides → exclude (organizer's pickup-only call)
  const override = item.ebayShippingOverride;
  if (override === 'LOCAL_PICKUP_ONLY' || override === 'DONT_LIST') {
    return null;
  }

  // (b) genuine freight/LTL (by real weight/dimensions) → exclude.
  // Unknown weight/dims default to parcel-shippable, so signs/lanterns/porcelain
  // stay in the feed and only true pallet items (e.g. a 300 lb tank) drop out.
  if (isFreightItem(item)) {
    return null;
  }

  // (c) organizer has not configured eBay shipping at all → exclude. Shippability
  // stays opt-in; we just no longer require a weight-tier LADDER as the opt-in signal,
  // which had the side effect of excluding every CALCULATED-mode organizer (the default
  // mode) from the feed entirely, since those organizers legitimately have zero tiers.
  if (!policyMapping) return null;

  // (d)/(e) real weight when we have one, else a category estimate.
  const hasRealWeight = typeof item.packageWeightOz === 'number' && item.packageWeightOz > 0;
  const weightOz = hasRealWeight ? (item.packageWeightOz as number) : estimateWeightOzFromCategory(item.category);

  let resolved;
  try {
    resolved = await resolveItemShipping({
      organizer: { lat: origin?.lat ?? null, lng: origin?.lng ?? null },
      mapping: policyMapping,
      item: {
        packageWeightOz: weightOz,
        packageLengthIn: hasRealWeight ? toNum(item.packageLengthIn) : null,
        packageWidthIn: hasRealWeight ? toNum(item.packageWidthIn) : null,
        packageHeightIn: hasRealWeight ? toNum(item.packageHeightIn) : null,
        ebayShippingOverride: item.ebayShippingOverride,
        ebayFulfillmentPolicyOverrideId: null,
        ebayShippingClassification: item.ebayShippingClassification ?? null,
        ebayCategoryId: item.ebayCategoryId ?? null,
        packageType: null,
        price: item.price ?? null,
      },
      fromZip: origin?.zip ?? null,
      // No fetcher: the feed must never make an eBay API call per row. An
      // envelope-eligible item simply falls back to this mode's computed fee.
    });
  } catch (err) {
    // A rate-model failure must never break the whole feed build — drop the one row.
    console.warn(
      `[google-merchant-feed] shipping resolution failed, excluding item: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }

  // Only outcomes whose buyer price we can state honestly may be advertised.
  //   free                                   -> $0.00
  //   fvf-flat / calculated / standard-envelope -> the resolved amount
  //   custom-override / local-pickup / hard-blocked / weight-tier -> EXCLUDE.
  // custom-override in particular carries buyerAmountCents = 0 by contract (the amount
  // lives on the organizer's own eBay policy, which we have not fetched); emitting that
  // as free shipping would advertise a price the organizer never agreed to.
  const PRICEABLE = new Set(['free', 'fvf-flat', 'calculated', 'standard-envelope']);
  if (!PRICEABLE.has(resolved.source)) {
    return null;
  }
  const priceUsd = resolved.buyerAmountCents / 100;
  if (!Number.isFinite(priceUsd) || priceUsd < 0) return null;
  if (priceUsd === 0 && resolved.source !== 'free') return null;

  return {
    shipping: `${SHIPS_FROM_COUNTRY}::Standard:${priceUsd.toFixed(2)} USD`,
    shippingLabel: hasRealWeight ? 'flat' : 'estimated',
    shippingWeight: `${weightOz} oz`,
    shipsFromCountry: SHIPS_FROM_COUNTRY,
    maxHandlingTime: MAX_HANDLING_TIME,
  };
}
