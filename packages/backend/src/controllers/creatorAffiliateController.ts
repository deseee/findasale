/**
 * Creator program endpoints (per-sale affiliate links), 2026-09-29.
 * Mounted from routes/affiliate.ts under /api/affiliate/creator/*.
 * Business rules live in services/creatorAffiliateService.ts.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { CREATOR_PROGRAM } from '../config/affiliateConfig';
import {
  CreatorError,
  getCreatorAccess,
  getCreatorDashboard,
  joinCreatorProgram,
  listPromotableSales,
  updateCreatorSettings,
} from '../services/creatorAffiliateService';

export function sendCreatorError(res: Response, err: unknown, fallback: string) {
  if (err instanceof CreatorError) {
    return res.status(err.status).json({ code: err.code, message: err.message });
  }
  console.error('[creator]', fallback, err);
  return res.status(500).json({ message: fallback });
}

const publicProfile = (p: any) =>
  p
    ? {
        code: p.code,
        displayName: p.displayName,
        status: p.status,
        termsVersion: p.termsVersion,
        termsAcceptedAt: p.termsAcceptedAt,
        notifyOnCommission: p.notifyOnCommission,
        notifyWeeklySummary: p.notifyWeeklySummary,
        createdAt: p.createdAt,
      }
    : null;

const programInfo = () => ({
  termsVersion: CREATOR_PROGRAM.TERMS_VERSION,
  commissionRatePercent: CREATOR_PROGRAM.COMMISSION_RATE_BPS / 100,
  holdDays: CREATOR_PROGRAM.HOLD_DAYS,
});

/** GET /api/affiliate/creator/me: membership status. Never 403, so the UI can show a join prompt. */
export const getCreatorMe = async (req: AuthRequest, res: Response) => {
  try {
    const access = await getCreatorAccess(req.user);
    res.json({
      joined: !!access.profile || access.legacyRole,
      active: access.allowed,
      suspended: access.suspended,
      legacyRole: access.legacyRole,
      emailVerified: !!req.user.emailVerified,
      profile: publicProfile(access.profile),
      program: programInfo(),
    });
  } catch (err) {
    sendCreatorError(res, err, 'Failed to load creator status');
  }
};

/** POST /api/affiliate/creator/join { acceptTerms: true, termsVersion, displayName? } */
export const joinCreator = async (req: AuthRequest, res: Response) => {
  try {
    const profile = await joinCreatorProgram(req.user, req.body ?? {});
    res.status(200).json({ profile: publicProfile(profile), program: programInfo() });
  } catch (err) {
    sendCreatorError(res, err, 'Failed to join the Creator Program');
  }
};

/** PATCH /api/affiliate/creator/settings { displayName?, notifyOnCommission?, notifyWeeklySummary? } */
export const patchCreatorSettings = async (req: AuthRequest, res: Response) => {
  try {
    const access = await getCreatorAccess(req.user);
    if (!access.profile) {
      return res.status(403).json({ code: 'CREATOR_REQUIRED', message: 'Join the Creator Program first.' });
    }
    const profile = await updateCreatorSettings(req.user.id, req.body ?? {});
    res.json({ profile: publicProfile(profile) });
  } catch (err) {
    sendCreatorError(res, err, 'Failed to update creator settings');
  }
};

/** GET /api/affiliate/creator/dashboard: real totals, per-link numbers, recent commission rows. */
export const getCreatorDashboardHandler = async (req: AuthRequest, res: Response) => {
  try {
    const access = await getCreatorAccess(req.user);
    if (!access.allowed) {
      return res.status(403).json({
        code: access.suspended ? 'CREATOR_SUSPENDED' : 'CREATOR_REQUIRED',
        message: access.suspended
          ? 'Your creator access is suspended. Contact support for details.'
          : 'Join the Creator Program to see your dashboard.',
      });
    }
    const dashboard = await getCreatorDashboard(req.user.id);
    res.json({ ...dashboard, profile: publicProfile(access.profile) });
  } catch (err) {
    sendCreatorError(res, err, 'Failed to load creator dashboard');
  }
};

/** GET /api/affiliate/creator/promotable-sales?q=&limit= */
export const getPromotableSales = async (req: AuthRequest, res: Response) => {
  try {
    const access = await getCreatorAccess(req.user);
    if (!access.allowed) {
      return res.status(403).json({ code: 'CREATOR_REQUIRED', message: 'Join the Creator Program first.' });
    }
    const limit = Math.min(parseInt(String(req.query.limit ?? '12'), 10) || 12, 25);
    const sales = await listPromotableSales(req.user.id, req.query.q, limit);
    res.json({ sales });
  } catch (err) {
    sendCreatorError(res, err, 'Failed to load sales');
  }
};
