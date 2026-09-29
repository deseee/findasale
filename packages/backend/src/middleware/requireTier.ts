import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { organizerHasTier, normalizeTier } from '../utils/tierAccess';
import type { SubscriptionTier } from '../utils/tierAccess';

// Re-exported for existing importers (e.g. middleware/workspaceAuth.ts).
export type { SubscriptionTier };

/**
 * Middleware to enforce subscription tier requirements on protected routes.
 * Usage: app.get('/api/feature', requireTier('PRO'), controller)
 *
 * 2026-09-29 (Patrick decisions D1/D2):
 * - Organizers keep PRO/TEAMS features until the subscription actually runs out, so there is
 *   NO grace-period block here any more (the old GRACE_PERIOD_RESTRICTION 403 was removed).
 *   The tier column is the only thing checked. (The 7-day grace machinery in
 *   tierGraceService still locks items/staff at its own deadline; that is separate.)
 * - A caller with no organizer profile now gets 403 (was 401). A 401 makes the frontend
 *   (lib/api.ts) try a token refresh and then redirect to login, which is wrong for a
 *   logged-in user who simply is not an organizer.
 */
export function requireTier(minTier: SubscriptionTier) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Fail if organizer profile is not attached
    if (!req.user?.organizerProfile) {
      return res.status(403).json({
        success: false,
        message: 'Organizer profile not found.',
        error: 'Organizer profile not found.',
        code: 'ORGANIZER_PROFILE_REQUIRED',
      });
    }

    const organizerProfile = req.user.organizerProfile as any;
    const tier = normalizeTier(organizerProfile.subscriptionTier);

    if (!organizerHasTier(tier, minTier)) {
      const inGracePeriod = organizerProfile?.graceEndAt
        ? new Date() <= new Date(organizerProfile.graceEndAt)
        : false;
      return res.status(403).json({
        message: `This feature requires the ${minTier} plan or higher.`,
        code: 'TIER_REQUIRED',
        requiredTier: minTier,
        currentTier: tier,
        inGracePeriod,
        graceEndsAt: organizerProfile?.graceEndAt || null,
        upgradeUrl: '/organizer/upgrade'
      });
    }

    next();
  };
}
