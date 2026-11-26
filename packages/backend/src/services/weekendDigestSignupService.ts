/**
 * Guest "weekend sales email" signup (2026-11-26).
 *
 * A visitor without an account types an email and a ZIP code into the signup box (homepage, city hubs,
 * this-weekend pages, sale pages). After they click the confirmation link, they get the Friday weekend
 * digest with sales near that ZIP (jobs/notificationJob.ts -> sendWeeklyDigest -> sendGuestWeeklyDigest).
 *
 * Storage (no schema change, so no production migration is needed): one SearchNotification row per
 * address, with the reserved searchQuery WEEKEND_DIGEST_QUERY and the ZIP code in `city`.
 *   - confirmedAt   set when the confirmation link is clicked (double opt-in; unconfirmed rows never get mail)
 *   - isActive      false after an unsubscribe (expiredAt stays null, so it reads as an opt-out)
 *   - lastCheckedAt time of the last digest sent to this guest (the per-edition "already sent" marker)
 * Every SearchNotification reader that handles Notify Me alerts excludes this reserved query
 * (notifyMeSenderService.loadTargets / expireOldEntries, searchNotificationController, admin counts), and
 * POST /api/search/notify refuses any query starting with "__" so nobody can create one through that route.
 *
 * Abuse resistance mirrors the Notify Me double opt-in:
 *   - The response is identical for new / existing / confirmed / opted-out addresses (no oracle).
 *   - The ZIP lives inside the signed confirmation token, so an anonymous request can never change the ZIP of
 *     a confirmed subscriber: the row only changes when the address owner clicks the link.
 *   - At most MAX_CONFIRMATION_EMAILS_PER_EMAIL_PER_DAY confirmation emails per address per day, on top of
 *     the per-IP searchLimiter on the route. Suppressed / blocked addresses never get one.
 *   - Tokens are HMACs with their own purpose strings ('weekend-digest-confirm', 'weekend-digest-unsub'),
 *     so they cannot be replayed against Notify Me or any other flow.
 */

import crypto from 'crypto';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { suppressionService, isEmailDomainBlocked } from './suppressionService';

/** Reserved SearchNotification.searchQuery marking a weekend-digest guest signup. */
export const WEEKEND_DIGEST_QUERY = '__weekend_digest__';

/** True for searchQuery values reserved for internal use (never a shopper's Notify Me alert). */
export function isReservedSearchQuery(q: string | null | undefined): boolean {
  return typeof q === 'string' && q.trim().startsWith('__');
}

/** Prisma where-fragment that keeps only real Notify Me alerts (excludes reserved rows). */
export const NOT_RESERVED_SEARCH_QUERY = { NOT: { searchQuery: { startsWith: '__' } } };

export const WEEKEND_DIGEST_CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_DIGEST_CONFIRMATIONS_PER_EMAIL_PER_DAY = 3;
/** Radius (same unit as the sale feed's near-me filter) around the guest's ZIP. */
export const GUEST_DIGEST_RADIUS = 40;

export const PENDING_DIGEST_MESSAGE =
  'Check your email and tap the link to confirm. Your first weekend email comes the Friday after you confirm.';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_RE = /^\d{5}$/;

function frontendUrl(): string {
  return process.env.FRONTEND_URL || 'https://finda.sale';
}

function secret(): string {
  return process.env.NOTIFY_ME_UNSUB_SECRET || process.env.JWT_SECRET || '';
}

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  if (!e || e.length > 254 || !EMAIL_RE.test(e)) return null;
  return e;
}

