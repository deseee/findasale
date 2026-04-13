import { Router } from 'express';
import { getShopperLeaderboard, getOrganizerLeaderboard } from '../controllers/leaderboardController';

const router = Router();

// Public endpoints — no authentication required
router.get('/shoppers', getShopperLeaderboard);
router.get('/organizers', getOrganizerLeaderboard);

export default router;
