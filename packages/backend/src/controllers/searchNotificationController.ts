/**
 * Feature #455: SearchNotification controller
 * Anonymous email capture for zero-result search queries.
 * POST /api/search/notify — no auth required.
 *
 * Double opt-in (2026-09-29 hardening): an anonymous capture creates an UNCONFIRMED entry
 * (confirmedAt null) and sends ONE confirmation email carrying an HMAC link
 * (GET /api/shopper/waitlist/confirm?token=). services/notifyMeSenderService.ts only emails confirmed
 * entries, so nobody can subscribe a third party's inbox. A signed-in shopper submitting their OWN
 * account email is confirmed immediately (the session already proves the address).
 */
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { isEmailDomainBlocked } from '../services/suppressionService';
import { createRateLimitStore, getVerifiedSessionUserId } from '../middleware/rateLimitShared';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import {
  buildNotifyMeConfirmEmail,
  signNotifyConfirmToken,
  signNotifyMeToken,
} from '../services/notifyMeSenderService';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ACTIVE_ALERTS_PER_EMAIL = 10;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

/** At most this many confirmation emails per address per day (on top of the per-IP searchLimiter). */
export const MAX_CONFIRMATION_EMAILS_PER_EMAIL_PER_DAY = 3;
const CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000;

// Per-email counter on the shared (Redis-when-ready, memory-otherwise) limiter store.
const confirmationCounter = createRateLimitStore('rl:notifyConfirmEmail:');
confirmationCounter?.init?.({ windowMs: CONFIRMATION_WINDOW_MS } as never);

/** True when this address may still be sent a confirmation email today (counts the attempt). */
async function allowConfirmationEmail(email: string): Promise<boolean> {
  try {
    if (!confirmationCounter) return false; // no limiter store available: fail closed on the send
    const { totalHits } = await confirmationCounter.increment(email);
    return totalHits <= MAX_CONFIRMATION_EMAILS_PER_EMAIL_PER_DAY;
  } catch (err) {
    // Fail closed on the email send (an unconfirmed entry is harmless; a mail flood is not).
    console.warn('[searchNotification] confirmation throttle unavailable, not sending:', err instanceof Error ? err.message : err);
    return false;
  }
}

/** Identical response for created / existing / re-armed / opted-out / over-limit anonymous requests. */
export const PENDING_CONFIRMATION_MESSAGE =
  'Check your email to confirm your alert. We only start watching once you confirm.';

