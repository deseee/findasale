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
 */
export function useOrganizerTier() {
  const { user } = useAuth();
  const tier = (user?.organizerTier || 'SIMPLE') as SubscriptionTier;

  return {
    /**
     * Current organizer's tier: SIMPLE, PRO, or TEAMS
     */
    tier,

    /**
     * Check if organizer has access to a required tier feature
     * @param requiredTier - The minimum tier required (PRO, TEAMS, etc.)
     * @returns true if organizer's tier >= requiredTier
     */
    canAccess: (requiredTier: SubscriptionTier): boolean => {
      return hasAccess(tier, requiredTier);
    },

    /**
     * Convenience checks for common tiers
     */
    isSimple: tier === 'SIMPLE',
    isPro: tier === 'PRO' || tier === 'TEAMS',
    isTeams: tier === 'TEAMS',
  };
}
