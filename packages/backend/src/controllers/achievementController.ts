import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getUserAchievements } from '../services/achievementService';
import { getStreak, recordVisit } from '../services/streakService';

/**
 * GET /api/achievements/me
 * Returns all achievements for authenticated user with progress
 * Also returns their streak information
 */
export const getMyAchievements = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const achievements = await getUserAchievements(req.user.id);
    const streak = await getStreak(req.user.id);

    res.json({
      achievements,
      streak,
    });
  } catch (error) {
    console.error('[Achievement] Failed to fetch user achievements:', error);
    res.status(500).json({ message: 'Failed to fetch achievements' });
  }
};

/**
 * POST /api/achievements/visit
 * Records a weekend visit and updates streak
 * Requires authentication
 */
export const recordWeekendVisit = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    await recordVisit(req.user.id);
    const streak = await getStreak(req.user.id);

    res.json({
      message: 'Visit recorded',
      streak,
    });
  } catch (error) {
    console.error('[Achievement] Failed to record visit:', error);
    res.status(500).json({ message: 'Failed to record visit' });
  }
};
