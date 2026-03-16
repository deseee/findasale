/**
 * snooze.ts
 * Routes for unsubscribe-to-snooze feature (#23).
 *
 * POST /api/snooze/webhook — MailerLite unsubscribe webhook (no auth)
 * GET /api/snooze/status — Check snooze status (auth required)
 * POST /api/snooze/reactivate — Trigger reactivation (auth required)
 */

import { Router } from 'express';
import { handleMailerLiteWebhook, getSnoozeStatus, triggerReactivation } from '../controllers/snoozeController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Webhook endpoint — unauthenticated
router.post('/webhook', handleMailerLiteWebhook);

// Status endpoint — authenticated
router.get('/status', authenticate, getSnoozeStatus);

// Reactivation trigger — authenticated
router.post('/reactivate', authenticate, triggerReactivation);

export default router;
