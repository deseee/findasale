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
 * POST /unsubscribe?token=xxx
 * RFC 8058 one-click unsubscribe (List-Unsubscribe-Post: List-Unsubscribe=One-Click).
 * Mail clients (Gmail/Yahoo/Outlook "Unsubscribe" button) fire an unauthenticated
 * POST with body `List-Unsubscribe=One-Click` and expect the action to complete
 * from the URL alone -- no page render, no auth, no redirect. handleUnsubscribe
 * already reads only `req.query.token` and ignores the body/method, so the same
 * handler is reused as-is; this route just makes POST resolve instead of 404ing.
 * (Previously only GET existed, which every List-Unsubscribe header pointed at
 * the frontend for and no server-side POST handler existed anywhere -- the header
 * claimed RFC 8058 support but no automated one-click flow could ever succeed.)
 */
router.post('/', handleUnsubscribe);

/**
 * POST /unsubscribe/resubscribe
 * Re-enable a notification type (requires authentication)
 */
router.post('/resubscribe', authenticate, resubscribe);

export default router;
