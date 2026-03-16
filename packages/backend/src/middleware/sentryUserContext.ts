import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { AuthRequest } from './auth';

/**
 * Feature #21: User Impact Scoring in Sentry
 *
 * Middleware that enriches Sentry error context with user-level telemetry.
 * Runs after authentication and tags errors with user tier, points, and hunt pass status.
 * This enables prioritization by user damage (high-value users = higher priority).
 *
 * Silently no-op if user is not authenticated.
 * Fail-safe: catches Sentry errors and continues (never blocks request).
 */
export const sentryUserContext = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Only enrich context if user is authenticated
    if (!req.user) {
      return next();
    }

    const user = req.user;

    // Set user identity (id, email, username)
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.name,
    });

    // Extract subscription tier (organizers only)
    const tier = user.organizerProfile?.subscriptionTier || 'SIMPLE';

    // Calculate impact level based on points and tier
    // Impact score helps prioritize which bugs affect high-value users
    let impactLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (tier === 'PRO' || tier === 'TEAMS') {
      impactLevel = 'HIGH';
    } else if (user.points >= 100 || user.huntPassActive) {
      impactLevel = 'MEDIUM';
    }

    // Set individual tags for filtering in Sentry dashboard
    Sentry.setTag('user.tier', tier);
    Sentry.setTag('user.points', user.points || 0);
    Sentry.setTag('user.huntPass', user.huntPassActive ? 'active' : 'inactive');
    Sentry.setTag('impact_level', impactLevel);

    // Set detailed context object for error inspection
    // Includes all user impact metrics in one place
    Sentry.setContext('user_impact', {
      tier,
      points: user.points || 0,
      huntPassActive: user.huntPassActive || false,
      // Count favorites as a proxy for engagement (high engagement = higher damage if bugs occur)
      favoritesCount: user.favorites?.length || 0,
      impactLevel,
    });

  } catch (error) {
    // Fail-safe: if Sentry call throws, log and continue
    // Never break the request due to monitoring infrastructure
    console.error('Sentry context enrichment error:', error);
  }

  next();
};
