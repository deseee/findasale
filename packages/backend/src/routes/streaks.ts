import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { recordVisit, recordSave, recordPurchase, getStreakProfile, getLeaderboard } from '../services/streakService';

const router = Router();

/**
 * GET /api/streaks/profile
 * Returns the authenticated user's streak profile: current streaks, longest streaks, Hunt Pass status, total points.
 */
router.get('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const profile = await getStreakProfile(req.user.id);
    res.json(profile);
  } catch (err) {
    console.error('GET /api/streaks/profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/streaks/visit
 * Records a visit streak activity. Idempotent (once per day).
 */
router.post('/visit', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { pointsAwarded, streakContinued } = await recordVisit(req.user.id);
    res.json({ pointsAwarded, streakContinued, message: `Awarded ${pointsAwarded} points!` });
  } catch (err) {
    console.error('POST /api/streaks/visit error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/streaks/save
 * Records a save/favorite activity. Awards 10 pts (Hunt Pass: 20).
 */
router.post('/save', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { pointsAwarded } = await recordSave(req.user.id);
    res.json({ pointsAwarded, message: `Awarded ${pointsAwarded} points for saving!` });
  } catch (err) {
    console.error('POST /api/streaks/save error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/streaks/purchase
 * Records a purchase/buy streak activity.
 */
router.post('/purchase', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { pointsAwarded, streakContinued } = await recordPurchase(req.user.id);
    res.json({ pointsAwarded, streakContinued, message: `Awarded ${pointsAwarded} points for purchase!` });
  } catch (err) {
    console.error('POST /api/streaks/purchase error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/streaks/leaderboard
 * Public endpoint: returns top 20 users by streak points.
 */
router.get('/leaderboard', async (_req, res: Response) => {
  try {
    const leaderboard = await getLeaderboard();
    res.json(leaderboard);
  } catch (err) {
    console.error('GET /api/streaks/leaderboard error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
