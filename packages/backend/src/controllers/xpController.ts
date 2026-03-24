import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  getUserXpProfile,
  getLeaderboard,
  getRankProgress,
  spendXp,
  XP_SINKS,
} from '../services/xpService';
import { prisma } from '../lib/prisma';
const router = Router();

/**
 * XP Controller — Explorer's Guild endpoints
 * Phase 2a: Core gamification API
 */

/**
 * GET /api/xp/profile
 * Authenticated endpoint: returns user's XP, rank, and progression
 */
router.get('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const profile = await getUserXpProfile(userId);
    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json(profile);
  } catch (error) {
    console.error('[xpController] GET /profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/xp/leaderboard
 * Public endpoint: returns top 50 users by guildXp
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const leaderboard = await getLeaderboard(Math.min(limit, 100)); // Cap at 100

    return res.status(200).json(leaderboard);
  } catch (error) {
    console.error('[xpController] GET /leaderboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/xp/sink/rarity-boost
 * Authenticated shopper endpoint: spend 15 XP to boost legendary find odds for a sale
 * Body: { saleId: string }
 * Returns: created RarityBoost record or error
 */
router.post(
  '/sink/rarity-boost',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { saleId } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!saleId || typeof saleId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid saleId' });
      }

      // Verify sale exists and get endDate
      const sale = await prisma.sale.findUnique({
        where: { id: saleId },
        select: { id: true, endDate: true },
      });

      if (!sale) {
        return res.status(404).json({ error: 'Sale not found' });
      }

      // Check if user already has a boost for this sale
      const existingBoost = await prisma.rarityBoost.findUnique({
        where: { userId_saleId: { userId, saleId } },
      });

      if (existingBoost) {
        return res.status(400).json({ error: 'Rarity boost already active for this sale' });
      }

      // Attempt to spend XP
      const spent = await spendXp(
        userId,
        XP_SINKS.RARITY_BOOST,
        'RARITY_BOOST',
        { saleId, description: `+2% rarity boost for sale ${saleId}` }
      );

      if (!spent) {
        return res.status(400).json({ error: 'Insufficient XP (requires 15 XP)' });
      }

      // Create rarity boost
      const rarityBoost = await prisma.rarityBoost.create({
        data: {
          userId,
          saleId,
          boostPct: 2,
          expiresAt: sale.endDate,
        },
      });

      return res.status(201).json(rarityBoost);
    } catch (error) {
      console.error('[xpController] POST /rarity-boost error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/xp/sink/coupon
 * Authenticated organizer endpoint: spend 20 XP to generate a coupon
 * Returns: created Coupon record with xpSpent field
 */
router.post(
  '/sink/coupon',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify user is an organizer
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { roles: true },
      });

      if (!user || !user.roles.includes('ORGANIZER')) {
        return res.status(403).json({ error: 'Only organizers can generate coupons' });
      }

      // Attempt to spend XP
      const spent = await spendXp(userId, XP_SINKS.COUPON_GENERATE, 'COUPON_GENERATE', {
        description: 'Generated coupon via XP sink',
      });

      if (!spent) {
        return res.status(400).json({ error: 'Insufficient XP (requires 20 XP)' });
      }

      // Generate coupon code
      const couponCode = `XP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30-day expiry

      // Create coupon
      const coupon = await prisma.coupon.create({
        data: {
          userId,
          code: couponCode,
          discountType: 'FIXED',
          discountValue: 1.0, // $1 off
          expiresAt,
          xpSpent: XP_SINKS.COUPON_GENERATE,
        },
      });

      return res.status(201).json(coupon);
    } catch (error) {
      console.error('[xpController] POST /coupon error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
