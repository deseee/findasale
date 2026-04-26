import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { awardXp } from '../services/xpService';

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

    // Award VISIT XP (5 points per xpService.ts XP_AWARDS)
    const result = await awardXp(req.user.id, 'VISIT', 5, {
      saleId,
      description: 'Sale detail page view',
    });

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
