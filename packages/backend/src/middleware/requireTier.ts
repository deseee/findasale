import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { organizerHasTier, normalizeTier } from '../utils/tierAccess';
import type { SubscriptionTier } from '../utils/tierAccess';
import { loadSaleEntitlement, saleHasProFeatures } from '../lib/saleProFeatures';

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
function tierRequiredBody(minTier: SubscriptionTier, organizerProfile: any, tier: SubscriptionTier) {
  const inGracePeriod = organizerProfile?.graceEndAt
    ? new Date() <= new Date(organizerProfile.graceEndAt)
    : false;
  return {
    message: `This feature requires the ${minTier} plan or higher.`,
    code: 'TIER_REQUIRED',
    requiredTier: minTier,
    currentTier: tier,
    inGracePeriod,
    graceEndsAt: organizerProfile?.graceEndAt || null,
    upgradeUrl: '/organizer/upgrade'
  };
}

/** Resolves the sale a request is about (route param, or a lookup such as LineEntry -> saleId). Null = unknown. */
export type SaleIdResolver = (req: AuthRequest) => string | null | undefined | Promise<string | null | undefined>;

/**
 * requireTier('PRO') for per-sale PRO features that the $9.99 a-la-carte sale upgrade also unlocks (Flip Report,
 * Virtual Queue; 2026-10-23). PRO/TEAMS pass exactly as with requireTier. A SIMPLE organizer passes only when the sale
 * the request is about is THEIR OWN paid ALA_CARTE sale (lib/saleProFeatures.saleHasProFeatures). Any other sale,
 * another organizer's upgraded sale, an unknown sale or a lookup error gets the same 403 TIER_REQUIRED as before.
 * The controllers still run their own ownership checks after this.
 */
export function requireTierOrSaleUpgrade(minTier: SubscriptionTier, resolveSaleId: SaleIdResolver) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
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
    if (organizerHasTier(tier, minTier)) return next();

    // Only PRO-level features can be unlocked by the per-sale upgrade.
    if (minTier === 'PRO') {
      try {
        const saleId = await resolveSaleId(req);
        const sale = saleId ? await loadSaleEntitlement(saleId) : null;
        if (sale && saleHasProFeatures(sale, { id: organizerProfile.id, subscriptionTier: organizerProfile.subscriptionTier })) {
          return next();
        }
      } catch (err) {
        console.warn('[requireTierOrSaleUpgrade] sale upgrade lookup failed (denying):', err instanceof Error ? err.message : err);
      }
    }

    return res.status(403).json(tierRequiredBody(minTier, organizerProfile, tier));
  };
}

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
      return res.status(403).json(tierRequiredBody(minTier, organizerProfile, tier));
    }

    next();
  };
}
