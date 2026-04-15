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
  const hasWeightHint = /\b\d+\s*(oz|lb|pound|ounce)/i.test(name);
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
 * Convert pounds-or-ounces mixed input into a canonical ounce value.
 * Accepts: { lb?: number, oz?: number } or plain number (assumed ounces).
 */
export function toOunces(weight: number | { lb?: number; oz?: number }): number {
  if (typeof weight === 'number') return weight;
  return (weight.lb || 0) * 16 + (weight.oz || 0);
}
