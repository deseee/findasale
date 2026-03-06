import express from 'express';
import { authenticate } from '../middleware/auth';
import { getOrganizerInsights } from '../controllers/insightsController';

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/insights/organizer
 * Returns analytics for the authenticated organizer's sales.
 * Requires ORGANIZER role.
 */
router.get('/organizer', getOrganizerInsights);

export default router;
