/**
 * Tier access predicate (2026-09-29, Patrick decision D2).
 *
 * Single source of truth for "does this organizer's tier satisfy a required tier".
 * Tier is compared by rank; a null/undefined/unknown tier is treated as SIMPLE.
 *
 * Deliberately has NO grace-period logic: organizers keep the paid features of the tier they
 * hold until the subscription actually runs out (the tier column only moves to SIMPLE when
 * billing really ends). The old requireTier grace block (GRACE_PERIOD_RESTRICTION) was removed
 * for that reason.
 */

export type SubscriptionTier = 'SIMPLE' | 'PRO' | 'TEAMS';

export const TIER_RANK: Record<SubscriptionTier, number> = {
  SIMPLE: 0,
  PRO: 1,
  TEAMS: 2,
};

/** Normalise any stored tier value to a known tier. Null/undefined/unknown becomes SIMPLE. */
export function normalizeTier(tier: unknown): SubscriptionTier {
  if (tier === 'PRO' || tier === 'TEAMS' || tier === 'SIMPLE') return tier;
  return 'SIMPLE';
}

/** True when `tier` is at or above `required` by rank. Null tier counts as SIMPLE. */
export function organizerHasTier(tier: unknown, required: SubscriptionTier): boolean {
  return TIER_RANK[normalizeTier(tier)] >= TIER_RANK[required];
}

/** True for PRO and TEAMS. */
export function isPaidTier(tier: unknown): boolean {
  return normalizeTier(tier) !== 'SIMPLE';
}
