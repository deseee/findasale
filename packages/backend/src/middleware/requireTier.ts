import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

// Inline tier gate types to avoid cross-workspace import issues
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
 * Middleware to enforce subscription tier requirements on protected routes.
 * Usage: app.get('/api/feature', requireTier('PRO'), controller)
 */
export function requireTier(minTier: SubscriptionTier) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Default to SIMPLE if no organizer profile or no tier set
    const tier = (req.user?.organizerProfile?.subscriptionTier ?? 'SIMPLE') as SubscriptionTier;

    if (!hasAccess(tier, minTier)) {
      return res.status(403).json({
        message: `This feature requires the ${minTier} plan or higher.`,
        requiredTier: minTier,
        currentTier: tier,
        upgradeUrl: '/organizer/upgrade',
      });
    }

    next();
  };
}
