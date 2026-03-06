import { Router } from 'express';
import { getVariant, trackEvent, getResults } from '../controllers/abTestController';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';

const router = Router();

// Public endpoints — no authentication required for A/B testing
router.post('/variant', getVariant);
router.post('/event', trackEvent);

// Admin-only endpoint — view results
router.get('/results/:testName', authenticate, requireAdmin, getResults);

export default router;
