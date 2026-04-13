import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  getUserXpProfile,
  getLeaderboard,
  getRankProgress,
  spendXp,
  getSpendableXp,
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

      // P0 Exploit Fix: Check spendable XP (not total, accounting for 72h/30d holds)
      const spendable = await getSpendableXp(userId);
      if (spendable < XP_SINKS.RARITY_BOOST) {
        return res.status(400).json({
          error: 'Insufficient spendable XP. Newly earned XP is held for 72 hours.',
          required: XP_SINKS.RARITY_BOOST,
          available: spendable,
        });
      }

      // Attempt to spend XP
      const spent = await spendXp(
        userId,
        XP_SINKS.RARITY_BOOST,
        'RARITY_BOOST',
        { saleId, description: `+2% rarity boost for sale ${saleId}` }
      );

      if (!spent) {
        return res.status(400).json({ error: 'Failed to spend XP. Please try again.' });
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

      // P0 Exploit Fix: Check spendable XP (not total, accounting for 72h/30d holds)
      const spendable = await getSpendableXp(userId);
      if (spendable < XP_SINKS.COUPON_GENERATE) {
        return res.status(400).json({
          error: 'Insufficient spendable XP. Newly earned XP is held for 72 hours.',
          required: XP_SINKS.COUPON_GENERATE,
          available: spendable,
        });
      }

      // Attempt to spend XP
      const spent = await spendXp(userId, XP_SINKS.COUPON_GENERATE, 'COUPON_GENERATE', {
        description: 'Generated coupon via XP sink',
      });

      if (!spent) {
        return res.status(400).json({ error: 'Failed to spend XP. Please try again.' });
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

/**
 * POST /api/xp/spend/scout-reveal/:itemId
 * Authenticated shopper endpoint: spend 5 XP to reveal earliest interested flag on an item
 * Returns: { success: true, remainingXp: number }
 */
router.post(
  '/spend/scout-reveal/:itemId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { itemId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!itemId || typeof itemId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid itemId' });
      }

      // Verify item exists
      const item = await prisma.item.findUnique({
        where: { id: itemId },
        select: { id: true, title: true },
      });

      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // Check if user has already revealed this item
      const ugcPhoto = await prisma.uGCPhoto.findFirst({
        where: {
          itemId: itemId,
          isHaulPost: false, // Only check actual items, not haul posts
        },
      });

      if (ugcPhoto && ugcPhoto.scoutReveals.includes(userId)) {
        return res.status(400).json({ error: 'You have already revealed this item' });
      }

      // P0 Exploit Fix: Check spendable XP
      const spendable = await getSpendableXp(userId);
      if (spendable < XP_SINKS.RARITY_BOOST) { // Using RARITY_BOOST as placeholder for 5 XP
        return res.status(400).json({
          error: 'Insufficient spendable XP. You need 5 XP.',
          required: 5,
          available: spendable,
        });
      }

      // Spend 5 XP
      const spent = await spendXp(
        userId,
        5,
        'SCOUT_REVEAL',
        { description: `Scout reveal for item ${itemId}: ${item.title}` }
      );

      if (!spent) {
        return res.status(400).json({ error: 'Failed to spend XP. Please try again.' });
      }

      // Record the reveal in the item (or create a temporary tracking record)
      // For MVP, we'll update any haul post linked to this item
      await prisma.uGCPhoto.updateMany({
        where: {
          itemId: itemId,
        },
        data: {
          scoutReveals: {
            push: userId,
          },
        },
      });

      // Get remaining spendable XP
      const remainingXp = await getSpendableXp(userId);

      return res.status(200).json({
        success: true,
        remainingXp,
      });
    } catch (error) {
      console.error('[xpController] POST /scout-reveal error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/xp/spend/haul-unboxing/:ugcPhotoId
 * Authenticated shopper endpoint: spend 2 XP to unlock celebratory animation for haul post
 * Returns: { success: true, animationUnlocked: true }
 */
router.post(
  '/spend/haul-unboxing/:ugcPhotoId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const ugcPhotoId = parseInt(req.params.ugcPhotoId, 10);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (isNaN(ugcPhotoId)) {
        return res.status(400).json({ error: 'Invalid ugcPhotoId' });
      }

      // Verify haul post exists and user owns it
      const ugcPhoto = await prisma.uGCPhoto.findUnique({
        where: { id: ugcPhotoId },
        select: {
          id: true,
          userId: true,
          isHaulPost: true,
          unboxingAnimationUnlocked: true,
        },
      });

      if (!ugcPhoto) {
        return res.status(404).json({ error: 'Haul post not found' });
      }

      if (ugcPhoto.userId !== userId) {
        return res.status(403).json({ error: 'You can only unlock animation on your own haul' });
      }

      if (!ugcPhoto.isHaulPost) {
        return res.status(400).json({ error: 'This is not a haul post' });
      }

      if (ugcPhoto.unboxingAnimationUnlocked) {
        return res.status(400).json({ error: 'Animation already unlocked for this haul' });
      }

      // Check spendable XP
      const spendable = await getSpendableXp(userId);
      if (spendable < 2) {
        return res.status(400).json({
          error: 'Insufficient spendable XP. You need 2 XP.',
          required: 2,
          available: spendable,
        });
      }

      // Spend 2 XP
      const spent = await spendXp(
        userId,
        2,
        'HAUL_UNBOXING_ANIMATION',
        { description: `Haul unboxing animation unlock for post ${ugcPhotoId}` }
      );

      if (!spent) {
        return res.status(400).json({ error: 'Failed to spend XP. Please try again.' });
      }

      // Update haul post
      await prisma.uGCPhoto.update({
        where: { id: ugcPhotoId },
        data: {
          unboxingAnimationUnlocked: true,
        },
      });

      return res.status(200).json({
        success: true,
        animationUnlocked: true,
      });
    } catch (error) {
      console.error('[xpController] POST /haul-unboxing error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/xp/spend/bump-post/:ugcPhotoId
 * Authenticated shopper endpoint: spend 10 XP to bump haul post to feed top for 24 hours
 * Returns: { success: true, bumpedUntil: ISO string }
 */
router.post(
  '/spend/bump-post/:ugcPhotoId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const ugcPhotoId = parseInt(req.params.ugcPhotoId, 10);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (isNaN(ugcPhotoId)) {
        return res.status(400).json({ error: 'Invalid ugcPhotoId' });
      }

      // Verify haul post exists and user owns it
      const ugcPhoto = await prisma.uGCPhoto.findUnique({
        where: { id: ugcPhotoId },
        select: {
          id: true,
          userId: true,
          isHaulPost: true,
          bumpedUntil: true,
        },
      });

      if (!ugcPhoto) {
        return res.status(404).json({ error: 'Haul post not found' });
      }

      if (ugcPhoto.userId !== userId) {
        return res.status(403).json({ error: 'You can only bump your own haul posts' });
      }

      if (!ugcPhoto.isHaulPost) {
        return res.status(400).json({ error: 'This is not a haul post' });
      }

      // Check spendable XP
      const spendable = await getSpendableXp(userId);
      if (spendable < 10) {
        return res.status(400).json({
          error: 'Insufficient spendable XP. You need 10 XP.',
          required: 10,
          available: spendable,
        });
      }

      // Spend 10 XP
      const spent = await spendXp(
        userId,
        10,
        'BUMP_POST',
        { description: `Bump post for haul ${ugcPhotoId}` }
      );

      if (!spent) {
        return res.status(400).json({ error: 'Failed to spend XP. Please try again.' });
      }

      // Calculate 24 hours from now
      const bumpedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Update haul post
      const updatedPhoto = await prisma.uGCPhoto.update({
        where: { id: ugcPhotoId },
        data: {
          bumpedUntil,
        },
      });

      return res.status(200).json({
        success: true,
        bumpedUntil: updatedPhoto.bumpedUntil?.toISOString(),
      });
    } catch (error) {
      console.error('[xpController] POST /bump-post error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
