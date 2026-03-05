import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * GET /api/feed — Phase 28: personalized activity feed
 *
 * Returns recently updated/published sales from organizers the authenticated
 * user follows, ordered by most recent first.
 *
 * Falls back to all recently published sales when the user follows nobody,
 * with `personalized: false` in the response so the frontend can prompt them
 * to follow organizers.
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    // Look up which organizers this user follows
    const follows = await prisma.follow.findMany({
      where: { userId },
      select: { organizerId: true },
    });

    const organizerIds = follows.map(f => f.organizerId);
    const personalized = organizerIds.length > 0;

    const where: any = {
      status: 'PUBLISHED',
      ...(personalized ? { organizerId: { in: organizerIds } } : {}),
    };

    const sales = await prisma.sale.findMany({
      where,
      include: {
        organizer: {
          select: {
            id: true,
            businessName: true,
            reputationTier: true,
          },
        },
        _count: {
          select: { favorites: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });

    // Flatten _count into favoriteCount so the API contract is clean
    const serialized = sales.map(({ _count, ...sale }) => ({
      ...sale,
      favoriteCount: _count.favorites,
    }));

    res.json({ sales: serialized, personalized });
  } catch (error) {
    console.error('Feed error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ message: 'Server error loading feed.' });
  }
});

export default router;
