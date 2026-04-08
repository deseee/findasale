/**
 * Lucky Roll Router — Routes for /api/lucky-roll
 * GET  /eligibility (public)
 * POST /roll (auth required)
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getEligibilityHandler, rollHandler } from '../controllers/luckyRollController';

const router = Router();

/**
 * GET /api/lucky-roll/eligibility
 * Public. Returns roll availability, XP balance, odds table, legal notice.
 */
router.get('/eligibility', authenticate({ required: true }), getEligibilityHandler);

/**
 * POST /api/lucky-roll/roll
 * Auth required. Performs the roll.
 */
router.post('/roll', authenticate({ required: true }), rollHandler);

export default router;
