import { Resend } from 'resend';
import { suppressionService } from '../services/suppressionService';
import { recordApiUsage } from './aiCostTracker';
import * as Sentry from '@sentry/node';
import { redis } from './redis';
import { prisma } from './prisma';

/**
 * Transactional email service — uses Resend API (NOT Gmail).
 *
 * Carries critical transactional emails: password resets, email verification,
 * payout confirmations, purchase receipts, invoices, and subscription notices.
 * A Gmail/Workspace suspension cannot silence these.
 *
 * UPDATED 2026-10-13 (outreach-transactional-email-identity-separation-adr):
 * also now carries opt-in bulk/lifecycle mail that was on the Gmail rail
 * (weekly digest first; sale alerts, win-back, and others are fast-follow
 * candidates per the ADR). Gmail/emailService is cold-outreach-only going
 * forward — do not read this file's old "bulk and marketing" framing as
 * current; it described emailService.ts's job before this split.
 *
 * FROM domain: finda.sale (Resend-verified root domain).
 * Default sender: RESEND_FROM_EMAIL (defaults to noreply@finda.sale).
 *
 * Environment variable required in Railway:
 *   RESEND_API_KEY=<from Resend dashboard → API Keys>
 */

const FROM_DEFAULT = process.env.RESEND_FROM_EMAIL ?? 'FindA.Sale <noreply@finda.sale>';

// Resend only has the root domain `finda.sale` verified. Any from-address whose
// domain is not exactly `finda.sale` (e.g. outreach.finda.sale, send.finda.sale)
// is 403-rejected by Resend. Coerce such addresses to the verified default.
const VERIFIED_RESEND_DOMAIN = 'finda.sale';
function domainOf(addr: string): string | null {
  const m = addr.match(/@([A-Za-z0-9.-]+)/);
  return m ? m[1].toLowerCase() : null;
}
function resolveFrom(from?: string): string {
  const candidate = from ?? FROM_DEFAULT;
  if (from && domainOf(from) && domainOf(from) !== VERIFIED_RESEND_DOMAIN) {
    console.warn(
      `[transactionalEmailService] Coerced unverified from '${from}' → FROM_DEFAULT`,
    );
  }
  return domainOf(candidate) === VERIFIED_RESEND_DOMAIN ? candidate : FROM_DEFAULT;
}

// ---------------------------------------------------------------------------
// Daily headroom guard (2026-10-25)
//
// The Resend account is on the FREE plan: 100 emails/day, 3,000/month. Resend counts every
// To/CC/BCC address as one email and the daily quota is a UTC calendar day (00:00-24:00 UTC,
// resets at midnight UTC, not a rolling 24h window) -- per
// https://resend.com/docs/knowledge-base/account-quotas-and-limits. The Friday weekly digest
// alone (~100-120 recipients) hit 100% of the day's quota on 2026-10-16 and 2026-10-23, which
// would leave password resets, verification, receipts, hold invoices and auction mail refused
// by Resend for the rest of that UTC day.
//
// Every send is either 'transactional' (default) or 'bulk' (opt-in via `category: 'bulk'`).
// A per-UTC-day counter of accepted recipients lives in Redis (lib/redis, falls back to an
// in-memory store) under resend:daily-count:<YYYY-MM-DD> with a 2-day TTL. When the key is
// missing (e.g. a restart with no Redis), it is seeded from the durable ApiUsageLog row
// 'resend:transactional' for the same UTC day, which records the same quantity.
//   - bulk sends are refused ({ sent:false, reason:'daily_bulk_budget' }) once the day's count
//     would exceed RESEND_DAILY_BULK_BUDGET (default 70), leaving >= 30/day for transactional.
//   - transactional sends are NEVER blocked by this guard (only Resend itself can refuse).
// Limits are env-configurable: RESEND_DAILY_CAP (default 100), RESEND_DAILY_BULK_BUDGET
// (default 70, clamped to the cap).
// ---------------------------------------------------------------------------

export type ResendSendCategory = 'transactional' | 'bulk';

