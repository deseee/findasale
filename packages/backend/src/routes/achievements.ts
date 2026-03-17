import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getMyAchievements, recordWeekendVisit } from '../controllers/achievementController';

const router = Router();

// GET /api/achievements/me — get all achievements and streak for authenticated user
router.get('/me', authenticate, getMyAchievements);

// POST /api/achievements/visit — record a weekend visit
router.post('/visit', authenticate, recordWeekendVisit);

export default router;
