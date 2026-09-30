/**
 * Shopper "Notify Me" sender (Feature #455).
 *
 * Closes the loop on the two Notify Me capture paths, which previously stored rows that nothing
 * ever read:
 *   - SearchNotification      anonymous email capture from /search "Get notified when this appears"
 *   - ShopperWaitlistEntry    logged-in shopper waitlist (POST /api/shopper/waitlist)
 *
 * What it does on each run (see jobs/notifyMeSenderJob.ts for the schedule + flag):
 *   1. Loads active, not-yet-notified entries from both tables.
 *   2. Matches each entry against sales / items that became public AFTER the entry was created
 *      (all words of the query must appear in title / description / category, optional city filter).
 *   3. Groups by recipient email: ONE email per person per run, and never more than one email per
 *      person per 24 hours (a person's later matches wait for the next day's run).
 *   4. Honors suppression (opt-out, hard bounce, complaint, blocked/unsendable domains, our own
 *      finda.sale zone) and refuses to send if no unsubscribe secret is configured.
 *   5. Claims entries (notifiedAt = now) BEFORE sending so two overlapping runs cannot double-send,
 *      and releases the claim if the send fails so the entry is retried next run.
 *   6. Sends via the Resend transactional rail (lib/transactionalEmailService). These are alerts the
 *      shopper explicitly asked for, so they must not depend on the at-risk Gmail outreach account.
 *
 * Entry lifecycle: an entry is one-shot. Once notifiedAt is set it is not matched again. A shopper who
 * wants another alert re-adds it (the waitlist POST route re-arms a notified entry; the anonymous
 * notify endpoint does the same). Unsubscribe deactivates every entry for that email.
 *
 * 2026-09-29 hardening (adversarial review):
 *   - "since" is armedAt ?? createdAt. armedAt is written only at create / re-arm, never by this
 *     service's claim/release, so a retry after a failed send no longer loses matches.
 *   - Fair rotation: targets are loaded oldest-lastCheckedAt first (never-checked first) and stamped
 *     after examination, so entries that never match cannot starve newer entries. The durable column
 *     replaces an in-memory cursor (it also works across Railway instances and restarts).
 *   - Entries expire after 90 days (deactivated; SearchNotification.expiredAt marks it as an expiry,
 *     not an opt-out).
 *   - Anonymous captures are double opt-in: only entries with confirmedAt are ever emailed. Logged-in
 *     waitlist entries are tied to the account email and confirmed by definition.
 *   - Email subjects are generic (no user-supplied search term); the escaped term appears in the body.
 *
 * Safety: the job is OFF unless NOTIFY_ME_SENDER_ENABLED=true; NOTIFY_ME_DRY_RUN=true computes and
 * logs without claiming or sending; NOTIFY_ME_MAX_EMAILS_PER_RUN (default 50) is a hard per-run fuse.
 */

import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { suppressionService, isEmailDomainBlocked } from './suppressionService';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

export type NotifyTargetSource = 'SEARCH' | 'WAITLIST';

export interface NotifyTarget {
  source: NotifyTargetSource;
  id: string;
  email: string;
  term: string;
  city: string | null;
  /** Only sales/items created after this instant count as "new" for this entry (armedAt ?? createdAt). */
  since: Date;
  /** Alert age origin used for the 90-day expiry (armedAt ?? createdAt). Same as since. */
  armedAt: Date;
}

export interface MatchedItem {
  id: string;
  title: string;
  price: number | null;
  saleTitle: string;
  city: string;
  state: string;
}

export interface MatchedSale {
  id: string;
  title: string;
  city: string;
  state: string;
  startDate: Date;
}

