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
 */
export function useOrganizerTier() {
  const { user } = useAuth();
  const tier = (user?.organizerTier || 'SIMPLE') as SubscriptionTier;

  /**
   * Check if organizer has access to a required tier feature
   * @param requiredTier - The minimum tier required (PRO, TEAMS, etc.)
   * @returns true if organizer's tier >= requiredTier
   */
  const canAccess = useCallback(
    (requiredTier: SubscriptionTier): boolean => hasAccess(tier, requiredTier),
    [tier]
  );

  return {
    /**
     * Current organizer's tier: SIMPLE, PRO, or TEAMS
     */
    tier,
    canAccess,
    /**
     * Convenience checks for common tiers
     */
    isSimple: tier === 'SIMPLE',
    isPro: tier === 'PRO' || tier === 'TEAMS',
    isTeams: tier === 'TEAMS',
  };
}
