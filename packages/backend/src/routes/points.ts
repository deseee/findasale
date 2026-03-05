import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { awardPoints, getTier } from '../services/pointsService';

const router = Router();

/**
 * GET /api/points
 * Returns the authenticated user's points total, tier, and last 10 transactions.
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        points: true,
        pointsTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      points: user.points,
      tier: getTier(user.points),
      transactions: user.pointsTransactions,
    });
  } catch (err) {
    console.error('GET /api/points error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/points/track-visit
 * Awards 1 point for visiting a sale detail page — idempotent (once per sale per day).
 */
router.post('/track-visit', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { saleId } = req.body as { saleId?: string };
    if (!saleId) return res.status(400).json({ message: 'saleId required' });

    // Idempotency: check for an existing VISIT transaction for this sale today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existing = await prisma.pointsTransaction.findFirst({
      where: {
        userId: req.user.id,
        type: 'VISIT',
        saleId,
        createdAt: { gte: todayStart },
      },
    });

    if (existing) {
      return res.json({ awarded: false, message: 'Already awarded for this sale today' });
    }

    await awardPoints(req.user.id, 'VISIT', 1, saleId, undefined, 'Visited sale');
    res.json({ awarded: true, points: 1 });
  } catch (err) {
    console.error('POST /api/points/track-visit error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