export interface NotifyMeRunSummary {
  enabled: boolean;
  dryRun: boolean;
  targetsLoaded: number;
  recipients: number;
  emailed: number;
  wouldEmail: number;
  skippedRecentlyNotified: number;
  skippedNoMatch: number;
  skippedSuppressed: number;
  skippedExpired: number;
  failed: number;
  fuseTripped: boolean;
  aborted: string | null;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function notifyMeSenderEnabled(): boolean {
  return process.env.NOTIFY_ME_SENDER_ENABLED === 'true';
}

export function notifyMeDryRun(): boolean {
  return process.env.NOTIFY_ME_DRY_RUN === 'true';
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

export function notifyMeMaxEmailsPerRun(): number {
  return intEnv('NOTIFY_ME_MAX_EMAILS_PER_RUN', 50, 1, 500);
}

export function notifyMeMaxTargetsPerRun(): number {
  return intEnv('NOTIFY_ME_MAX_TARGETS_PER_RUN', 300, 1, 2000);
}

/** Items/sales created longer ago than this are never surfaced by an alert. */
const LOOKBACK_DAYS = 30;
/** Alerts older than this (from armedAt ?? createdAt) are deactivated instead of matched. */
export const NOTIFY_ME_EXPIRY_DAYS = 90;
/** How long a confirmation link stays valid. */
export const NOTIFY_CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PER_PERSON_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_ITEMS_IN_EMAIL = 8;
const MAX_SALES_IN_EMAIL = 5;

// ---------------------------------------------------------------------------
// Unsubscribe token (stateless HMAC, no DB row needed: works for anonymous emails too)
// ---------------------------------------------------------------------------

function unsubSecret(): string {
  return process.env.NOTIFY_ME_UNSUB_SECRET || process.env.JWT_SECRET || '';
}

export function signNotifyMeToken(email: string): string | null {
  const secret = unsubSecret();
  if (!secret) return null;
  const payload = Buffer.from(email.trim().toLowerCase(), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`notify-me-unsub:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

/** Returns the lowercased email the token was issued for, or null if the token is invalid. */
export function verifyNotifyMeToken(token: string): string | null {
  const secret = unsubSecret();
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = crypto.createHmac('sha256', secret).update(`notify-me-unsub:${parts[0]}`).digest('base64url');
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const email = Buffer.from(parts[0], 'base64url').toString('utf8').trim().toLowerCase();
    return email.includes('@') ? email : null;
  } catch {
    return null;
  }
}

// Confirmation token (double opt-in). Same HMAC secret as the unsubscribe token but a DIFFERENT
// domain-separation purpose string ('notify-confirm' vs 'notify-me-unsub'), so a token minted for one
// purpose can never be replayed for the other. The payload also carries an expiry.
export function signNotifyConfirmToken(email: string, now: number = Date.now(), ttlMs: number = NOTIFY_CONFIRM_TTL_MS): string | null {
  const secret = unsubSecret();
  if (!secret) return null;
  const payload = Buffer.from(JSON.stringify({ e: email.trim().toLowerCase(), x: now + ttlMs }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`notify-confirm:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

/** Returns the lowercased email a confirmation token was issued for, or null (bad signature / expired). */
export function verifyNotifyConfirmToken(token: string, now: number = Date.now()): string | null {
  const secret = unsubSecret();
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = crypto.createHmac('sha256', secret).update(`notify-confirm:${parts[0]}`).digest('base64url');
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as { e?: unknown; x?: unknown };
    if (typeof decoded.e !== 'string' || typeof decoded.x !== 'number') return null;
    if (decoded.x < now) return null;
    const email = decoded.e.trim().toLowerCase();
    return email.includes('@') ? email : null;
  } catch {
    return null;
  }
}

/** Confirms every pending (unconfirmed, active) anonymous alert for an email. Returns how many. */
export async function confirmNotifyMeEmail(email: string, now: Date = new Date()): Promise<number> {
  const e = email.trim().toLowerCase();
  const r = await prisma.searchNotification.updateMany({
    where: { email: e, isActive: true, confirmedAt: null },
    data: { confirmedAt: now },
  });
  return r.count;
}

/** Deactivates every Notify Me entry (anonymous + logged-in) for an email. */
export async function unsubscribeNotifyMeEmail(email: string): Promise<{ search: number; waitlist: number }> {
  const e = email.trim().toLowerCase();
  const search = await prisma.searchNotification.updateMany({
    where: { email: e, isActive: true },
    data: { isActive: false },
  });
  const waitlist = await prisma.shopperWaitlistEntry.updateMany({
    where: { isActive: true, user: { email: { equals: e, mode: 'insensitive' } } },
    data: { isActive: false },
  });
  return { search: search.count, waitlist: waitlist.count };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export function tokenizeTerm(term: string): string[] {
  const words = (term || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
  return Array.from(new Set(words)).slice(0, 6);
}

function saleVisibilityWhere(now: Date, city: string | null): any[] {
  const clauses: any[] = [
    { OR: [{ isOngoing: true }, { endDate: { gte: now } }] },
    // Rank-based early access: publishedAt in the future means not yet publicly accessible.
    { OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] },
  ];
  if (city) clauses.push({ city: { contains: city, mode: 'insensitive' } });
  return clauses;
}

export function buildItemWhere(target: NotifyTarget, now: Date): any | null {
  const tokens = tokenizeTerm(target.term);
  if (tokens.length === 0) return null;
  return {
    status: 'AVAILABLE',
    isActive: true,
    draftStatus: 'PUBLISHED',
    moderationStatus: 'APPROVED',
    createdAt: { gt: target.since },
    sale: {
      status: 'PUBLISHED',
      deletedAt: null,
      isInventoryContainer: false,
      AND: saleVisibilityWhere(now, target.city),
    },
    AND: tokens.map((t) => ({
      OR: [
        { title: { contains: t, mode: 'insensitive' } },
        { description: { contains: t, mode: 'insensitive' } },
        { category: { contains: t, mode: 'insensitive' } },
      ],
    })),
  };
}

export function buildSaleWhere(target: NotifyTarget, now: Date): any | null {
  const tokens = tokenizeTerm(target.term);
  if (tokens.length === 0) return null;
  return {
    status: 'PUBLISHED',
    deletedAt: null,
    isInventoryContainer: false,
    createdAt: { gt: target.since },
    AND: [
      ...saleVisibilityWhere(now, target.city),
      ...tokens.map((t) => ({
        OR: [
          { title: { contains: t, mode: 'insensitive' } },
          { description: { contains: t, mode: 'insensitive' } },
          { city: { contains: t, mode: 'insensitive' } },
        ],
      })),
    ],
  };
}

export async function findMatchesForTarget(
  target: NotifyTarget,
  now: Date = new Date()
): Promise<{ items: MatchedItem[]; sales: MatchedSale[] }> {
  const lookbackFloor = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const effective: NotifyTarget = { ...target, since: target.since > lookbackFloor ? target.since : lookbackFloor };

  const itemWhere = buildItemWhere(effective, now);
  const saleWhere = buildSaleWhere(effective, now);
  if (!itemWhere || !saleWhere) return { items: [], sales: [] };

  const [items, sales] = await Promise.all([
    prisma.item.findMany({
      where: itemWhere,
      select: {
        id: true,
        title: true,
        price: true,
        sale: { select: { title: true, city: true, state: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ITEMS_IN_EMAIL,
    }),
    prisma.sale.findMany({
      where: saleWhere,
      select: { id: true, title: true, city: true, state: true, startDate: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_SALES_IN_EMAIL,
    }),
  ]);

  return {
    items: items.map((i: any) => ({
      id: i.id,
      title: i.title,
      price: typeof i.price === 'number' ? i.price : null,
      saleTitle: i.sale?.title ?? '',
      city: i.sale?.city ?? '',
      state: i.sale?.state ?? '',
    })),
    sales: sales.map((s: any) => ({
      id: s.id,
      title: s.title,
      city: s.city,
      state: s.state,
      startDate: s.startDate,
    })),
  };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildNotifyMeEmail(opts: {
  terms: string[];
  items: MatchedItem[];
  sales: MatchedSale[];
  unsubUrl: string;
  isAccountHolder: boolean;
}): { subject: string; html: string; text: string } {
  const { terms, items, sales, unsubUrl, isAccountHolder } = opts;
  const primary = terms[0] || 'your search';
  // The subject never contains the user-supplied search term (it is attacker-controlled text that would
  // land in third-party inboxes as a subject line). The escaped term is shown in the body only.
  const subject =
    terms.length === 1
      ? 'New matches for your FindA.Sale alert'
      : `New matches for your ${terms.length} FindA.Sale alerts`;

  const searchUrl = `${FRONTEND_URL}/search?q=${encodeURIComponent(primary)}`;
  const manageUrl = isAccountHolder ? `${FRONTEND_URL}/shopper/notify-me` : null;

  const itemRows = items
    .map((i) => {
      const price = i.price != null ? ` - $${i.price.toFixed(2)}` : '';
      const where = [i.saleTitle, [i.city, i.state].filter(Boolean).join(', ')].filter(Boolean).join(' | ');
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #e7e5e4;">
        <a href="${FRONTEND_URL}/items/${esc(i.id)}" style="color:#b45309;font-weight:600;text-decoration:none;">${esc(i.title)}</a><span style="color:#44403c;">${esc(price)}</span><br/>
        <span style="font-size:13px;color:#78716c;">${esc(where)}</span></td></tr>`;
    })
    .join('');

  const saleRows = sales
    .map((s) => {
      const when = new Date(s.startDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #e7e5e4;">
        <a href="${FRONTEND_URL}/sales/${esc(s.id)}" style="color:#b45309;font-weight:600;text-decoration:none;">${esc(s.title)}</a><br/>
        <span style="font-size:13px;color:#78716c;">${esc([s.city, s.state].filter(Boolean).join(', '))} | starts ${esc(when)}</span></td></tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:24px 12px;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e5e4;">
<tr><td style="background:#d97706;padding:22px 28px;"><span style="font-size:22px;font-weight:700;color:#ffffff;">FindA.Sale</span>
<p style="margin:6px 0 0;font-size:14px;color:#fef3c7;">Something you were waiting for just showed up</p></td></tr>
<tr><td style="padding:24px 28px;">
<p style="margin:0 0 16px;font-size:15px;color:#292524;">You asked us to let you know when <strong>${esc(primary)}</strong>${terms.length > 1 ? ' and your other alerts' : ''} turned up. Here is what is new:</p>
${saleRows ? `<h3 style="margin:20px 0 4px;font-size:15px;color:#292524;">Sales</h3><table width="100%" cellpadding="0" cellspacing="0">${saleRows}</table>` : ''}
${itemRows ? `<h3 style="margin:20px 0 4px;font-size:15px;color:#292524;">Items</h3><table width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>` : ''}
<p style="margin:24px 0 0;text-align:center;"><a href="${searchUrl}" style="display:inline-block;background:#d97706;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">See all results</a></p>
</td></tr>
<tr><td style="padding:16px 28px;background:#f5f5f4;border-top:1px solid #e7e5e4;text-align:center;">
<p style="margin:0;font-size:12px;color:#78716c;line-height:1.6;">You are getting this one-time alert because you asked to be notified on FindA.Sale.<br/>
${manageUrl ? `<a href="${manageUrl}" style="color:#78716c;">Manage your alerts</a> &middot; ` : ''}<a href="${unsubUrl}" style="color:#78716c;">Stop all Notify Me emails</a></p>
</td></tr></table></td></tr></table></body></html>`;

  const lines: string[] = [`You asked us to let you know when ${primary} turned up. Here is what is new:`, ''];
  if (sales.length) {
    lines.push('SALES');
    sales.forEach((s) => lines.push(`- ${s.title} (${[s.city, s.state].filter(Boolean).join(', ')}): ${FRONTEND_URL}/sales/${s.id}`));
    lines.push('');
  }
  if (items.length) {
    lines.push('ITEMS');
    items.forEach((i) => lines.push(`- ${i.title}${i.price != null ? ` ($${i.price.toFixed(2)})` : ''}: ${FRONTEND_URL}/items/${i.id}`));
    lines.push('');
  }
  lines.push(`See all results: ${searchUrl}`, '');
  if (manageUrl) lines.push(`Manage your alerts: ${manageUrl}`);
  lines.push(`Stop all Notify Me emails: ${unsubUrl}`);

  return { subject, html, text: lines.join('\n') };
}

/**
 * Double opt-in confirmation email for an anonymous alert. Generic subject (no search term); the term and
 * city are HTML-escaped and only appear in the body. Says plainly that nothing is sent unless the
 * recipient confirms, and carries a one-click "stop" link for people who never asked.
 */
export function buildNotifyMeConfirmEmail(opts: {
  term: string;
  city: string | null;
  confirmUrl: string;
  unsubUrl: string;
}): { subject: string; html: string; text: string } {
  const { term, city, confirmUrl, unsubUrl } = opts;
  const where = city ? ` in ${city}` : '';
  const subject = 'Confirm your FindA.Sale alert';
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:24px 12px;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e5e4;">
<tr><td style="background:#d97706;padding:20px 28px;"><span style="font-size:22px;font-weight:700;color:#ffffff;">FindA.Sale</span></td></tr>
<tr><td style="padding:24px 28px;">
<p style="margin:0 0 12px;font-size:15px;color:#292524;">Someone asked us to email this address when a sale or item matching <strong>${esc(term)}</strong>${esc(where)} is listed.</p>
<p style="margin:0 0 20px;font-size:15px;color:#292524;">If that was you, confirm below. We will not send you anything until you do.</p>
<p style="margin:0 0 20px;text-align:center;"><a href="${esc(confirmUrl)}" style="display:inline-block;background:#d97706;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Yes, email me</a></p>
<p style="margin:0;font-size:13px;color:#78716c;line-height:1.6;">If you did not ask for this, ignore this email and nothing will be sent. The link works for 7 days.</p>
</td></tr>
<tr><td style="padding:14px 28px;background:#f5f5f4;border-top:1px solid #e7e5e4;text-align:center;">
<p style="margin:0;font-size:12px;color:#78716c;"><a href="${esc(unsubUrl)}" style="color:#78716c;">Never email me from FindA.Sale Notify Me</a></p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    `Someone asked us to email this address when a sale or item matching "${term}"${where} is listed.`,
    '',
    'If that was you, confirm here. We will not send you anything until you do:',
    confirmUrl,
    '',
    'If you did not ask for this, ignore this email and nothing will be sent. The link works for 7 days.',
    '',
    `Never email me from FindA.Sale Notify Me: ${unsubUrl}`,
  ].join('\n');
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function loadTargets(limit: number): Promise<NotifyTarget[]> {
  const half = Math.ceil(limit / 2);
  // Fair rotation: never-checked entries first, then oldest-checked. Only CONFIRMED anonymous entries
  // are eligible (double opt-in); waitlist entries belong to a logged-in account.
  const rotation = [{ lastCheckedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }] as any;
  const search = await prisma.searchNotification.findMany({
    where: { isActive: true, notifiedAt: null, confirmedAt: { not: null } },
    orderBy: rotation,
    take: half,
  });
  const waitlist = await prisma.shopperWaitlistEntry.findMany({
    where: { isActive: true, notifiedAt: null },
    include: { user: { select: { email: true } } },
    orderBy: rotation,
    take: Math.max(half, limit - search.length),
  });

  const targets: NotifyTarget[] = [];
  for (const r of search as any[]) {
    if (!r.email) continue;
    const armed: Date = r.armedAt ?? r.createdAt; // lazy backfill: armedAt ?? createdAt
    targets.push({
      source: 'SEARCH',
      id: r.id,
      email: r.email.trim().toLowerCase(),
      term: r.searchQuery,
      city: r.city ?? null,
      since: armed,
      armedAt: armed,
    });
  }
  for (const r of waitlist as any[]) {
    const email = r.user?.email;
    if (!email) continue;
    // armedAt (not updatedAt): claim/release bump updatedAt, which used to lose matches on a retry.
    const armed: Date = r.armedAt ?? r.createdAt;
    targets.push({
      source: 'WAITLIST',
      id: r.id,
      email: String(email).trim().toLowerCase(),
      term: r.itemType,
      city: r.city ?? null,
      since: armed,
      armedAt: armed,
    });
  }
  return targets;
}

/** Deactivates alerts older than NOTIFY_ME_EXPIRY_DAYS (from armedAt ?? createdAt). Returns rows expired. */
async function expireOldEntries(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - NOTIFY_ME_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const age = [{ armedAt: { lt: cutoff } }, { armedAt: null, createdAt: { lt: cutoff } }];
  const s = await prisma.searchNotification.updateMany({
    where: { isActive: true, OR: age },
    data: { isActive: false, expiredAt: now },
  });
  const w = await prisma.shopperWaitlistEntry.updateMany({
    where: { isActive: true, OR: age },
    data: { isActive: false },
  });
  return s.count + w.count;
}

/** Stamps lastCheckedAt so examined entries go to the back of the rotation. */
async function stampChecked(targets: NotifyTarget[], at: Date): Promise<void> {
  const searchIds = targets.filter((t) => t.source === 'SEARCH').map((t) => t.id);
  const waitIds = targets.filter((t) => t.source === 'WAITLIST').map((t) => t.id);
  try {
    if (searchIds.length) await prisma.searchNotification.updateMany({ where: { id: { in: searchIds } }, data: { lastCheckedAt: at } });
    if (waitIds.length) await prisma.shopperWaitlistEntry.updateMany({ where: { id: { in: waitIds } }, data: { lastCheckedAt: at } });
  } catch (err: any) {
    console.error('[notifyMeSender] Failed to stamp lastCheckedAt:', err?.message);
  }
}

async function recentlyNotifiedEmails(now: Date): Promise<Set<string>> {
  const since = new Date(now.getTime() - PER_PERSON_COOLDOWN_MS);
  const [s, w] = await Promise.all([
    prisma.searchNotification.findMany({ where: { notifiedAt: { gte: since } }, select: { email: true } }),
    prisma.shopperWaitlistEntry.findMany({
      where: { notifiedAt: { gte: since } },
      select: { user: { select: { email: true } } },
    }),
  ]);
  const out = new Set<string>();
  s.forEach((r) => r.email && out.add(r.email.trim().toLowerCase()));
  (w as any[]).forEach((r) => r.user?.email && out.add(String(r.user.email).trim().toLowerCase()));
  return out;
}

async function claim(targets: NotifyTarget[], at: Date): Promise<boolean> {
  const searchIds = targets.filter((t) => t.source === 'SEARCH').map((t) => t.id);
  const waitIds = targets.filter((t) => t.source === 'WAITLIST').map((t) => t.id);
  let claimed = 0;
  if (searchIds.length) {
    const r = await prisma.searchNotification.updateMany({
      where: { id: { in: searchIds }, notifiedAt: null, isActive: true },
      data: { notifiedAt: at },
    });
    claimed += r.count;
  }
  if (waitIds.length) {
    const r = await prisma.shopperWaitlistEntry.updateMany({
      where: { id: { in: waitIds }, notifiedAt: null, isActive: true },
      data: { notifiedAt: at },
    });
    claimed += r.count;
  }
  if (claimed === targets.length) return true;
  await release(targets, at); // another runner got some of them: back off entirely
  return false;
}

async function release(targets: NotifyTarget[], at: Date): Promise<void> {
  const searchIds = targets.filter((t) => t.source === 'SEARCH').map((t) => t.id);
  const waitIds = targets.filter((t) => t.source === 'WAITLIST').map((t) => t.id);
  try {
    if (searchIds.length) {
      await prisma.searchNotification.updateMany({ where: { id: { in: searchIds }, notifiedAt: at }, data: { notifiedAt: null } });
    }
    if (waitIds.length) {
      await prisma.shopperWaitlistEntry.updateMany({ where: { id: { in: waitIds }, notifiedAt: at }, data: { notifiedAt: null } });
    }
  } catch (err: any) {
    console.error('[notifyMeSender] Failed to release claim:', err?.message);
  }
}

async function deactivate(targets: NotifyTarget[]): Promise<void> {
  const searchIds = targets.filter((t) => t.source === 'SEARCH').map((t) => t.id);
  const waitIds = targets.filter((t) => t.source === 'WAITLIST').map((t) => t.id);
  if (searchIds.length) await prisma.searchNotification.updateMany({ where: { id: { in: searchIds } }, data: { isActive: false } });
  if (waitIds.length) await prisma.shopperWaitlistEntry.updateMany({ where: { id: { in: waitIds } }, data: { isActive: false } });
}

export async function runNotifyMeSender(now: Date = new Date()): Promise<NotifyMeRunSummary> {
  const summary: NotifyMeRunSummary = {
    enabled: notifyMeSenderEnabled(),
    dryRun: notifyMeDryRun(),
    targetsLoaded: 0,
    recipients: 0,
    emailed: 0,
    wouldEmail: 0,
    skippedRecentlyNotified: 0,
    skippedNoMatch: 0,
    skippedSuppressed: 0,
    skippedExpired: 0,
    failed: 0,
    fuseTripped: false,
    aborted: null,
  };

  if (!summary.enabled) {
    summary.aborted = 'disabled';
    return summary;
  }
  if (!summary.dryRun && !unsubSecret()) {
    summary.aborted = 'no_unsubscribe_secret';
    console.error('[notifyMeSender] Refusing to send: set JWT_SECRET or NOTIFY_ME_UNSUB_SECRET so emails can carry a working unsubscribe link.');
    return summary;
  }

  if (!summary.dryRun) {
    try {
      const expired = await expireOldEntries(now);
      summary.skippedExpired += expired;
      if (expired > 0) console.log(`[notifyMeSender] Expired ${expired} alert(s) older than ${NOTIFY_ME_EXPIRY_DAYS} days`);
    } catch (err: any) {
      console.error('[notifyMeSender] Expiry sweep failed:', err?.message);
    }
  }

  const expiryCutoff = now.getTime() - NOTIFY_ME_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const loaded = await loadTargets(notifyMeMaxTargetsPerRun());
  // Dry runs write nothing, so also skip (not deactivate) anything past the cutoff in memory.
  const targets = loaded.filter((t) => {
    if (t.armedAt.getTime() < expiryCutoff) {
      summary.skippedExpired++;
      return false;
    }
    return true;
  });
  summary.targetsLoaded = targets.length;
  if (targets.length === 0) return summary;
  const examined: NotifyTarget[] = []; // everything we looked at this run (stamped for fair rotation)

  const byEmail = new Map<string, NotifyTarget[]>();
  for (const t of targets) {
    const list = byEmail.get(t.email) ?? [];
    list.push(t);
    byEmail.set(t.email, list);
  }
  summary.recipients = byEmail.size;

  const cooling = await recentlyNotifiedEmails(now);
  const maxEmails = notifyMeMaxEmailsPerRun();
  let consecutiveFailures = 0;

  for (const [email, personTargets] of byEmail) {
    if (cooling.has(email)) {
      summary.skippedRecentlyNotified++;
      examined.push(...personTargets); // deferred, not starved: goes to the back of the rotation
      continue;
    }
    if (summary.emailed + summary.wouldEmail >= maxEmails) {
      summary.fuseTripped = true;
      console.warn(`[notifyMeSender] Per-run fuse tripped at ${maxEmails} emails. Remaining recipients wait for the next run.`);
      break;
    }

    // Collect matches across this person's entries.
    const matchedTargets: NotifyTarget[] = [];
    const itemsById = new Map<string, MatchedItem>();
    const salesById = new Map<string, MatchedSale>();
    for (const t of personTargets) {
      try {
        const m = await findMatchesForTarget(t, now);
        if (m.items.length === 0 && m.sales.length === 0) continue;
        matchedTargets.push(t);
        m.items.forEach((i) => itemsById.set(i.id, i));
        m.sales.forEach((s) => salesById.set(s.id, s));
      } catch (err: any) {
        console.error(`[notifyMeSender] Match query failed for entry ${t.id}:`, err?.message);
      }
    }
    examined.push(...personTargets);
    if (matchedTargets.length === 0) {
      summary.skippedNoMatch++;
      continue;
    }

    if (isEmailDomainBlocked(email) || (await suppressionService.isSuppressed(email))) {
      summary.skippedSuppressed++;
      console.log('[notifyMeSender] Skipped suppressed/blocked recipient');
      continue;
    }

    if (summary.dryRun) {
      summary.wouldEmail++;
      console.log(`[notifyMeSender] DRY RUN: would email 1 recipient (${matchedTargets.length} alert(s), ${itemsById.size} item(s), ${salesById.size} sale(s))`);
      continue;
    }

    const token = signNotifyMeToken(email);
    if (!token) {
      summary.aborted = 'no_unsubscribe_secret';
      break;
    }

    const claimTime = new Date();
    if (!(await claim(matchedTargets, claimTime))) continue;

    const unsubUrl = `${FRONTEND_URL}/api/shopper/waitlist/unsubscribe?token=${encodeURIComponent(token)}`;
    const content = buildNotifyMeEmail({
      terms: Array.from(new Set(matchedTargets.map((t) => t.term))),
      items: Array.from(itemsById.values()).slice(0, MAX_ITEMS_IN_EMAIL),
      sales: Array.from(salesById.values()).slice(0, MAX_SALES_IN_EMAIL),
      unsubUrl,
      isAccountHolder: matchedTargets.some((t) => t.source === 'WAITLIST'),
    });

    try {
      // RFC 8058 one-click unsubscribe headers. lib/transactionalEmailService.send() forwards `headers`
      // to Resend. POST /api/shopper/waitlist/unsubscribe accepts the one-click POST.
      const result = await transactionalEmailService.emails.send({
        to: email,
        subject: content.subject,
        html: content.html,
        text: content.text,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      if (result.sent) {
        summary.emailed++;
        consecutiveFailures = 0;
      } else if (result.reason === 'suppressed') {
        // Hard bounce / complaint / blocked domain: stop trying these entries.
        await deactivate(matchedTargets);
        summary.skippedSuppressed++;
      } else {
        await release(matchedTargets, claimTime);
        summary.aborted = result.reason || 'send_not_completed';
        console.error(`[notifyMeSender] Aborting run: transactional rail reported "${summary.aborted}".`);
        break;
      }
    } catch (err: any) {
      await release(matchedTargets, claimTime);
      summary.failed++;
      consecutiveFailures++;
      console.error('[notifyMeSender] Send failed:', err?.message);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        summary.aborted = 'too_many_consecutive_failures';
        console.error('[notifyMeSender] Aborting run after repeated send failures.');
        break;
      }
    }
  }

  if (!summary.dryRun && examined.length > 0) await stampChecked(examined, new Date());

  console.log('[notifyMeSender] Run summary:', JSON.stringify(summary));
  return summary;
}
