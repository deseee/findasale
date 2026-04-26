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
  // Once auth resolves, fall back to SIMPLE if no tier is set.
  // Feature #75: If subscription is lapsed, treat as SIMPLE (hard gate).
  const tier = authLoading
    ? null
    : (user?.subscriptionLapsed
      ? 'SIMPLE'
      : ((user?.organizerTier || 'SIMPLE') as SubscriptionTier));

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
     * null while auth is still loading — callers should guard on authLoading.
     */
    tier,
    /** True while auth context is still resolving — gate any tier-dependent UI */
    tierLoading: authLoading,
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
