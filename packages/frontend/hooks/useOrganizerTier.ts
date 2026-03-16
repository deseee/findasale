import { useAuth } from '../components/AuthContext';
import { hasAccess as hasAccessBackend } from '@findasale/shared';

export type SubscriptionTier = 'SIMPLE' | 'PRO' | 'TEAMS';

/**
 * Hook to check organizer subscription tier access.
 * Wraps hasAccess() from @findasale/shared with the current user's tier.
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
      return hasAccessBackend(tier, requiredTier);
    },

    /**
     * Convenience checks for common tiers
     */
    isSimple: tier === 'SIMPLE',
    isPro: tier === 'PRO' || tier === 'TEAMS',
    isTeams: tier === 'TEAMS',
  };
}
