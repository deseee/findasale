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
 * Protected endpoint — requires organizer auth + PRO tier
 */
router.get('/stats/:saleId', authenticate, requireTier('PRO'), getStatsHandler);

export default router;
