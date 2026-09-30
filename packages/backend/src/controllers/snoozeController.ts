/**
 * snoozeController.ts
 * Handles snooze and reactivation logic for MailerLite unsubscribes.
 */

import { Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../middleware/auth';
import { snoozeSubscriber, checkAndReactivateSnoozes, reactivateSubscriber } from '../services/snoozeService';
import { maskEmail } from '../utils/logMask';

/**
 * MailerLite webhook signature verification (2026-09-29).
 *
 * MailerLite signs every webhook request. Per their docs (developers.mailerlite.com, "Webhooks"):
 * the request carries a `Signature` header whose value is the hex HMAC-SHA256 of the JSON payload,
 * keyed with the webhook's own `secret` (returned when the webhook is created, or readable from the
 * MailerLite dashboard / GET webhooks/{id}).
 *
 * Configuration: set MAILERLITE_WEBHOOK_SECRET on the backend (Railway) to that secret.
 *  - Secret set: every request must carry a valid Signature, otherwise 401.
 *  - Secret missing in production: fail CLOSED (503) and log a warning, so an unsigned endpoint is
 *    never silently accepting internet traffic that flips people's email preferences.
 *  - Secret missing outside production: log a warning and accept (local development only).
 *
 * The HMAC must be computed over the exact bytes MailerLite sent. index.ts should register
 * `app.use('/api/snooze/webhook', express.raw({ type: 'application/json' }))` before the global express.json()
 * (same pattern as the Stripe/Square/eBay raw-body webhooks); index.ts registers it. If the body ever
 * arrives already parsed, this file falls back to re-serializing it in the few shapes a PHP/Laravel sender
 * produces (plain, escaped slashes, escaped unicode) so verification still works for real requests.
 */
const hmacHex = (secret: string, payload: string | Buffer): string =>
  crypto.createHmac('sha256', secret).update(payload).digest('hex');

const timingSafeHexEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a.toLowerCase(), 'utf8');
  const bb = Buffer.from(b.toLowerCase(), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
};

