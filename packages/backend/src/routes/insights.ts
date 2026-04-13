import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier'; // #65: Tier gating for analytics (PRO feature)
import { getOrganizerInsights } from '../controllers/insightsController';

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/insights/organizer
 * Returns analytics for the authenticated organizer's sales.
 * Requires ORGANIZER role.
 * #65 Sprint 2: Gated to PRO tier (analytics is a premium feature)
 */
router.get('/organizer', requireTier('PRO'), getOrganizerInsights);

export default router;
