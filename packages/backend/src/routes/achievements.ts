import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getMyAchievements, recordWeekendVisit } from '../controllers/achievementController';
import { getUserLocalLegendBadges, getUserOgBuyerBadges } from '../services/badgeService';

const router = Router();

// GET /api/achievements/me — get all achievements and streak for authenticated user
router.get('/me', authenticate, getMyAchievements);

// POST /api/achievements/visit — record a weekend visit
router.post('/visit', authenticate, recordWeekendVisit);

// GET /api/achievements/badges — get Local Legend + OG Buyer scoped badges for authenticated user
router.get('/badges', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const [localLegend, ogBuyer] = await Promise.all([
      getUserLocalLegendBadges(req.user.id),
      getUserOgBuyerBadges(req.user.id),
    ]);

    res.json({ localLegend, ogBuyer });
  } catch (error) {
    console.error('[badges] Failed to fetch user badges:', error);
    res.status(500).json({ message: 'Failed to fetch badges' });
  }
});

export default router;
