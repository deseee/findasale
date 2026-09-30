/**
 * Guest (signed-out) email subscription to a sale's reminders, with double opt-in (2026-09-30).
 *
 * Flow:
 *   1. POST /api/notifications/subscribe-guest { saleId, email } (public)
 *      -> requestGuestEmailSubscription: stores a PENDING SaleSubscriber row (userId null, email set,
 *         emailConfirmedAt null) holding only the SHA-256 of a single-use random token and a 48 hour expiry,
 *         and sends ONE confirmation email through the transactional rail. The answer is identical for a new
 *         address, an address that is already pending, already confirmed, suppressed, or over the daily limit,
 *         so the endpoint cannot be used to probe who is subscribed.
 *   2. The address owner opens /confirm-subscription?token=... on the site and presses the confirm button, which
 *      POSTs { token } to /api/notifications/confirm-email-subscription -> confirmGuestEmailSubscription: a single
 *      conditional update (hash matches, not yet confirmed, not expired) that sets emailConfirmedAt and clears the
 *      token, so the link works once and only within 48 hours.
 *   3. emailReminderService sends a reminder to a guest row ONLY when emailConfirmedAt is set and emailOptOutAt is
 *      null, and every such email carries an opt-out link (and the RFC 8058 List-Unsubscribe headers) built from a
 *      stateless HMAC token for the address (signGuestReminderUnsubToken). Opting out sets emailOptOutAt on every
 *      guest row for that address.
 *
 * A signed-in shopper never uses this path: their reminders go to the account's own email through the
 * account-linked row (POST /api/notifications/subscribe).
 */
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { isEmailDomainBlocked, suppressionService } from './suppressionService';
import { createRateLimitStore } from '../middleware/rateLimitShared';
import { escapeHtml } from '../utils/htmlEscape';
import { maskEmail } from '../utils/logMask';

export const GUEST_EMAIL_CONFIRM_TTL_MS = 48 * 60 * 60 * 1000;
/** At most this many confirmation emails per address per day (on top of the per-IP route limiter). */
export const MAX_GUEST_CONFIRMATION_EMAILS_PER_EMAIL_PER_DAY = 3;
/** An address may hold at most this many pending (unconfirmed, unexpired) guest rows at once. */
export const MAX_PENDING_GUEST_ROWS_PER_EMAIL = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FRONTEND_URL = () => process.env.FRONTEND_URL || 'https://finda.sale';

/** The one answer every valid-shaped anonymous request gets. */
export const GUEST_SUBSCRIBE_PENDING_MESSAGE =
  'Check your email to confirm. We only send sale reminders to this address after you confirm.';

const confirmationCounter = createRateLimitStore('rl:guestSubConfirm:');
confirmationCounter?.init?.({ windowMs: DAY_MS } as never);

/** True when this address may still be sent a confirmation email today (counts the attempt). Fails closed. */
async function allowConfirmationEmail(email: string): Promise<boolean> {
  try {
    if (!confirmationCounter) return false;
    const { totalHits } = await confirmationCounter.increment(email);
    return totalHits <= MAX_GUEST_CONFIRMATION_EMAILS_PER_EMAIL_PER_DAY;
  } catch (err) {
    console.warn('[guestSubscribe] confirmation throttle unavailable, not sending:', err instanceof Error ? err.message : err);
    return false;
  }
}

export const hashGuestConfirmToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

export const newGuestConfirmToken = (): string => crypto.randomBytes(32).toString('base64url');

// ---------------------------------------------------------------------------
// Opt-out token: stateless HMAC over the address, own domain-separation purpose
// ---------------------------------------------------------------------------

const unsubSecret = (): string => process.env.NOTIFY_ME_UNSUB_SECRET || process.env.JWT_SECRET || '';

