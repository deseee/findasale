// Phase 23: Referral program routes
// Task #7: Shopper Referral Rewards — new routes for code and stats

import { Router } from 'express';
import { getDashboard, getMyCode, getStats, claimReward } from '../controllers/referralController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/dashboard', authenticate, getDashboard);
router.get('/my-code', authenticate, getMyCode);
router.get('/stats', authenticate, getStats);
router.post('/claim/:rewardId', authenticate, claimReward);

export default router;
