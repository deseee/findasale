/**
 * snoozeController.ts
 * Handles snooze and reactivation logic for MailerLite unsubscribes.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { snoozeSubscriber, checkAndReactivateSnoozes, reactivateSubscriber } from '../services/snoozeService';

/**
 * POST /api/snooze/webhook
 * MailerLite webhook handler for subscriber.unsubscribed event.
 *
 * Instead of hard-deleting, marks subscriber as "snoozed" for 30 days.
 * Webhook payload: { data: { email, fields: {...} }, ... }
 *
 * No authentication required for webhooks (MailerLite is trusted).
 */
export const handleMailerLiteWebhook = async (req: any, res: Response) => {
  try {
    const body = req.body;

    if (!body || !body.data || !body.data.email) {
      console.warn('[snooze] Webhook received without email — ignoring');
      return res.status(400).json({ message: 'Invalid webhook payload' });
    }

    const email = body.data.email;
    console.log(`[snooze] Webhook: unsubscribe from ${email}`);

    // Mark as snoozed for 30 days instead of permanent unsubscribe
    await snoozeSubscriber(email, 30);

    res.status(200).json({ message: 'Snooze applied', email });
  } catch (error) {
    console.error('[snooze] Error handling webhook:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/snooze/status
 * Authenticated endpoint to check snooze status for a subscriber.
 *
 * Query param: email (required)
 * Returns: { email, snoozed: boolean, snoozeUntil?: string }
 */
export const getSnoozeStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.query;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: 'email query param is required' });
    }

    // In a full implementation, you would query MailerLite for the subscriber
    // and check the snooze_until custom field. For now, return a placeholder.
    console.log(`[snooze] Status check for ${email}`);

    res.json({
      email,
      snoozed: false, // Placeholder — would query MailerLite in production
      snoozeUntil: null,
    });
  } catch (error) {
    console.error('[snooze] Error getting snooze status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /api/snooze/reactivate
 * Authenticated admin/cron endpoint to manually trigger reactivation of expired snoozes.
 *
 * Optionally accepts a specific email in the body, or runs the full check.
 * Body: { email?: string }
 */
export const triggerReactivation = async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;

    if (email && typeof email === 'string') {
      // Reactivate a single subscriber
      console.log(`[snooze] Manual reactivation for ${email}`);
      await reactivateSubscriber(email);
      return res.json({ message: 'Subscriber reactivated', email });
    }

    // Run full reactivation check
    console.log('[snooze] Triggering full reactivation check');
    await checkAndReactivateSnoozes();

    res.json({ message: 'Reactivation check triggered' });
  } catch (error) {
    console.error('[snooze] Error triggering reactivation:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
