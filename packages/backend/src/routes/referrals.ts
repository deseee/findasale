// Phase 23: Referral program routes

import { Router } from 'express';
import { getDashboard } from '../controllers/referralController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/dashboard', authenticate, getDashboard);

export default router;
