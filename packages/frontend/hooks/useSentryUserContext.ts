import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useAuth } from '../components/AuthContext';

/**
 * Feature #21: User Impact Scoring in Sentry (Frontend)
 *
 * Hook that synchronizes authenticated user data to Sentry context.
 * Called automatically on mount and whenever user changes.
 *
 * Enriches error reports with user tier, points, hunt pass status.
 * Enables prioritization by user damage in Sentry dashboard.
 *
 * Silently no-op if user is not authenticated.
 */
export const useSentryUserContext = () => {
  const { user } = useAuth();

  useEffect(() => {
    try {
      if (!user) {
        // Clear Sentry user context when logged out
        Sentry.setUser(null);
        return;
      }

      // Set user identity
      Sentry.setUser({
        id: user.id,
        email: user.email,
        username: user.name,
      });

      // Calculate impact level based on points and tier
      // Impact score helps prioritize which bugs affect high-value users
      let impactLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      if (user.organizerTier === 'PRO' || user.organizerTier === 'TEAMS') {
        impactLevel = 'HIGH';
      } else if (user.points >= 100 || user.huntPassActive) {
        impactLevel = 'MEDIUM';
      }

      // Set individual tags for filtering in Sentry dashboard
      Sentry.setTag('user.tier', user.organizerTier || 'SCOUT');
      Sentry.setTag('user.points', user.points || 0);
      Sentry.setTag('user.huntPass', user.huntPassActive ? 'active' : 'inactive');
      Sentry.setTag('impact_level', impactLevel);

      // Set detailed context object for error inspection
      Sentry.setContext('user_impact', {
        tier: user.organizerTier || 'SCOUT',
        points: user.points || 0,
        huntPassActive: user.huntPassActive || false,
        impactLevel,
      });
    } catch (error) {
      // Fail-safe: if Sentry call throws, log and continue
      // Never break the app due to monitoring infrastructure
      console.error('Sentry user context error:', error);
    }
  }, [user]);
};
