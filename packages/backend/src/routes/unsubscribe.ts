import { Router } from 'express';
import {
  handleUnsubscribe,
  resubscribe,
} from '../controllers/unsubscribeController';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /unsubscribe?token=xxx
 * Handle unsubscribe via token link (no authentication required)
 */
router.get('/', handleUnsubscribe);

/**
 * POST /unsubscribe/resubscribe
 * Re-enable a notification type (requires authentication)
 */
router.post('/resubscribe', authenticate, resubscribe);

export default router;
