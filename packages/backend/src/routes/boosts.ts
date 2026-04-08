/**
 * routes/boosts.ts — /api/boosts/* route definitions
 * Phase 2b: Dual-rail boost system
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getBoostQuote, buyBoost, listActiveBoosts, getMyBoosts } from '../controllers/boostController';

const router = Router();

// GET /api/boosts/active?targetType=SALE — public (no auth required for featured display)
router.get('/active', listActiveBoosts);

// GET /api/boosts/me — authenticated user's boost history
router.get('/me', authenticate, getMyBoosts);

// POST /api/boosts/quote — get XP + cash price for a boost type
router.post('/quote', authenticate, getBoostQuote);

// POST /api/boosts/purchase — buy a boost (XP or Stripe rail)
router.post('/purchase', authenticate, buyBoost);

export default router;
