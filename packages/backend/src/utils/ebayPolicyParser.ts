/**
 * eBay Policy Name Parser
 *
 * Parses fulfillment policy names into structured weight-tier rules.
 * Enables automated routing: given an item's weight, pick the right policy.
 *
 * Example policy names from a typical seller:
 *   "8oz Ground Advantage $6.99"       → maxOz=8
 *   "15oz Ground Advantage $8.99"      → maxOz=15
 *   "1+ lb Ground Advantage $12.49"    → maxOz=32 (2lb)
 *   "2+ lb Ground Advantage $14.49"    → maxOz=48 (3lb)
 *   "3+ lb Ground Advantage $16.60"    → maxOz=64
 *   "6+ lb Ground Advantage $19.99"    → maxOz=Infinity (no upper bound)
 *   "Free Domestic Shipping"           → classifyPolicy() returns 'free-shipping', no weight tier
 *   "Local Pickup ONLY"                → classifyPolicy() returns 'local-pickup'
 *   "FEDEX GUITAR $34.99"              → classifyPolicy() returns 'category-specific'
 *   "Media Mail Calculated"            → classifyPolicy() returns 'calculated'
 */

export interface EbayFulfillmentPolicySummary {
  fulfillmentPolicyId: string;
  name: string;
  description?: string;
}

export interface ParsedWeightTier {
  policyId: string;
  policyName: string;
  minOz: number; // inclusive lower bound (0 for first tier)
  maxOz: number; // inclusive upper bound (Number.POSITIVE_INFINITY for unbounded)
  confidence: 'high' | 'medium' | 'low';
}

export type PolicyClassification =
  | 'weight-tier'
  | 'local-pickup'
  | 'free-shipping'
  | 'calculated'
  | 'category-specific'
  | 'international'
  | 'unknown';

/**
 * Classify a policy name into a category. Used to filter which policies are eligible for weight-tier routing.
 */
export function classifyPolicy(policyName: string): PolicyClassification {
  const name = policyName.toLowerCase();

  if (/local pickup|pickup only|pickup\s*-?\s*only/i.test(name)) return 'local-pickup';
  if (/\bfree\b.*(ship|domestic|priority)/i.test(name)) return 'free-shipping';
  if (/calculated|calc\s*w[td]/i.test(name)) return 'calculated';
  if (/international|intl|worldwide/i.test(name)) return 'international';

  // Category-specific: contains a category keyword (guitar, golf, book, etc.) OR carrier name without weight
  // S1197 fix: allow an optional '+' between the digit and the unit so "N+ lb"
  // plus-tier policy names (e.g. "1+ lb Ground Advantage") classify as weight-tier
  // instead of falling through to 'unknown' -- parseSinglePolicyWeight() already
  // parses this exact pattern via its own separate regex, so the two were out of sync.
  const hasWeightHint = /\b\d+\+?\s*(oz|lb|pound|ounce)/i.test(name);
  const hasCategoryKeyword = /\b(guitar|golf|book|media|fragile|freight|bulky)\b/i.test(name);

  if (hasCategoryKeyword && !hasWeightHint) return 'category-specific';

  if (hasWeightHint) return 'weight-tier';

  return 'unknown';
}

/**
 * Extract a single weight tier from a policy name.
 * Returns null if the name doesn't contain a parseable weight.
 *
 * Handles patterns:
 *   "8oz"                 → { maxOz: 8 }
 *   "15oz"                → { maxOz: 15 }
 *   "1+ lb" or "1+lb"     → { minOz: 16, maxOz: 32 } (1lb = 16oz, treat "1+" as 1-2lb range)
 *   "2+ lb"               → { minOz: 32, maxOz: 48 }
 *   "1 lb"                → { maxOz: 16 }
 *   "6+ lb"               → { minOz: 96, maxOz: Infinity } (last tier unbounded)
 */
function parseSinglePolicyWeight(name: string): { minOz?: number; maxOz: number; confidence: 'high' | 'medium' | 'low' } | null {
  // Match "N+ lb" (plus-sign tier) — these are lower-bound tiers
  const plusLbMatch = name.match(/(\d+)\s*\+\s*lb/i);
  if (plusLbMatch) {
    const lb = parseInt(plusLbMatch[1], 10);
    const minOz = lb * 16;
    return { minOz, maxOz: (lb + 1) * 16 - 1, confidence: 'high' };
  }

  // Match "N lb" (exact, no plus)
  const exactLbMatch = name.match(/(?<!\+\s*)(\d+)\s*lb/i);
  if (exactLbMatch) {
    const lb = parseInt(exactLbMatch[1], 10);
    return { maxOz: lb * 16, confidence: 'high' };
  }

  // Match "Noz"
  const ozMatch = name.match(/(\d+)\s*oz/i);
  if (ozMatch) {
    const oz = parseInt(ozMatch[1], 10);
    return { maxOz: oz, confidence: 'high' };
  }

  return null;
}

