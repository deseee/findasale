import { Router } from 'express';
import { optionalAuthenticate } from '../middleware/auth';
import { trackSaleVisit } from '../controllers/pointsController';

const router = Router();

/**
 * POST /api/points/track-visit — Track a sale detail page view
 * Optional auth: logged-out users get 200 but no XP awarded
 */
router.post('/track-visit', optionalAuthenticate, trackSaleVisit);

export default router;
