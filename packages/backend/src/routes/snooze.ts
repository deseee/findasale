/**
 * snooze.ts
 * Routes for unsubscribe-to-snooze feature (#23).
 *
 * POST /api/snooze/webhook — MailerLite unsubscribe webhook (no session; HMAC Signature header
 *   verified with MAILERLITE_WEBHOOK_SECRET, fails closed in production if the secret is missing)
 * GET /api/snooze/status — NOT IMPLEMENTED: always 501 (auth required, own email only unless admin). It used to
 *   return a hardcoded "not snoozed" placeholder for everyone.
 * POST /api/snooze/reactivate — Trigger reactivation (admin only)
 */

import { Router } from 'express';
import { handleMailerLiteWebhook, getSnoozeStatus, triggerReactivation } from '../controllers/snoozeController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// Webhook endpoint — no session, authenticated by MailerLite's HMAC signature (see controller)
router.post('/webhook', handleMailerLiteWebhook);

// Status endpoint — authenticated; answers 501 until snoozeService can read snooze_until (see controller)
router.get('/status', authenticate, getSnoozeStatus);

// Reactivation trigger — admin only (it can resubscribe any address)
router.post('/reactivate', authenticate, requireAdmin, triggerReactivation);

export default router;