/**
 * Parse a list of eBay fulfillment policies into weight-tier rules.
 * Only policies classified as 'weight-tier' are included.
 * Results are sorted by maxOz ascending.
 *
 * For "N+ lb" tiers, the highest one has its maxOz promoted to Infinity
 * (so it catches everything heavier).
 */
export function parseWeightTiers(policies: EbayFulfillmentPolicySummary[]): ParsedWeightTier[] {
  const tiers: ParsedWeightTier[] = [];

  for (const policy of policies) {
    if (classifyPolicy(policy.name) !== 'weight-tier') continue;

    const parsed = parseSinglePolicyWeight(policy.name);
    if (!parsed) continue;

    tiers.push({
      policyId: policy.fulfillmentPolicyId,
      policyName: policy.name,
      minOz: parsed.minOz ?? 0,
      maxOz: parsed.maxOz,
      confidence: parsed.confidence,
    });
  }

  // Sort ascending by maxOz
  tiers.sort((a, b) => a.maxOz - b.maxOz);

  // Promote the last "N+ lb" style tier to Infinity so heavy items have a catch-all
  if (tiers.length > 0) {
    const last = tiers[tiers.length - 1];
    if (/\+\s*lb/i.test(last.policyName)) {
      last.maxOz = Number.POSITIVE_INFINITY;
    }
  }

  return tiers;
}

/**
 * Given an item weight (in ounces) and a sorted list of weight-tier mappings,
 * find the first tier where weight <= maxOz.
 */
export interface WeightTierMapping {
  maxOz: number;
  policyId: string;
  policyName: string;
}

export function matchWeightTier(
  weightOz: number,
  tiers: WeightTierMapping[]
): WeightTierMapping | null {
  if (!tiers || tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.maxOz - b.maxOz);
  for (const tier of sorted) {
    if (weightOz <= tier.maxOz) return tier;
  }
  return null;
}

/**
 * (S-gap-fill, 2026-08-09) Weight-tier gap ratio -- MUST match
 * WEIGHT_TIER_GAP_RATIO in packages/frontend/pages/organizer/settings/ebay.tsx
 * (~L143) exactly. The frontend banner and this backend detector are two
 * independent implementations of the same algorithm (frontend never imports
 * backend code, per CLAUDE.md cross-layer rules), so if this ratio ever
 * changes, the frontend constant must change with it or the banner and the
 * gap-fill preview/fill endpoints will disagree about what counts as a gap.
 */
export const WEIGHT_TIER_GAP_RATIO = 2;

export interface WeightTierGap {
  fromOz: number;
  toOz: number;
}

/**
 * Detect gaps in an organizer's weight-tier ladder: consecutive tiers (sorted
 * by maxOz, unbounded/zero tiers excluded) where the next tier's maxOz is more
 * than WEIGHT_TIER_GAP_RATIO times the current tier's maxOz. Items whose
 * weight falls in that range route to a fallback instead of the organizer's
 * intended price.
 *
 * Ported line-for-line from ebay.tsx's getWeightTierGaps (~L144-156) so the
 * gap-fill preview/fill endpoints (ebayController.ts) always detect exactly
 * the same gaps the settings page's "Heads up" banners already show — do not
 * change this algorithm without updating ebay.tsx's copy in lockstep.
 */
export function detectWeightTierGaps(tiers: WeightTierMapping[]): WeightTierGap[] {
  const sorted = [...tiers]
    .filter((t) => t.maxOz !== Infinity && t.maxOz > 0)
    .sort((a, b) => a.maxOz - b.maxOz);
  const gaps: WeightTierGap[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i].maxOz;
    const next = sorted[i + 1].maxOz;
    if (next > current * WEIGHT_TIER_GAP_RATIO) {
      gaps.push({ fromOz: current, toOz: next });
    }
  }
  return gaps;
}

export interface GapFillBucket {
  bucketMaxLb: number;
  maxOz: number;
  gapFromOz: number;
  gapToOz: number;
}