const RESEND_COUNT_KEY_PREFIX = 'resend:daily-count:';
const RESEND_COUNT_TTL_SECONDS = 2 * 24 * 60 * 60;
// Same quantity (accepted recipients per UTC day) recordApiUsage() already persists below.
const RESEND_USAGE_SERVICE = 'resend:transactional';

function nonNegativeIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Current limits from env (read per call so a Railway variable change applies on restart/redeploy). */
export function getResendDailyLimits(): { cap: number; bulkBudget: number } {
  const cap = nonNegativeIntEnv('RESEND_DAILY_CAP', 100);
  const bulkBudget = Math.min(nonNegativeIntEnv('RESEND_DAILY_BULK_BUDGET', 70), cap);
  return { cap, bulkBudget };
}

/** Resend's quota day: the UTC calendar date. */
export function resendQuotaDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Pure budget rule: may a bulk send of `recipients` go out when `countBefore` were already sent today? */
export function bulkBudgetAllows(countBefore: number, recipients: number, bulkBudget: number): boolean {
  return countBefore + recipients <= bulkBudget;
}

function countKey(day: string): string {
  return `${RESEND_COUNT_KEY_PREFIX}${day}`;
}

async function ensureCounterSeeded(day: string): Promise<void> {
  const key = countKey(day);
  if ((await redis.get(key)) !== null) return;
  let seed = 0;
  try {
    const row = await prisma.apiUsageLog.findUnique({
      where: { service_dateKey: { service: RESEND_USAGE_SERVICE, dateKey: day } },
      select: { callCount: true },
    });
    seed = row?.callCount ?? 0;
  } catch (err: any) {
    console.warn('[transactionalEmailService] Could not seed Resend daily count from ApiUsageLog:', err?.message ?? err);
  }
  // NX: a concurrent send that seeded (and possibly incremented) first wins.
  await redis.setNx(key, RESEND_COUNT_TTL_SECONDS, String(seed));
}

/** Today's (UTC) count of recipients accepted by Resend, as tracked by this guard. */
export async function getResendDailyCount(now: Date = new Date()): Promise<number> {
  const day = resendQuotaDay(now);
  await ensureCounterSeeded(day);
  return parseInt((await redis.get(countKey(day))) ?? '0', 10) || 0;
}

// One Sentry warning per UTC day per condition per process (breadcrumbs on every event).
const warnedDays = new Set<string>();
function warnOncePerDay(kind: 'bulk_budget_tripped' | 'daily_cap_reached', day: string, message: string, extra: Record<string, unknown>): void {
  try {
    Sentry.addBreadcrumb({ category: 'email.resend.quota', level: 'warning', message, data: extra });
  } catch { /* Sentry not initialised (tests/dev) */ }
  const flag = `${kind}:${day}`;
  if (warnedDays.has(flag)) return;
  warnedDays.add(flag);
  try {
    Sentry.captureMessage(message, { level: 'warning', tags: { email_rail: 'resend', kind }, extra });
  } catch { /* Sentry not initialised (tests/dev) */ }
}

/**
 * Reserve `recipients` units of today's bulk budget atomically. Returns reserved=false (and
 * allowed=true) when the counter is unavailable: the guard fails open rather than silently
 * dropping mail on a counter error.
 */
async function reserveBulkBudget(recipients: number, jobLabel: string): Promise<{ allowed: boolean; reserved: boolean }> {
  const { cap, bulkBudget } = getResendDailyLimits();
  const day = resendQuotaDay();
  try {
    await ensureCounterSeeded(day);
    const after = await redis.incrBy(countKey(day), recipients, RESEND_COUNT_TTL_SECONDS);
    const before = after - recipients;
    if (bulkBudgetAllows(before, recipients, bulkBudget)) return { allowed: true, reserved: true };
    await redis.incrBy(countKey(day), -recipients, RESEND_COUNT_TTL_SECONDS);
    console.warn(
      `[transactionalEmailService] Bulk send refused — daily bulk budget reached (${before}/${bulkBudget}, cap ${cap}, UTC day ${day}) | job: ${jobLabel}`,
    );
    warnOncePerDay('bulk_budget_tripped', day, `Resend daily bulk budget reached (${before}/${bulkBudget}); bulk mail deferred`, {
      day, countBefore: before, bulkBudget, cap, jobName: jobLabel,
    });
    return { allowed: false, reserved: false };
  } catch (err: any) {
    console.warn('[transactionalEmailService] Resend daily counter unavailable — bulk guard failing open:', err?.message ?? err);
    return { allowed: true, reserved: false };
  }
}

