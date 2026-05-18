import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getDemandSignals } from '../controllers/demandSignalsController';

const router = Router();

/**
 * GET /api/organizer/demand-signals
 * Feature #454: Organizer Demand Dashboard
 * Returns unmet demand signals (search queries with no results) for the organizer's area.
 * Authenticated organizers only.
 */
router.get('/', authenticate, getDemandSignals);

export default router;