export function signGuestReminderUnsubToken(email: string): string | null {
  const secret = unsubSecret();
  if (!secret) return null;
  const payload = Buffer.from(email.trim().toLowerCase(), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`guest-sale-reminder-unsub:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

/** The lowercased address the token was issued for, or null when the token is invalid. */
export function verifyGuestReminderUnsubToken(token: string): string | null {
  const secret = unsubSecret();
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = crypto.createHmac('sha256', secret).update(`guest-sale-reminder-unsub:${parts[0]}`).digest('base64url');
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const email = Buffer.from(parts[0], 'base64url').toString('utf8').trim().toLowerCase();
  return email.includes('@') ? email : null;
}

export const guestUnsubscribeUrls = (email: string): { page: string; oneClick: string } | null => {
  const token = signGuestReminderUnsubToken(email);
  if (!token) return null;
  const url = `${FRONTEND_URL()}/api/notifications/guest-unsubscribe?token=${encodeURIComponent(token)}`;
  return { page: url, oneClick: url };
};

/** Stops reminder emails for every guest row of an address. Returns how many rows were newly opted out. */
export async function unsubscribeGuestReminderEmail(email: string, now: Date = new Date()): Promise<number> {
  const e = email.trim().toLowerCase();
  const r = await prisma.saleSubscriber.updateMany({
    where: { userId: null, email: e, emailOptOutAt: null },
    data: { emailOptOutAt: now },
  });
  return r.count;
}

// ---------------------------------------------------------------------------
// Confirmation email
// ---------------------------------------------------------------------------

export function buildGuestSubscriptionConfirmEmail(opts: {
  saleTitle: string;
  confirmUrl: string;
  unsubUrl: string;
}): { subject: string; html: string; text: string } {
  const { saleTitle, confirmUrl, unsubUrl } = opts;
  const esc = escapeHtml;
  const subject = 'Confirm your FindA.Sale sale reminders';
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:24px 12px;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e5e4;">
<tr><td style="background:#d97706;padding:20px 28px;"><span style="font-size:22px;font-weight:700;color:#ffffff;">FindA.Sale</span></td></tr>
<tr><td style="padding:24px 28px;">
<p style="margin:0 0 12px;font-size:15px;color:#292524;">Someone asked us to email this address a reminder before <strong>${esc(saleTitle)}</strong> opens.</p>
<p style="margin:0 0 20px;font-size:15px;color:#292524;">If that was you, confirm below. We will not send you any reminders until you do.</p>
<p style="margin:0 0 20px;text-align:center;"><a href="${esc(confirmUrl)}" style="display:inline-block;background:#d97706;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Yes, send me reminders</a></p>
<p style="margin:0;font-size:13px;color:#78716c;line-height:1.6;">If you did not ask for this, ignore this email and nothing will be sent. The link works once, for 48 hours.</p>
</td></tr>
<tr><td style="padding:14px 28px;background:#f5f5f4;border-top:1px solid #e7e5e4;text-align:center;">
<p style="margin:0;font-size:12px;color:#78716c;"><a href="${esc(unsubUrl)}" style="color:#78716c;">Never send sale reminders to this address</a></p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    `Someone asked us to email this address a reminder before "${saleTitle}" opens.`,
    '',
    'If that was you, confirm here. We will not send you any reminders until you do:',
    confirmUrl,
    '',
    'If you did not ask for this, ignore this email and nothing will be sent. The link works once, for 48 hours.',
    '',
    `Never send sale reminders to this address: ${unsubUrl}`,
  ].join('\n');
  return { subject, html, text };
}

async function sendConfirmationEmail(email: string, saleTitle: string, token: string): Promise<void> {
  const urls = guestUnsubscribeUrls(email);
  if (!urls) {
    console.error('[guestSubscribe] No HMAC secret configured (JWT_SECRET / NOTIFY_ME_UNSUB_SECRET); cannot send confirmation email.');
    return;
  }
  const confirmUrl = `${FRONTEND_URL()}/confirm-subscription?token=${encodeURIComponent(token)}`;
  const content = buildGuestSubscriptionConfirmEmail({ saleTitle, confirmUrl, unsubUrl: urls.page });
  try {
    await transactionalEmailService.emails.send({
      to: email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      headers: {
        'List-Unsubscribe': `<${urls.oneClick}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
  } catch (err) {
    // The row stays pending; send problems are never surfaced to the caller.
    console.error(`[guestSubscribe] confirmation email to ${maskEmail(email)} failed:`, err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Request + confirm
// ---------------------------------------------------------------------------

export type GuestSubscribeInput = { saleId: unknown; email: unknown };
export type GuestSubscribeResult =
  | { ok: true; message: string }
  | { ok: false; status: 400 | 404; code: 'SALE_ID_REQUIRED' | 'INVALID_EMAIL' | 'SALE_NOT_FOUND'; message: string };

/**
 * Validates the request, stores or refreshes the PENDING row and (throttled) sends the confirmation email. Every
 * request that passes validation gets the same GUEST_SUBSCRIBE_PENDING_MESSAGE.
 */
export async function requestGuestEmailSubscription(input: GuestSubscribeInput, now: Date = new Date()): Promise<GuestSubscribeResult> {
  if (typeof input.saleId !== 'string' || !input.saleId.trim()) {
    return { ok: false, status: 400, code: 'SALE_ID_REQUIRED', message: 'Sale ID is required' };
  }
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL_FORMAT.test(email)) {
    return { ok: false, status: 400, code: 'INVALID_EMAIL', message: 'Enter a valid email address.' };
  }
  const saleId = input.saleId.trim();

  const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { id: true, title: true, status: true, deletedAt: true } });
  if (!sale || sale.deletedAt || sale.status !== 'PUBLISHED') {
    return { ok: false, status: 404, code: 'SALE_NOT_FOUND', message: 'Sale not found' };
  }

  const pendingAnswer: GuestSubscribeResult = { ok: true, message: GUEST_SUBSCRIBE_PENDING_MESSAGE };

  try {
    // Addresses we never email (blocked domain, suppression, our own zone) get the same answer and nothing is stored.
    if (isEmailDomainBlocked(email) || (await suppressionService.isSuppressed(email))) return pendingAnswer;

    const existing = await prisma.saleSubscriber.findFirst({
      where: { saleId, userId: null, email },
      select: { id: true, emailConfirmedAt: true, emailOptOutAt: true },
    });
    // Already confirmed and active: nothing to send. A row that opted out (or is pending) is re-armed below as a
    // PENDING row: the opt-out is only ever cleared together with emailConfirmedAt, so nothing is sent to the address
    // until its owner confirms again with the new single-use link.
    if (existing?.emailConfirmedAt && !existing.emailOptOutAt) return pendingAnswer;

    if (!existing) {
      const pendingCount = await prisma.saleSubscriber.count({
        where: { userId: null, email, emailConfirmedAt: null, emailConfirmExpiresAt: { gt: now } },
      });
      if (pendingCount >= MAX_PENDING_GUEST_ROWS_PER_EMAIL) return pendingAnswer;
    }

    if (!(await allowConfirmationEmail(email))) return pendingAnswer;

    const token = newGuestConfirmToken();
    const data = {
      emailConfirmTokenHash: hashGuestConfirmToken(token),
      emailConfirmExpiresAt: new Date(now.getTime() + GUEST_EMAIL_CONFIRM_TTL_MS),
    };
    if (existing) {
      await prisma.saleSubscriber.update({ where: { id: existing.id }, data: { ...data, emailConfirmedAt: null, emailOptOutAt: null } });
    } else {
      await prisma.saleSubscriber.create({
        data: { saleId, userId: null, email, phone: null, emailConfirmedAt: null, ...data },
      });
    }
    await sendConfirmationEmail(email, sale.title, token);
  } catch (err) {
    // Never reveal a failure or its absence: log and give the same answer.
    console.error('[guestSubscribe] request failed:', err instanceof Error ? err.message : err);
  }
  return pendingAnswer;
}

export type GuestConfirmResult = { ok: true; saleId: string; saleTitle: string | null } | { ok: false };

/** Single-use, 48 hour confirmation. The token is cleared by the same update that confirms the row. */
export async function confirmGuestEmailSubscription(token: unknown, now: Date = new Date()): Promise<GuestConfirmResult> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return { ok: false };
  const hash = hashGuestConfirmToken(token);
  const row = await prisma.saleSubscriber.findUnique({
    where: { emailConfirmTokenHash: hash },
    select: { id: true, saleId: true, sale: { select: { title: true } } },
  });
  if (!row) return { ok: false };
  const claim = await prisma.saleSubscriber.updateMany({
    where: {
      id: row.id,
      emailConfirmTokenHash: hash,
      emailConfirmedAt: null,
      emailOptOutAt: null,
      emailConfirmExpiresAt: { gt: now },
    },
    data: { emailConfirmedAt: now, emailConfirmTokenHash: null, emailConfirmExpiresAt: null },
  });
  if (claim.count !== 1) return { ok: false };
  return { ok: true, saleId: row.saleId, saleTitle: row.sale?.title ?? null };
}
