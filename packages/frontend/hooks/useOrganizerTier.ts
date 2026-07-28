import { useCallback } from 'react';
import { useAuth } from '../components/AuthContext';

export type SubscriptionTier = 'SIMPLE' | 'PRO' | 'TEAMS';

const TIER_RANK: Record<SubscriptionTier, number> = {
  SIMPLE: 0,
  PRO: 1,
  TEAMS: 2,
};

function hasAccess(organizerTier: SubscriptionTier, requiredTier: SubscriptionTier): boolean {
  return TIER_RANK[organizerTier] >= TIER_RANK[requiredTier];
}

/**
 * Hook to check organizer subscription tier access.
 * Tier logic is inlined — shared package is not a frontend dependency.
 * Frontend-only hook — use in components to conditionally render features.
 *
 * IMPORTANT: canAccess is memoized with useCallback so its reference is stable
 * across renders (only changes when tier changes). Components using it in a
 * useEffect dependency array rely on this stability — without memoization the
 * effect fires on every render, causing infinite-loop API hammering (S562 bug).
 *
 * Feature #75: HARD GATE — if subscription is lapsed (past_due), organizer is
 * treated as SIMPLE tier regardless of subscribed tier. canAccess() enforces this.
 */
export function useOrganizerTier() {
  const { user, isLoading: authLoading } = useAuth();
  // While auth is still initializing, return null tier to prevent flash of wrong plan.
  // Feature #75: If subscription is lapsed, treat as SIMPLE (hard gate).
  //
  // S-TIER-RECONCILE: there is deliberately NO `|| 'SIMPLE'` fallback here any more.
  // AuthContext.resolveOrganizerTier() leaves organizerTier `undefined` when the tier
  // could not be read from either the /auth/me response or the JWT. Collapsing that
  // to 'SIMPLE' is what silently downgraded paying PRO/TEAMS organizers: every gated
  // feature vanished AND the UI started asking them to buy a plan they already own.
  // Unknown is now its own state — `tier === null` with `tierKnown === false`.
  // Gates stay CLOSED on unknown (fail-safe, matches the loading behaviour), but
  // upgrade/downgrade copy must key off `tierKnown`, not off `!canAccess(...)`.
  const rawTier = user?.organizerTier;
  const tierKnown = !authLoading && !!user && (rawTier !== undefined && rawTier !== null && rawTier !== '');

  const tier: SubscriptionTier | null = authLoading
    ? null
    : (user?.subscriptionLapsed
      ? 'SIMPLE'
      : (tierKnown ? (rawTier as SubscriptionTier) : null));

  const isLapsed = !authLoading && (user?.subscriptionLapsed ?? false);

  /**
   * Check if organizer has access to a required tier feature.
   * Returns false while auth is loading (safe default — don't show gated features early).
   * Feature #75: Returns false for PRO/TEAMS features when subscription is lapsed.
   * @param requiredTier - The minimum tier required (PRO, TEAMS, etc.)
   * @returns true if organizer's tier >= requiredTier and subscription is not lapsed
   */
  const canAccess = useCallback(
    (requiredTier: SubscriptionTier): boolean => {
      if (!tier) return false;
      if (isLapsed && requiredTier !== 'SIMPLE') return false;
      return hasAccess(tier, requiredTier);
    },
    [tier, isLapsed]
  );

  return {
    /**
     * Current organizer's tier: SIMPLE, PRO, or TEAMS.
     * null while auth is still loading, AND null when the tier could not be
     * resolved from any source — check `tierKnown` to tell those apart from
     * a genuine SIMPLE tier.
     */
    tier,
    /** True while auth context is still resolving — gate any tier-dependent UI */
    tierLoading: authLoading,
    /**
     * S-TIER-RECONCILE: true only when a real tier value was received.
     * False while loading, when logged out, or when the tier was missing from
     * both /auth/me and the JWT. NEVER render "Upgrade to ..." copy, a plan
     * name, or a downgrade banner while this is false — a paying customer
     * must not be told to buy the plan they already pay for.
     */
    tierKnown,
    canAccess,
    /** True if subscription is currently lapsed (past_due) — Feature #75 */
    isLapsed,
    /**
     * Convenience checks for common tiers.
     * All return false while loading.
     */
    isSimple: tier === 'SIMPLE',
    isPro: tier === 'PRO' || tier === 'TEAMS',
    isTeams: tier === 'TEAMS',
  };
}