/** Pure check, exported for tests. `body` is either the raw Buffer/string or the parsed JSON object. */
export function verifyMailerLiteSignature(body: unknown, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const candidates: Array<string | Buffer> = [];
  if (Buffer.isBuffer(body) || typeof body === 'string') {
    candidates.push(body);
  } else if (body && typeof body === 'object') {
    const plain = JSON.stringify(body);
    const slashEscaped = plain.replace(/\//g, '\\/');
    const uni = (t: string) => t.replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    candidates.push(plain, slashEscaped, uni(plain), uni(slashEscaped));
  }
  return candidates.some((c) => timingSafeHexEqual(hmacHex(secret, c), signature.trim()));
}

/** Pulls the subscriber email out of the payload shapes MailerLite has used. */
export function extractWebhookEmail(body: any): string | null {
  const candidates = [
    body?.data?.email,
    body?.email,
    body?.data?.subscriber?.email,
    body?.subscriber?.email,
    body?.events?.[0]?.data?.subscriber?.email,
    body?.events?.[0]?.data?.email,
  ];
  const found = candidates.find((v) => typeof v === 'string' && v.includes('@'));
  return found ? String(found).trim() : null;
}

export interface MailerLiteWebhookEvent {
  /** e.g. "subscriber.unsubscribed"; null when the event carries no recognizable name. */
  name: string | null;
  email: string | null;
}

/** Most events processed from one payload (a signed payload is trusted, this only bounds the work). */
const MAX_WEBHOOK_EVENTS = 100;

const pickEmail = (candidates: unknown[]): string | null => {
  const found = candidates.find((v) => typeof v === 'string' && v.includes('@'));
  return found ? String(found).trim() : null;
};

/**
 * Every event in a webhook payload (2026-09-29). MailerLite batches: `{ events: [ {type, data}, ... ] }`.
 * The old handler read only events[0], so the 2nd..nth unsubscribes in a batch were silently dropped and
 * those people kept getting mail. A single-event body (`{ type|event, data|email }`) yields one entry.
 */
export function extractWebhookEvents(body: any): MailerLiteWebhookEvent[] {
  if (Array.isArray(body?.events)) {
    return body.events.slice(0, MAX_WEBHOOK_EVENTS).map((ev: any): MailerLiteWebhookEvent => ({
      name: typeof (ev?.type ?? ev?.event) === 'string' ? String(ev?.type ?? ev?.event) : null,
      email: pickEmail([ev?.data?.subscriber?.email, ev?.data?.email, ev?.subscriber?.email, ev?.email]),
    }));
  }
  const name = body?.event ?? body?.type;
  return [{ name: typeof name === 'string' ? name : null, email: extractWebhookEmail(body) }];
}

/** Only an explicit "...unsubscribed" event name starts a snooze. No name, or any other name, is ignored. */
export const isUnsubscribeEvent = (name: string | null): boolean =>
  typeof name === 'string' && name.toLowerCase().includes('unsubscribed');

/**
 * POST /api/snooze/webhook
 * MailerLite webhook handler for subscriber.unsubscribed events.
 *
 * Instead of hard-deleting, marks each unsubscribed subscriber in the payload as "snoozed" for 30 days.
 * ALL events in a batched payload are processed; events without a recognized unsubscribe event name are
 * ignored (they used to be treated as unsubscribes).
 *
 * Authentication: MailerLite HMAC signature (see verifyMailerLiteSignature above), not a session.
 */
export const handleMailerLiteWebhook = async (req: any, res: Response) => {
  try {
    const secret = process.env.MAILERLITE_WEBHOOK_SECRET;
    if (!secret) {
      console.warn('[snooze] MAILERLITE_WEBHOOK_SECRET is not set: cannot verify MailerLite webhook signatures.');
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ message: 'Webhook signature verification is not configured' });
      }
    } else {
      const signature = req.headers['signature'] as string | undefined;
      if (!verifyMailerLiteSignature(req.body, signature, secret)) {
        console.warn('[snooze] Webhook rejected: missing or invalid Signature header');
        return res.status(401).json({ message: 'Invalid webhook signature' });
      }
    }

    // A raw-body parser hands us a Buffer; otherwise express.json already parsed it.
    let body = req.body;
    if (Buffer.isBuffer(body) || typeof body === 'string') {
      try {
        body = JSON.parse(body.toString());
      } catch {
        return res.status(400).json({ message: 'Invalid webhook payload' });
      }
    }

    const events = extractWebhookEvents(body);
    const toSnooze = new Set<string>();
    let ignored = 0;
    let malformed = 0;
    for (const ev of events) {
      if (!isUnsubscribeEvent(ev.name)) {
        ignored++;
      } else if (!ev.email) {
        malformed++;
      } else {
        toSnooze.add(ev.email.toLowerCase());
      }
    }

    if (toSnooze.size === 0) {
      if (malformed > 0) {
        console.warn('[snooze] Webhook unsubscribe event(s) without an email: ignoring');
        return res.status(400).json({ message: 'Invalid webhook payload' });
      }
      return res.status(200).json({ message: 'Event ignored', ignored });
    }

    let processed = 0;
    let failed = 0;
    for (const email of toSnooze) {
      try {
        // Mark as snoozed for 30 days instead of permanent unsubscribe
        await snoozeSubscriber(email, 30);
        processed++;
      } catch (snoozeErr) {
        failed++;
        console.error(`[snooze] Failed to snooze ${maskEmail(email)}:`, (snoozeErr as Error)?.message);
      }
    }
    console.log(`[snooze] Webhook: ${processed} unsubscribe(s) snoozed, ${failed} failed, ${ignored + malformed} ignored`);

    if (failed > 0) {
      // Non-2xx so MailerLite retries the payload (snoozing is idempotent).
      return res.status(500).json({ message: 'Some snoozes failed', processed, failed });
    }
    res.status(200).json({ message: 'Snooze applied', processed, ignored: ignored + malformed });
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
 * Currently returns 501 (not implemented), see the handler. Planned shape: { email, snoozed, snoozeUntil }
 */
export const getSnoozeStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.query;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: 'email query param is required' });
    }

    // A signed-in user may only look up their own address (admins may look up anyone).
    const isAdmin = req.user?.roles?.includes('ADMIN') || req.user?.role === 'ADMIN';
    if (!isAdmin && String(req.user?.email || '').toLowerCase() !== email.trim().toLowerCase()) {
      return res.status(403).json({ message: 'You can only check the snooze status of your own email' });
    }

    // NOT IMPLEMENTED (2026-09-29): this endpoint used to answer { snoozed: false } for everyone, which is a
    // lie for anybody who is snoozed. The snooze lives in a MailerLite custom field (snooze_until) and
    // services/snoozeService.ts has no read function for it, so there is no honest answer to give. Return 501
    // instead of a fabricated one. To implement: add a getSnoozeStatus(email) to snoozeService that fetches the
    // subscriber from MailerLite and returns snooze_until, then answer from that here. (Nothing in the frontend
    // calls this route.)
    console.log(`[snooze] Status check for ${maskEmail(email)} (not implemented)`);

    res.status(501).json({
      message: 'Snooze status lookup is not supported yet.',
      code: 'NOT_IMPLEMENTED',
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
      console.log(`[snooze] Manual reactivation for ${maskEmail(email)}`);
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