async function sendConfirmationEmail(email: string, term: string, city: string | null): Promise<void> {
  const confirmToken = signNotifyConfirmToken(email);
  const unsubToken = signNotifyMeToken(email);
  if (!confirmToken || !unsubToken) {
    console.error('[searchNotification] No HMAC secret configured (JWT_SECRET / NOTIFY_ME_UNSUB_SECRET); cannot send confirmation email.');
    return;
  }
  if (!(await allowConfirmationEmail(email))) return;
  const content = buildNotifyMeConfirmEmail({
    term,
    city,
    confirmUrl: `${FRONTEND_URL}/api/shopper/waitlist/confirm?token=${encodeURIComponent(confirmToken)}`,
    unsubUrl: `${FRONTEND_URL}/api/shopper/waitlist/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
  });
  try {
    await transactionalEmailService.emails.send({ to: email, subject: content.subject, html: content.html, text: content.text });
  } catch (err) {
    // The entry stays unconfirmed; never surface send problems (or their absence) to the caller.
    console.error('[searchNotification] confirmation email failed:', err instanceof Error ? err.message : err);
  }
}

/** Email of the signed-in account making this request (session verified), or null. */
async function signedInEmail(req: Request): Promise<string | null> {
  try {
    const userId = getVerifiedSessionUserId(req);
    if (!userId) return null;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    return user?.email ? user.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Response contract (search.tsx relies on it to show REAL outcomes):
 *   200 { success: true, status: 'pending_confirmation', message }  anonymous request accepted. IDENTICAL for a
 *                                                                     new alert, an existing one, an address that opted
 *                                                                     out and an address at its alert cap, so the
 *                                                                     endpoint is not an oracle for who is subscribed.
 *   201 { success: true, status: 'created' }                        signed-in shopper, own account email: confirmed now
 *   200 { success: true, status: 'exists' | 'rearmed' | 'opted_out' } same signed-in path
 *   400 { success: false, message }                                 validation / unsendable address
 *   500 { success: false, message }
 * Alerts are sent by services/notifyMeSenderService.ts (one-shot per entry, at most one email per
 * person per day, unsubscribe link in every email, confirmed entries only).
 */
export const notifyOnSearch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, query, city } = (req.body || {}) as { email?: string; query?: string; city?: string };

    if (!email || typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email.trim())) {
      res.status(400).json({ success: false, message: 'Valid email address required.' });
      return;
    }
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      res.status(400).json({ success: false, message: 'Search query required.' });
      return;
    }

    const q = query.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
    const e = email.trim().toLowerCase();
    const c = typeof city === 'string' && city.trim() ? city.trim().slice(0, 100) : null;

    if (isEmailDomainBlocked(e)) {
      res.status(400).json({ success: false, message: 'Please use a different email address.' });
      return;
    }

    // A signed-in shopper adding an alert for their OWN account email is already verified.
    const sessionEmail = await signedInEmail(req);
    const ownEmail = sessionEmail !== null && sessionEmail === e;

    const rows = await prisma.searchNotification.findMany({
      where: { email: e },
      select: { id: true, searchQuery: true, isActive: true, notifiedAt: true, confirmedAt: true, expiredAt: true },
    });

    const pending = (): void => {
      res.status(200).json({ success: true, status: 'pending_confirmation', message: PENDING_CONFIRMATION_MESSAGE });
    };

    // Opt-out: an inactive row that did NOT age out (expiredAt null) means the address unsubscribed or was
    // suppressed. It stays out; anonymous callers get the same response as everyone else (no oracle).
    // (A signed-in shopper is already identified, so they get an honest answer.)
    if (rows.some((r) => !r.isActive && !r.expiredAt)) {
      if (ownEmail) {
        res.status(200).json({
          success: true,
          status: 'opted_out',
          message: 'This email address opted out of Notify Me emails. You can add alerts from your account at /shopper/notify-me.',
        });
        return;
      }
      pending();
      return;
    }

    const now = new Date();
    const activeRows = rows.filter((r) => r.isActive);
    // Only the signed-in owner of the address skips confirmation. An anonymous caller never inherits an
    // earlier confirmation: someone who knows a subscriber's address must not be able to add or re-arm
    // alerts that start emailing them without a fresh click.
    const existing = rows.find((r) => r.searchQuery === q);

    if (existing) {
      if (!existing.isActive || existing.notifiedAt) {
        // Aged-out or already-fired one-shot alert: re-arm so the next match is sent. armedAt moves forward so
        // only sales/items listed after this moment count as new (createdAt is left alone).
        await prisma.searchNotification.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            expiredAt: null,
            notifiedAt: null,
            armedAt: now,
            city: c,
            confirmedAt: ownEmail ? existing.confirmedAt ?? now : null,
          },
        });
        if (ownEmail) {
          res.status(200).json({ success: true, status: 'rearmed', message: "You're back on the list. We'll email you when a match is listed." });
          return;
        }
        void sendConfirmationEmail(e, q, c); // fire-and-forget: identical response timing for every outcome
        pending();
        return;
      }
      if (ownEmail) {
        res.status(200).json({ success: true, status: 'exists', message: "You're already on the list for this search." });
        return;
      }
      if (!existing.confirmedAt) void sendConfirmationEmail(e, q, c); // resend (throttled per email per day)
      pending();
      return;
    }

    if (activeRows.length >= MAX_ACTIVE_ALERTS_PER_EMAIL) {
      // Same response as everything else: revealing "this address already has 10 alerts" would leak state.
      if (ownEmail) {
        res.status(400).json({
          success: false,
          message: `This email already has ${MAX_ACTIVE_ALERTS_PER_EMAIL} active alerts. Wait for one to arrive before adding another.`,
        });
        return;
      }
      pending();
      return;
    }

    try {
      await prisma.searchNotification.create({
        data: {
          email: e,
          searchQuery: q,
          city: c,
          isActive: true,
          armedAt: now,
          // Own-account email is verified by the session; everyone else confirms by email click.
          confirmedAt: ownEmail ? now : null,
        },
      });
    } catch (err: any) {
      // Unique (email, searchQuery) race with a parallel request: it is already on the list.
      if (err?.code === 'P2002') {
        if (ownEmail) {
          res.status(200).json({ success: true, status: 'exists', message: "You're already on the list for this search." });
          return;
        }
        pending();
        return;
      }
      throw err;
    }

    if (ownEmail) {
      res.status(201).json({ success: true, status: 'created', message: "You're on the list. We'll email you when a match is listed." });
      return;
    }
    void sendConfirmationEmail(e, q, c);
    pending();
  } catch (err) {
    console.error('[searchNotification] POST /notify error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};