export function normalizeZip(zip: unknown): string | null {
  if (typeof zip !== 'string' && typeof zip !== 'number') return null;
  const z = String(zip).trim().slice(0, 5);
  return ZIP_RE.test(z) ? z : null;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

function sign(purpose: string, payload: string, key: string): string {
  return crypto.createHmac('sha256', key).update(`${purpose}:${payload}`).digest('base64url');
}

function verifySig(purpose: string, token: unknown): string | null {
  const key = secret();
  if (!key || typeof token !== 'string' || token.length > 2000) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(sign(purpose, parts[0], key));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return parts[0];
}

export function signDigestConfirmToken(email: string, zip: string, now: number = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const payload = Buffer.from(
    JSON.stringify({ e: email.trim().toLowerCase(), z: zip, x: now + WEEKEND_DIGEST_CONFIRM_TTL_MS }),
    'utf8'
  ).toString('base64url');
  return `${payload}.${sign('weekend-digest-confirm', payload, key)}`;
}

export function verifyDigestConfirmToken(token: unknown, now: number = Date.now()): { email: string; zip: string } | null {
  const payload = verifySig('weekend-digest-confirm', token);
  if (!payload) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { e?: unknown; z?: unknown; x?: unknown };
    if (typeof d.x !== 'number' || d.x < now) return null;
    const email = normalizeEmail(d.e);
    const zip = normalizeZip(d.z);
    return email && zip ? { email, zip } : null;
  } catch {
    return null;
  }
}

export function signDigestUnsubToken(email: string): string | null {
  const key = secret();
  if (!key) return null;
  const payload = Buffer.from(email.trim().toLowerCase(), 'utf8').toString('base64url');
  return `${payload}.${sign('weekend-digest-unsub', payload, key)}`;
}

