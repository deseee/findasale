import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { generateNudges, shouldDispatchNudges, Nudge, UserState } from '../services/nudgeService';

/**
 * GET /api/nudges
 * Fetch personalized nudges for the authenticated user.
 */
export const getNudges = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Authenticate required
    if (!req.user || !req.user.id) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const userId = req.user.id;

    // Check dispatch probability (variable-ratio schedule)
    if (!shouldDispatchNudges(userId)) {
      res.json({ nudges: [] });
      return;
    }

    // Fetch user state
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        points: true,
        visitStreak: true,
        huntPassActive: true,
      },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Count favorites for this user
    const favoritesCount = await prisma.favorite.count({
      where: { userId },
    });

    // Build user state
    const state: UserState = {
      userId: user.id,
      points: user.points,
      favoritesCount,
      visitStreak: user.visitStreak,
      huntPassActive: user.huntPassActive,
    };

    // Generate nudges
    const nudges: Nudge[] = generateNudges(state);

    res.json({ nudges });
  } catch (error) {
    console.error('Error fetching nudges:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
