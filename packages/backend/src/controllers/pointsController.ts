import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { awardXp } from '../services/xpService';
import { prisma } from '../lib/prisma';
import { referralTrancheService } from '../services/referralTrancheService';

/**
 * POST /api/points/track-visit
 * Track a sale detail page view and award XP to authenticated users.
 * Uses optional authentication — logged-out users don't 404, they just skip XP.
 */
export const trackSaleVisit = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.body;

    // Validate saleId
    if (!saleId || typeof saleId !== 'string') {
      return res.status(400).json({ message: 'saleId is required' });
    }

    // If not authenticated, return success but no XP awarded
    if (!req.user?.id) {
      return res.status(200).json({
        message: 'Sale visit tracked',
        xpAwarded: 0,
        authenticated: false,
      });
    }

    // Idempotency check — one VISIT XP per user per sale ever
    const existingVisit = await prisma.pointsTransaction.findFirst({
      where: {
        userId: req.user.id,
        saleId,
        type: 'VISIT',
      },
    });

    if (existingVisit) {
      return res.status(200).json({
        message: 'Sale visit tracked',
        xpAwarded: 0,
        alreadyVisited: true,
        authenticated: true,
      });
    }

    // Award VISIT XP (5 points per xpService.ts XP_AWARDS)
    const result = await awardXp(req.user.id, 'VISIT', 5, {
      saleId,
      description: 'Sale detail page view',
    });

    // Track sale visit for referral tranche B BEFORE fraud early-return.
    // Fraud-flagged referred users should still count their sale visits for the referrer's Tranche B XP.
    // Fire-and-forget — don't block or fail the visit response if tranche logic errors
    referralTrancheService.recordSaleVisit(req.user.id, saleId).catch(() => {});

    if (!result) {
      // User is fraud suspect or other issue — return success to avoid exposing fraud status
      return res.status(200).json({
        message: 'Sale visit tracked',
        xpAwarded: 0,
        authenticated: true,
      });
    }

    res.status(200).json({
      message: 'Sale visit tracked and XP awarded',
      xpAwarded: result.xpAwarded,
      newXp: result.newXp,
      newRank: result.newRank,
      rankIncreased: result.rankIncreased,
      authenticated: true,
    });
  } catch (error) {
    console.error('Error tracking sale visit:', error);
    res.status(500).json({ message: 'Failed to track sale visit' });
  }
};