export function verifyDigestUnsubToken(token: unknown): string | null {
  const payload = verifySig('weekend-digest-unsub', token);
  if (!payload) return null;
  try {
    return normalizeEmail(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function digestUnsubUrl(email: string): string | null {
  const t = signDigestUnsubToken(email);
  return t ? `${frontendUrl()}/api/digest/unsubscribe?token=${encodeURIComponent(t)}` : null;
}

// ---------------------------------------------------------------------------
// Confirmation email
// ---------------------------------------------------------------------------

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function buildDigestConfirmEmail(opts: { zip: string; confirmUrl: string; unsubUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const { zip, confirmUrl, unsubUrl } = opts;
  const subject = 'Confirm your weekend sales email';
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:24px 12px;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e5e4;">
<tr><td style="background:#d97706;padding:20px 28px;"><span style="font-size:22px;font-weight:700;color:#ffffff;">FindA.Sale</span></td></tr>
<tr><td style="padding:24px 28px;">
<p style="margin:0 0 12px;font-size:15px;color:#292524;">Someone asked us to send this address a short email every Friday with the garage sales, estate sales and flea markets near ZIP code <strong>${esc(zip)}</strong>.</p>
<p style="margin:0 0 20px;font-size:15px;color:#292524;">If that was you, confirm below. We will not send you anything until you do.</p>
<p style="margin:0 0 20px;text-align:center;"><a href="${esc(confirmUrl)}" style="display:inline-block;background:#d97706;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Yes, send me weekend sales</a></p>
<p style="margin:0;font-size:13px;color:#78716c;line-height:1.6;">If you did not ask for this, ignore this email and nothing will be sent. The link works for 7 days.</p>
</td></tr>
<tr><td style="padding:14px 28px;background:#f5f5f4;border-top:1px solid #e7e5e4;text-align:center;">
<p style="margin:0;font-size:12px;color:#78716c;"><a href="${esc(unsubUrl)}" style="color:#78716c;">Never send me the weekend sales email</a></p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    `Someone asked us to send this address a short email every Friday with the garage sales, estate sales and flea markets near ZIP code ${zip}.`,
    '',
    'If that was you, confirm here. We will not send you anything until you do:',
    confirmUrl,
    '',
    'If you did not ask for this, ignore this email and nothing will be sent. The link works for 7 days.',
    '',
    `Never send me the weekend sales email: ${unsubUrl}`,
  ].join('\n');
  return { subject, html, text };
}

// Per-address counter on the shared (Redis-when-ready, memory-otherwise) limiter store. Created lazily, so
// the Friday digest job (which imports this module) never opens a limiter connection it does not need.
let confirmationCounter: ReturnType<typeof import('../middleware/rateLimitShared').createRateLimitStore> | undefined;

async function getConfirmationCounter() {
  if (confirmationCounter === undefined) {
    const { createRateLimitStore } = await import('../middleware/rateLimitShared');
    confirmationCounter = createRateLimitStore('rl:digestConfirmEmail:');
    confirmationCounter?.init?.({ windowMs: 24 * 60 * 60 * 1000 } as never);
  }
  return confirmationCounter;
}

async function allowConfirmationEmail(email: string): Promise<boolean> {
  try {
    const confirmationCounter = await getConfirmationCounter();
    if (!confirmationCounter) return false;
    const { totalHits } = await confirmationCounter.increment(email);
    return totalHits <= MAX_DIGEST_CONFIRMATIONS_PER_EMAIL_PER_DAY;
  } catch (err) {
    console.warn('[weekendDigest] confirmation throttle unavailable, not sending:', err instanceof Error ? err.message : err);
    return false;
  }
}

async function sendConfirmationEmail(email: string, zip: string): Promise<void> {
  const confirmToken = signDigestConfirmToken(email, zip);
  const unsubUrl = digestUnsubUrl(email);
  if (!confirmToken || !unsubUrl) {
    console.error('[weekendDigest] No HMAC secret configured (NOTIFY_ME_UNSUB_SECRET / JWT_SECRET); cannot send confirmation.');
    return;
  }
  if (await suppressionService.isSuppressed(email)) return;
  if (!(await allowConfirmationEmail(email))) return;
  const content = buildDigestConfirmEmail({
    zip,
    confirmUrl: `${frontendUrl()}/api/digest/confirm?token=${encodeURIComponent(confirmToken)}`,
    unsubUrl,
  });
  try {
    // Lazy import: the Friday digest job imports this module and never needs the transactional rail.
    const { transactionalEmailService } = await import('../lib/transactionalEmailService');
    await transactionalEmailService.emails.send({ to: email, subject: content.subject, html: content.html, text: content.text });
  } catch (err) {
    console.error('[weekendDigest] confirmation email failed:', err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Signup / confirm / unsubscribe
// ---------------------------------------------------------------------------

export type SignupResult =
  | { ok: true; status: 'pending_confirmation' | 'subscribed' | 'opted_out' }
  | { ok: false; error: 'invalid_email' | 'invalid_zip' | 'blocked_email' };

/**
 * Handles a signup request. `sessionEmail` is the signed-in account's email (or null): a signed-in visitor
 * signing up their OWN account email is confirmed at once, since the session already proves the address.
 */
export async function requestDigestSignup(
  rawEmail: unknown,
  rawZip: unknown,
  sessionEmail: string | null,
  now: Date = new Date()
): Promise<SignupResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: 'invalid_email' };
  const zip = normalizeZip(rawZip);
  if (!zip) return { ok: false, error: 'invalid_zip' };
  if (isEmailDomainBlocked(email)) return { ok: false, error: 'blocked_email' };

  const ownEmail = sessionEmail !== null && sessionEmail.trim().toLowerCase() === email;
  const row = await prisma.searchNotification.findUnique({
    where: { email_searchQuery: { email, searchQuery: WEEKEND_DIGEST_QUERY } },
  });

  if (ownEmail) {
    // The account owner's session proves the address, so this also re-subscribes after an unsubscribe.
    await prisma.searchNotification.upsert({
      where: { email_searchQuery: { email, searchQuery: WEEKEND_DIGEST_QUERY } },
      create: { email, searchQuery: WEEKEND_DIGEST_QUERY, city: zip, isActive: true, armedAt: now, confirmedAt: now },
      update: { city: zip, isActive: true, expiredAt: null, confirmedAt: row?.confirmedAt ?? now },
    });
    return { ok: true, status: 'subscribed' };
  }

  // Anonymous caller. Opted out: no email, same response as everyone else.
  if (row && !row.isActive && !row.expiredAt) return { ok: true, status: 'pending_confirmation' };

  if (!row) {
    try {
      await prisma.searchNotification.create({
        data: { email, searchQuery: WEEKEND_DIGEST_QUERY, city: zip, isActive: true, armedAt: now, confirmedAt: null },
      });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err; // parallel request created it: fall through to the email
    }
  } else if (!row.confirmedAt) {
    // Still pending: keep the latest ZIP (the link that gets clicked sets it anyway).
    await prisma.searchNotification.update({ where: { id: row.id }, data: { city: zip, isActive: true, expiredAt: null } });
  }
  // Confirmed subscribers are never changed here; the link (which carries the new ZIP) does it on click.
  void sendConfirmationEmail(email, zip);
  return { ok: true, status: 'pending_confirmation' };
}

/** Applies a confirmation link. Returns the confirmed ZIP, or null for a bad / expired token. */
export async function confirmDigestSignup(token: unknown, now: Date = new Date()): Promise<{ zip: string } | null> {
  const v = verifyDigestConfirmToken(token, now.getTime());
  if (!v) return null;
  const row = await prisma.searchNotification.findUnique({
    where: { email_searchQuery: { email: v.email, searchQuery: WEEKEND_DIGEST_QUERY } },
  });
  // A click on a fresh link is the owner's own consent, so it also re-subscribes after an unsubscribe.
  await prisma.searchNotification.upsert({
    where: { email_searchQuery: { email: v.email, searchQuery: WEEKEND_DIGEST_QUERY } },
    create: { email: v.email, searchQuery: WEEKEND_DIGEST_QUERY, city: v.zip, isActive: true, armedAt: now, confirmedAt: now },
    update: { city: v.zip, isActive: true, expiredAt: null, confirmedAt: row?.confirmedAt ?? now },
  });
  return { zip: v.zip };
}

/** Stops the weekend email for the token's address. Returns false for a bad token. */
export async function unsubscribeDigest(token: unknown): Promise<boolean> {
  const email = verifyDigestUnsubToken(token);
  if (!email) return false;
  await prisma.searchNotification.updateMany({
    where: { email, searchQuery: WEEKEND_DIGEST_QUERY, isActive: true },
    data: { isActive: false, expiredAt: null },
  });
  return true;
}

// ---------------------------------------------------------------------------
// ZIP -> location
// ---------------------------------------------------------------------------

const zipCache = new Map<string, { lat: number; lng: number } | null>();

/**
 * Center of a ZIP code. First the average position of geocoded sales in that ZIP (no network call),
 * then OpenStreetMap Nominatim's postal-code search. Cached per process. Null when unknown.
 */
export async function geocodeZip(zip: string): Promise<{ lat: number; lng: number } | null> {
  if (zipCache.has(zip)) return zipCache.get(zip) ?? null;
  let out: { lat: number; lng: number } | null = null;
  try {
    const agg = await prisma.sale.aggregate({
      where: { zip, lat: { not: null }, lng: { not: null } },
      _avg: { lat: true, lng: true },
    });
    if (typeof agg._avg.lat === 'number' && typeof agg._avg.lng === 'number') {
      out = { lat: agg._avg.lat, lng: agg._avg.lng };
    }
  } catch (err) {
    console.warn('[weekendDigest] ZIP centroid query failed:', err instanceof Error ? err.message : err);
  }
  if (!out) {
    try {
      const resp = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { postalcode: zip, country: 'us', format: 'json', limit: 1 },
        headers: { 'User-Agent': 'FindA.Sale/1.0 (https://finda.sale; support@finda.sale)' },
        timeout: 8000,
      });
      const hit = Array.isArray(resp.data) ? resp.data[0] : null;
      const lat = hit ? parseFloat(hit.lat) : NaN;
      const lng = hit ? parseFloat(hit.lon) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lng)) out = { lat, lng };
      await new Promise((r) => setTimeout(r, 1100)); // Nominatim: at most 1 request per second
    } catch (err) {
      console.warn('[weekendDigest] ZIP geocode failed:', err instanceof Error ? err.message : err);
      return null; // do not cache a network failure
    }
  }
  zipCache.set(zip, out);
  return out;
}

/** Confirmed, active guest signups. */
export async function loadConfirmedDigestGuests(): Promise<Array<{ id: string; email: string; zip: string; lastSentAt: Date | null }>> {
  const rows = await prisma.searchNotification.findMany({
    where: { searchQuery: WEEKEND_DIGEST_QUERY, isActive: true, confirmedAt: { not: null } },
    select: { id: true, email: true, city: true, lastCheckedAt: true },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  });
  return rows
    .map((r) => ({ id: r.id, email: (r.email || '').trim().toLowerCase(), zip: normalizeZip(r.city) || '', lastSentAt: r.lastCheckedAt }))
    .filter((r) => r.email && r.zip);
}

export async function markDigestGuestSent(id: string, at: Date): Promise<void> {
  await prisma.searchNotification.update({ where: { id }, data: { lastCheckedAt: at } });
}