/**
 * (S-gap-fill, 2026-08-09) For each detected gap, compute the new tier
 * boundaries needed to close it: starting from the gap's lower edge, double
 * repeatedly (the same WEIGHT_TIER_GAP_RATIO used to detect the gap) until
 * within range of the gap's upper edge. This guarantees every resulting
 * boundary — old and new alike — passes detectWeightTierGaps, i.e. filling
 * never leaves a residual gap.
 *
 * Example: gap from 111oz (6+ lb) to 720oz (45 lb catch-all) produces two new
 * buckets at 222oz (~13.88 lb) and 444oz (~27.75 lb) — 720/444 = 1.62, no gap.
 *
 * Shared by both the preview endpoint (rate-only, no writes) and the fill
 * endpoint (real provisioning) so they can never disagree about which buckets
 * get created.
 */
export function computeGapFillBuckets(gaps: WeightTierGap[]): GapFillBucket[] {
  const buckets: GapFillBucket[] = [];
  for (const gap of gaps) {
    let cur = gap.fromOz;
    while (gap.toOz > cur * WEIGHT_TIER_GAP_RATIO) {
      cur = cur * WEIGHT_TIER_GAP_RATIO;
      buckets.push({
        bucketMaxLb: Math.round((cur / 16) * 100) / 100,
        maxOz: Math.round(cur),
        gapFromOz: gap.fromOz,
        gapToOz: gap.toOz,
      });
    }
  }
  return buckets;
}

/**
 * (ADR-099) Given an item's three measured dimensions (inches) and a sorted list of
 * cubic-tier mappings, find the smallest-volume tier whose bounding box contains the item.
 * Orientation-agnostic: both the item's dims and each tier's dims are sorted largest-to-
 * smallest before comparing, so a 5x5x24 item is correctly NOT matched against a 24x24x24
 * tier just because one axis happens to line up, while an item that fits a tier's box in
 * some rotation IS matched -- eBay's own "to LxWxH" tier description doesn't mandate a
 * specific orientation.
 */
export interface CubicTierMapping {
  maxLengthIn: number;
  maxWidthIn: number;
  maxHeightIn: number;
  policyId: string;
  policyName: string;
}

export function matchCubicTier(
  lengthIn: number,
  widthIn: number,
  heightIn: number,
  tiers: CubicTierMapping[]
): CubicTierMapping | null {
  if (!tiers || tiers.length === 0) return null;
  const itemDims = [lengthIn, widthIn, heightIn].sort((a, b) => b - a);
  const sorted = [...tiers].sort(
    (a, b) =>
      a.maxLengthIn * a.maxWidthIn * a.maxHeightIn - b.maxLengthIn * b.maxWidthIn * b.maxHeightIn
  );
  for (const tier of sorted) {
    const tierDims = [tier.maxLengthIn, tier.maxWidthIn, tier.maxHeightIn].sort((a, b) => b - a);
    if (itemDims[0] <= tierDims[0] && itemDims[1] <= tierDims[1] && itemDims[2] <= tierDims[2]) {
      return tier;
    }
  }
  return null;
}

/**
 * Convert pounds-or-ounces mixed input into a canonical ounce value.
 * Accepts: { lb?: number, oz?: number } or plain number (assumed ounces).
 */
export function toOunces(weight: number | { lb?: number; oz?: number }): number {
  if (typeof weight === 'number') return weight;
  return (weight.lb || 0) * 16 + (weight.oz || 0);
}

/**
 * Extract the dollar amount embedded in a policy name.
 * Returns the numeric price, or null when the name has no parseable amount.
 *
 * Examples:
 *   "8oz Ground Advantage $6.99"  → 6.99
 *   "1+ lb Ground Advantage $12.49" → 12.49
 *   "FEDEX GUITAR $34.99"         → 34.99
 *   "Flat Rate $7"                → 7
 *   "Media Mail Calculated"       → null
 *   "Local Pickup ONLY"           → null
 */
export function parsePriceFromPolicyName(name: string): number | null {
  if (!name) return null;
  // Use the LAST dollar amount, not the first -- envelope-tier policy names embed an
  // eligibility disclaimer dollar figure before the real price, e.g.
  // "1oz under $20 Ebay Std Env $1.03" (real price is the trailing $1.03, not $20).
  const matches = [...name.matchAll(/\$(\d+(?:\.\d{2})?)/g)];
  if (matches.length === 0) return null;
  const value = parseFloat(matches[matches.length - 1][1]);
  return Number.isFinite(value) ? value : null;
}
