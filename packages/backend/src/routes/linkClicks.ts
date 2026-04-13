import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { recordClickHandler, getStatsHandler } from '../controllers/linkClickController';

const router = express.Router();

/**
 * Public endpoint — no auth required
 */
router.get('/record', recordClickHandler);

/**
 * Protected endpoint — requires organizer auth + SIMPLE tier (moved from PRO in S391)
 */
router.get('/stats/:saleId', authenticate, requireTier('SIMPLE'), getStatsHandler);

export default router;
