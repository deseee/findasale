/**
 * googleMerchantShipping.ts — Feature #463: per-item shipping for the Google Merchant feed
 *
 * Sources shipping from the organizer's EXISTING eBay shipping config
 * (EbayPolicyMapping.weightTierMappings). Shippability is OPT-IN per organizer:
 * if there is no usable config, the item is DROPPED from the feed entirely —
 * we never promise shipping a seller can't honor and never emit a flat default.
 *
 * computeItemShipping(item, policyMapping) returns the shipping cells for the row,
 * or null to signal the item must be EXCLUDED from the feed.
 *
 * Decision order (first match wins):
 *   a. ebayShippingOverride ∈ {LOCAL_PICKUP_ONLY, DONT_LIST} → null (exclude — organizer's explicit pickup-only call)
 *   b. FREIGHT check → null ONLY for genuine freight/LTL items, judged by REAL
 *      package data (weight > 150 lb, or oversized dimensions). Unknown weight/dims
 *      never excludes here — almost everything parcel-ships. (Replaces the old eBay
 *      HEAVY_OVERSIZED/FRAGILE classifier exclusion, which wrongly dropped shippable
 *      signs, lanterns, and fragile-but-paddable porcelain.)
 *   c. no usable shipping config (no mapping, or ladder yields no parseable price) → null (exclude)
 *   d. packageWeightOz set (≤ freight limit) → matchWeightTier → parsePriceFromPolicyName → US::Standard:<price> USD, label "flat"
 *   e. else category→estimated oz → SAME weight ladder → parse price → emit, label "estimated"
 */

import {
  matchWeightTier,
  parsePriceFromPolicyName,
  WeightTierMapping,
} from './ebayPolicyParser';

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
 * Minimal organizer EbayPolicyMapping shape needed for feed shipping.
 * weightTierMappings is stored as Json — we accept the parsed array form.
 */
export interface FeedPolicyMapping {
  weightTierMappings: WeightTierMapping[] | unknown;
  categoryOverrides?: unknown;
  heavyOversizedPolicyId?: string | null;
  fragilePolicyId?: string | null;
  unknownPolicyId?: string | null;
}

/** Item fields needed to compute shipping. */
export interface ShippingFeedItem {
  category: string | null;
  tags: string[];
  ebayShippingOverride: string | null;
  packageWeightOz: number | null;
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
 * Normalize the JSON weightTierMappings into a typed WeightTierMapping[].
 * Tolerates missing/garbage shapes (returns []).
 */
function normalizeWeightTiers(raw: unknown): WeightTierMapping[] {
  if (!Array.isArray(raw)) return [];
  const tiers: WeightTierMapping[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as any).maxOz === 'number' &&
      typeof (entry as any).policyId === 'string' &&
      typeof (entry as any).policyName === 'string'
    ) {
      tiers.push({
        maxOz: (entry as any).maxOz,
        policyId: (entry as any).policyId,
        policyName: (entry as any).policyName,
      });
    }
  }
  return tiers;
}

/**
 * Run a weight (oz) through the ladder and return the parsed dollar price,
 * or null if no tier matches or the matched tier name has no parseable price.
 */
function priceForWeight(weightOz: number, tiers: WeightTierMapping[]): number | null {
  const tier = matchWeightTier(weightOz, tiers);
  if (!tier) return null;
  return parsePriceFromPolicyName(tier.policyName);
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
 */
export function computeItemShipping(
  item: ShippingFeedItem,
  policyMapping: FeedPolicyMapping | null | undefined
): ComputedShipping | null {
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

  // (c) no usable shipping config → exclude (opt-in; never default a flat rate)
  if (!policyMapping) return null;
  const tiers = normalizeWeightTiers(policyMapping.weightTierMappings);
  if (tiers.length === 0) return null;

  // (d) explicit package weight → exact ladder price, label "flat"
  if (typeof item.packageWeightOz === 'number' && item.packageWeightOz > 0) {
    const price = priceForWeight(item.packageWeightOz, tiers);
    if (price === null) return null; // ladder yields no parseable price → exclude
    return {
      shipping: `${SHIPS_FROM_COUNTRY}::Standard:${price.toFixed(2)} USD`,
      shippingLabel: 'flat',
      shippingWeight: `${item.packageWeightOz} oz`,
      shipsFromCountry: SHIPS_FROM_COUNTRY,
      maxHandlingTime: MAX_HANDLING_TIME,
    };
  }

  // (e) category estimate → same ladder, label "estimated"
  const estOz = estimateWeightOzFromCategory(item.category);
  const estPrice = priceForWeight(estOz, tiers);
  if (estPrice === null) return null; // exclude per rule (c)
  return {
    shipping: `${SHIPS_FROM_COUNTRY}::Standard:${estPrice.toFixed(2)} USD`,
    shippingLabel: 'estimated',
    shippingWeight: `${estOz} oz`,
    shipsFromCountry: SHIPS_FROM_COUNTRY,
    maxHandlingTime: MAX_HANDLING_TIME,
  };
}