async function releaseBulkReservation(recipients: number): Promise<void> {
  try {
    await redis.incrBy(countKey(resendQuotaDay()), -recipients, RESEND_COUNT_TTL_SECONDS);
  } catch { /* best effort */ }
}

/** Count an accepted send that was not pre-reserved. Never throws. */
async function recordAcceptedSend(recipients: number, jobLabel: string): Promise<void> {
  try {
    const day = resendQuotaDay();
    await ensureCounterSeeded(day);
    const after = await redis.incrBy(countKey(day), recipients, RESEND_COUNT_TTL_SECONDS);
    const { cap } = getResendDailyLimits();
    if (after >= cap) {
      warnOncePerDay('daily_cap_reached', day, `Resend daily send count reached the plan cap (${after}/${cap}); Resend may refuse further mail until 00:00 UTC`, {
        day, count: after, cap, jobName: jobLabel,
      });
    }
  } catch (err: any) {
    console.warn('[transactionalEmailService] Could not record Resend daily count:', err?.message ?? err);
  }
}

export const transactionalEmailService = {
  emails: {
    // P0 fix (2026-08-25, Charge C investigation -- STATE.md S-PAYMENT-INVOICE-GAPS-2026-08-25):
    // this used to return Promise<void> unconditionally, including on a silent
    // suppression-block skip -- the exact failure mode that let a stale EmailSuppression
    // row block Patrick's own invoice email with zero signal to the caller (posController's
    // sendHoldInvoice just console.warn'ed on a genuine throw, and a suppression skip isn't
    // even a throw). Callers that don't care can still ignore the return value (this change
    // is backward-compatible with every existing call site) -- sendHoldInvoice is the first
    // caller to actually check it. Genuine Resend API errors still throw, unchanged.
    async send(options: {
      from?: string;
      to: string | string[];
      subject: string;
      html: string;
      text?: string;
      // Optional Reply-To (e.g. contact-form submitter, so support can reply straight to them).
      replyTo?: string;
      // Optional extra message headers (e.g. RFC 8058 List-Unsubscribe / List-Unsubscribe-Post).
      headers?: Record<string, string>;
      // Optional caller label (same meaning as emailService's jobName). Logged on every
      // outcome and sent to Resend as a `job` tag so per-path volume is visible in the
      // Resend dashboard. Added 2026-10-25 when the remaining non-outreach Gmail senders
      // moved to this rail.
      jobName?: string;
      // 'transactional' (default): never blocked by the daily headroom guard.
      // 'bulk': digests / fan-out alerts; refused with reason 'daily_bulk_budget' once today's
      // Resend count reaches RESEND_DAILY_BULK_BUDGET. Callers must treat that as "try again
      // after 00:00 UTC", not as a permanent failure. Added 2026-10-25.
      category?: ResendSendCategory;
    }): Promise<{ sent: boolean; reason?: string }> {
      const jobLabel = options.jobName ?? 'unknown';
      const category: ResendSendCategory = options.category ?? 'transactional';
      if (!process.env.RESEND_API_KEY) {
        // Soft failure in dev/test environments where Resend isn't configured.
        // In production Railway RESEND_API_KEY must be set — log as error so it
        // surfaces in Railway logs and Sentry.
        console.error(
          '[transactionalEmailService] RESEND_API_KEY not set — email NOT sent:',
          options.subject,
          '→',
          Array.isArray(options.to) ? options.to.join(', ') : options.to,
        );
        return { sent: false, reason: 'not_configured' };
      }

      // Rail-level hard-suppression + domain-block check — applies before every
      // Resend call. Transactional rail blocks hard-bounce/complaint/blocked-domain
      // only — opted-out users still receive receipts/resets/payouts they're
      // entitled to (opt-out and soft-bounce are marketing-only signals).
      const recipients = Array.isArray(options.to) ? options.to : [options.to];
      const suppressedMap = await suppressionService.checkMultipleHard(recipients);
      const blockedRecipients = recipients.filter(r => suppressedMap.get(r.toLowerCase()));
      if (blockedRecipients.length > 0) {
        console.warn(
          '[transactionalEmailService] Send blocked — suppressed/domain-blocked recipients:',
          blockedRecipients.join(', '),
          '| subject:', options.subject,
          '| job:', jobLabel,
        );
        return { sent: false, reason: 'suppressed' };
      }

      // Daily headroom guard (see top of file). Bulk only; checked after the suppression gate so
      // a suppressed recipient never consumes budget.
      let reservedBulk = false;
      if (category === 'bulk') {
        const gate = await reserveBulkBudget(recipients.length, jobLabel);
        if (!gate.allowed) return { sent: false, reason: 'daily_bulk_budget' };
        reservedBulk = gate.reserved;
      }

      const resend = new Resend(process.env.RESEND_API_KEY);

      let sendResult: Awaited<ReturnType<typeof resend.emails.send>>;
      try {
        sendResult = await resend.emails.send({
          from: resolveFrom(options.from),
          to: recipients,
          subject: options.subject,
          html: options.html,
          ...(options.text ? { text: options.text } : {}),
          ...(options.replyTo ? { replyTo: options.replyTo } : {}),
          ...(options.headers && Object.keys(options.headers).length > 0
            ? { headers: options.headers }
            : {}),
          // Resend tag values allow only ASCII letters, digits, '_' and '-'.
          ...(options.jobName
            ? { tags: [{ name: 'job', value: options.jobName.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256) }] }
            : {}),
        });
      } catch (sendErr) {
        if (reservedBulk) await releaseBulkReservation(recipients.length);
        throw sendErr;
      }
      const { error } = sendResult;

      if (error) {
        if (reservedBulk) await releaseBulkReservation(recipients.length);
        console.error('[transactionalEmailService] Resend error:', error);
        Sentry.captureException(new Error(`Resend send rejected: ${error.message}`), {
          tags: { email_rail: 'resend', kind: 'resend_send_rejected' },
          extra: { from: options.from ?? '(default)', subject: options.subject, toCount: recipients.length, jobName: jobLabel },
        });
        throw new Error(`Resend send failed: ${error.message}`);
      }

      // SENT-count tracking for deliverabilityMonitorJob.ts's weekly bounce-rate
      // check (P1 fix, 2026-09-08 -- see claude_docs/audits/email-deliverability-
      // audit-2026-09-06.md Sec.6 recommendation 1a). No SENT counter previously
      // existed for the Resend transactional rail at all, so the weekly bounce-rate
      // denominator was structurally blind to it. Reuses the existing generic
      // ApiUsageLog table (service+dateKey+callCount -- "resend" was already listed
      // as an example service value in schema.prisma's own comment on that model)
      // via the existing recordApiUsage() helper, instead of adding a new table or
      // field. writeApiUsageRow() (inside recordApiUsage) already fails open and
      // never throws, so this can never block or fail a real transactional send.
      await recordApiUsage(RESEND_USAGE_SERVICE, 0, recipients.length);
      // Daily headroom counter: bulk sends were already counted by their reservation.
      if (!reservedBulk) await recordAcceptedSend(recipients.length, jobLabel);
      if (options.jobName) {
        console.log(`[transactionalEmailService] Sent (${jobLabel}) to ${recipients.length} recipient(s)`);
      }

      return { sent: true };
    },
  },
};
