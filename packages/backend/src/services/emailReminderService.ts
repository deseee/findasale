// prisma is the SAME singleton either way -- index.ts:291 just re-exports './lib/prisma'.
// Importing it from '../index' pulls in the Express entry point, which calls
// process.exit(1) at index.ts:47 when JWT_SECRET is unset and boots the HTTP server,
// Socket.io, Redis, Sentry and ~80 cron jobs as a side effect. That killed the jest
// worker outright in emailReminders.e2e.test.ts. Import the singleton directly.
import { prisma } from '../lib/prisma';
import twilio from 'twilio';
import { sendPushNotification } from '../utils/webpush';
import { buildSaleDayReminderEmail } from './emailTemplateService';
import { emailService } from '../lib/emailService';
import { suppressionService } from './suppressionService';
import { checkQuietHours, resolveSendTimeZone } from './smsComplianceService';
import { sendCompliantSms } from './compliantSms';
import type { CompliantSmsOutcome } from './compliantSms';
import { organizerHasTier } from '../utils/tierAccess';
import { sanitizeHeaderText } from '../utils/htmlEscape';
import { maskEmail } from '../utils/logMask';


// DEAD (2026-09-29): reminder texts go through services/compliantSms.ts, which owns the Twilio client.
// Kept (nothing removed) but no longer called.
// Lazy-loaded Twilio client
let _twilioClient: any = null;
const getTwilioClient = () => {
  if (!_twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (accountSid && authToken) {
      try {
        _twilioClient = twilio(accountSid, authToken);
      } catch (error) {
        console.warn('⚠️ Failed to initialize Twilio client in emailReminderService:', error);
        _twilioClient = null;
      }
    }
  }
  return _twilioClient;
};

interface ReminderEmail {
  to: string;
  userId: string;
  saleName: string;
  saleAddress: string;
  startDate: Date;
  saleUrl: string;
  reminderType: 'one-day' | 'two-hours';
  /** Organizer timezone (IANA). Times in the email are shown in it, not in the server's timezone. */
  orgTimeZone?: string | null;
  /** Test seam / run clock: decides "today" vs "tomorrow" copy. */
  now?: Date;
}

interface ReminderSMS {
  to: string;
  saleName: string;
  saleAddress: string;
  startDate: Date;
  reminderType: 'one-day' | 'two-hours';
  /**
   * Recorded opt-in (SaleSubscriber.smsConsentAt). REQUIRED: without it nothing is sent
   * (TCPA/CTIA, same rule as POST /notifications/send-sms). A bare phone number is not consent.
   */
  smsConsentAt?: Date | null;
  /** Organizer business name for the "Business via FindA.Sale:" sender prefix. */
  orgName?: string | null;
  /**
   * Organizer subscription tier. Reminder texts are a PRO and TEAMS feature exactly like POST
   * /notifications/send-sms (every text is billed by Twilio): a missing or SIMPLE tier is skipped.
   */
  orgTier?: unknown;
  /** Organizer timezone (IANA). Drives quiet hours and the time shown in the text. */
  orgTimeZone?: string | null;
  /** Used for the SmsSendLog audit row (and therefore the per-organizer 24h cap accounting). */
  organizerId?: string | null;
  saleId?: string | null;
  /** Test seam: the clock used for the quiet-hours check. */
  now?: Date;
}

/** Same outcomes as services/compliantSms.ts (adds skipped_tier and skipped_daily_cap to the original set). */
export type ReminderSmsOutcome = CompliantSmsOutcome;

/** 'today' when the sale starts on the same calendar day as `now` in `timeZone`, otherwise 'tomorrow'. */
export const saleDayWord = (startDate: Date, now: Date, timeZone: string): 'today' | 'tomorrow' => {
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return dayKey(startDate) === dayKey(now) ? 'today' : 'tomorrow';
};

const formatSaleDateTime = (date: Date, timeZone?: string): string => {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  });
};

const getEmailTemplate = (reminder: ReminderEmail, unsubToken: string, unsubUrlOverride?: string): { subject: string; html: string } => {
  // Everything is formatted in the ORGANIZER's timezone (2026-09-29): the server runs in UTC, so a 10:00 AM
  // sale used to be described as "3:00 PM" (or the wrong day) in every reminder email.
  const timeZone = resolveSendTimeZone(reminder.orgTimeZone);
  const dayWord = saleDayWord(reminder.startDate, reminder.now ?? new Date(), timeZone);
  const formattedDate = formatSaleDateTime(reminder.startDate, timeZone);
  const dateOnly = reminder.startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone });
  const timeOnly = reminder.startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone, timeZoneName: 'short' });

  const safeName = sanitizeHeaderText(reminder.saleName, 120);
  const subject = reminder.reminderType === 'one-day'
    ? `Your sale is ${dayWord}: ${safeName}`
    : `${safeName} starts in about 2 hours!`;

  const html = buildSaleDayReminderEmail({
    saleName:     reminder.saleName,
    saleDate:     reminder.reminderType === 'one-day' ? dateOnly : formattedDate,
    saleTime:     reminder.reminderType === 'one-day' ? `Opens ${timeOnly}` : `Starting at ${timeOnly}`,
    saleAddress:  reminder.saleAddress,
    ctaUrl:       reminder.saleUrl,
    reminderType: reminder.reminderType,
    dayWord,
    unsubUrl:     unsubUrlOverride ?? `${process.env.NEXT_PUBLIC_SITE_URL || 'https://finda.sale'}/unsubscribe?token=${unsubToken}`,
  });

  return { subject, html };
};

// EM2/EM3: Shared retry helper with exponential backoff — used for both email and SMS sends
const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500
): Promise<T> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.status === 429 || error?.code === 20429 || error?.statusCode === 429;
      if (attempt === maxRetries - 1) throw error;
      // Longer backoff for rate-limit errors, standard exponential otherwise
      const delay = isRateLimit
        ? baseDelayMs * Math.pow(4, attempt)  // 500ms, 2s, 8s
        : baseDelayMs * Math.pow(2, attempt); // 500ms, 1s, 2s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
};

/**
 * Organizer-written portion only (no sender prefix, no STOP footer): composeSmsBody() adds
 * "<Business> via FindA.Sale: " in front and "Reply STOP to opt out." at the end.
 * Plain GSM-7 text (no emoji) so a reminder stays inside the 3 segment limit.
 */
export const getSMSTemplate = (reminder: ReminderSMS, compact = false): string => {
  const timeZone = resolveSendTimeZone(reminder.orgTimeZone);
  const name = compact ? reminder.saleName.slice(0, 40) : reminder.saleName.slice(0, 60);
  const address = compact ? '' : ` Address: ${reminder.saleAddress.slice(0, 80)}`;

  if (reminder.reminderType === 'one-day') {
    const dayWord = saleDayWord(reminder.startDate, reminder.now ?? new Date(), timeZone);
    return `Reminder: ${name} starts ${dayWord}, ${formatSaleDateTime(reminder.startDate, timeZone)}.${address}`;
  }

  return `Sale happening soon! ${name} starts in about 2 hours.${address}`;
};

/**
 * Returns true when the recipient was handled (sent, or deliberately skipped because the address is
 * suppressed) and false when the send failed after retries, so the caller can release its
 * once-only claim and let a later run retry. Never throws.
 */
export const sendReminderEmail = async (reminder: ReminderEmail): Promise<boolean> => {
  try {
    // A reminder needs an account to hang an unsubscribe link on. A subscriber row whose user is gone
    // (userId SetNull on account deletion) has no way to opt out, so it is never emailed. Handled, not retried.
    if (!reminder.userId) {
      console.log(`[emailReminder] Skipping reminder for ${maskEmail(reminder.to)}: subscriber has no account to unsubscribe`);
      return true;
    }
    // isSuppressed (not isHardSuppressed) -- bug fix, 2026-09-06: a sale-day reminder is a
    // notification the user can opt out of, not a strict transactional confirmation, so an
    // opted-out recipient must not keep receiving it.
    if (await suppressionService.isSuppressed(reminder.to)) {
      console.log(`[emailReminder] Skipping suppressed recipient: ${maskEmail(reminder.to)}`);
      return true; // handled: a suppressed address is never retried
    }
    // Per-user "stop sale reminders" preference (notificationPrefs.emailSaleReminders === false), set by the
    // 'saleReminders' unsubscribe link in these emails. Before 2026-09-29 the link used type 'newSales', which
    // switched off unrelated followed-organizer emails and never stopped reminders (nothing here read a pref).
    // A failed lookup fails closed: return false so the claim is released and a later run retries.
    try {
      const owner = await prisma.user.findUnique({ where: { id: reminder.userId }, select: { notificationPrefs: true } });
      const prefs = ((owner as any)?.notificationPrefs as Record<string, unknown> | null) ?? {};
      if (prefs['emailSaleReminders'] === false) {
        console.log(`[emailReminder] Skipping reminder for ${maskEmail(reminder.to)}: user turned sale reminder emails off`);
        return true;
      }
    } catch (prefErr) {
      console.error('[emailReminder] Could not read notification preferences; not sending (will retry):', (prefErr as Error)?.message);
      return false;
    }
    const { generateUnsubscribeToken } = await import('../controllers/unsubscribeController');
    const unsubToken = await generateUnsubscribeToken(reminder.userId, 'saleReminders');
    const { subject, html } = getEmailTemplate(reminder, unsubToken);
    // RFC 8058 one-click header (bug fix, 2026-09-06) -- this email already generated a real
    // token above but never passed a List-Unsubscribe header to the send rail. Same bracketed
    // mailto+URL format buildUnsubscribeLinks() produces, built directly here since the raw
    // token (not the wrapper) is already in hand.
    const listUnsubscribeHeader = `<mailto:unsubscribe@finda.sale?subject=unsubscribe>, <${process.env.NEXT_PUBLIC_SITE_URL || 'https://finda.sale'}/api/unsubscribe?token=${unsubToken}>`;
    try {
      // EM2: Retry up to 3 times with exponential backoff on transient Resend failures
      await withRetry(() =>
        emailService.emails.send({
          from: process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale',
          to: reminder.to,
          subject,
          html,
          listUnsubscribe: listUnsubscribeHeader,
        })
      );
      console.log(`✓ Reminder email sent to ${maskEmail(reminder.to)} for ${sanitizeHeaderText(reminder.saleName, 80)}`);
      return true;
    } catch (error) {
      console.error(`✗ Failed to send reminder email to ${maskEmail(reminder.to)} after retries:`, error);
      return false;
    }
  } catch (error) {
    console.error(`✗ Failed to generate unsubscribe token for reminder email:`, error);
    return false;
  }
};

/**
 * Reminder email for a CONFIRMED guest subscriber (2026-09-30, guest double opt-in): a row with no account whose
 * address confirmed through the single-use link (SaleSubscriber.emailConfirmedAt). Sent on the transactional rail to
 * the confirmed address, with the stateless opt-out link in the body and the RFC 8058 List-Unsubscribe headers. Same
 * contract as sendReminderEmail: true = handled (sent, or deliberately skipped because the address is suppressed),
 * false = failed after retries so the caller releases its claim. Never throws. The caller has already checked
 * emailConfirmedAt and emailOptOutAt; nothing is sent when no opt-out link can be built.
 */
export const sendGuestReminderEmail = async (reminder: Omit<ReminderEmail, 'userId'>): Promise<boolean> => {
  try {
    if (await suppressionService.isSuppressed(reminder.to)) {
      console.log(`[emailReminder] Skipping suppressed guest recipient: ${maskEmail(reminder.to)}`);
      return true;
    }
    const { guestUnsubscribeUrls } = await import('./guestSaleSubscriptionService');
    const urls = guestUnsubscribeUrls(reminder.to);
    if (!urls) {
      console.error('[emailReminder] No HMAC secret configured; refusing to send a guest reminder without an opt-out link.');
      return false;
    }
    const { transactionalEmailService } = await import('../lib/transactionalEmailService');
    const { subject, html } = getEmailTemplate({ ...reminder, userId: '' }, '', urls.page);
    try {
      const outcome = await withRetry(() =>
        transactionalEmailService.emails.send({
          to: reminder.to,
          subject,
          html,
          headers: {
            'List-Unsubscribe': `<${urls.oneClick}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })
      );
      if (!outcome.sent && outcome.reason !== 'suppressed') {
        console.error(`✗ Guest reminder email to ${maskEmail(reminder.to)} not sent (${outcome.reason ?? 'unknown'})`);
        return false;
      }
      console.log(`✓ Guest reminder email ${outcome.sent ? 'sent' : 'skipped (suppressed)'} to ${maskEmail(reminder.to)} for ${sanitizeHeaderText(reminder.saleName, 80)}`);
      return true;
    } catch (error) {
      console.error(`✗ Failed to send guest reminder email to ${maskEmail(reminder.to)} after retries:`, error);
      return false;
    }
  } catch (error) {
    console.error('✗ Guest reminder email failed before sending:', error);
    return false;
  }
};

/**
 * Reminder texts go through services/compliantSms.ts, the same sender as organizer text updates, virtual
 * line texts and the opt-in confirmation, so they get exactly the same rules:
 *   - PRO or TEAMS organizer only (orgTier); a SIMPLE or unknown tier is skipped ('skipped_tier'). The old
 *     comment here claimed "the same rules as organizer SMS updates" while the tier gate and the daily cap were
 *     both missing: a free organizer's subscribers could be texted without limit.
 *   - recorded consent only (smsConsentAt, set by the double opt-in YES reply), STOP suppression list,
 *   - quiet hours in the organizer's timezone,
 *   - sender prefix + "Reply STOP to opt out.", segment limit,
 *   - the organizer's rolling 24 hour text cap (counted from SmsSendLog, which this send also writes):
 *     over the cap is SKIPPED ('skipped_daily_cap', counted as skippedCap in the run summary), never sent,
 *   - an SmsSendLog row per send, masked phone numbers in logs.
 *
 * Quiet-hour and daily-cap handling: a reminder that hits quiet hours or the cap is SKIPPED, never sent
 * late at night or past the cap. processReminderEmails runs hourly on a "due and not yet sent" model (day
 * before: due once the sale is within 24h; two hours: within 2h; both until the sale starts). A skip for
 * quiet hours, the cap or missing Twilio config is retryable: processReminderPass releases the claim (or checks
 * before claiming), so a later hourly run delivers the text once quiet hours end or the rolling cap frees up,
 * as long as the sale has not started. Every skip path fails closed and never throws.
 */
export const sendReminderSMS = async (reminder: ReminderSMS): Promise<ReminderSmsOutcome> => {
  const { outcome } = await sendCompliantSms(
    {
      to: reminder.to,
      consentAt: reminder.smsConsentAt,
      message: getSMSTemplate(reminder),
      altMessage: getSMSTemplate(reminder, true),
    },
    {
      organizerId: reminder.organizerId,
      saleId: reminder.saleId,
      orgName: reminder.orgName,
      orgTimeZone: reminder.orgTimeZone,
      orgTier: reminder.orgTier,
      minTier: 'PRO',
      now: reminder.now,
      // EM3: retry with 4x backoff on Twilio 429 rate-limit errors (code 20429); 21610 is not retryable.
      maxAttempts: 3,
      baseDelayMs: 1000, // Twilio limits are per-second, not per-ms
    }
  );
  return outcome;
};

// ---------------------------------------------------------------------------------------------
// Reminder scheduling: "due and not yet sent" (2026-09-29 rework)
//
// emailReminderJob runs hourly at :06. History: the day-before window was 24h..26h (a sale sat inside it
// on TWO runs: duplicate emails, pushes and texts), the two-hour window was 2h..2.5h (30 minutes wide
// under hourly runs: most sales were never reminded) and a text that hit quiet hours was lost because
// the window closed before quiet hours ended. A fixed window cannot fix all three, so a reminder is now
// DUE, not "inside a window":
//
//   DAY_BEFORE : 2h < (sale start - now) <= 24h   due from 24 hours out until the two-hour reminder takes over
//   TWO_HOURS  : 0  < (sale start - now) <= 2h    due from 2 hours out until the sale starts
//
// A sale whose start has passed is never reminded. Each due reminder is delivered at most once per
// subscriber through the SaleReminderSent ledger (one row per subscriber, sale and kind):
//   1. SKIP   : the run first loads the ledger rows for the sales it is about to process; a subscriber
//               already holding the row for that kind counts as alreadySent and costs no write.
//   2. CLAIM  : createMany({ skipDuplicates }) the (subscriber, sale, kind) row. count === 1 means this
//               run owns the send; 0 means a concurrent or earlier run got there first.
//   3. SEND   : email (+ push) under kind DAY_BEFORE | TWO_HOURS; text under DAY_BEFORE_SMS | TWO_HOURS_SMS.
//   4. RELEASE: a FAILED send deletes the claim and writes a failure marker row `<kind>_FAIL_<n>`; a later
//               hourly run retries until REMINDER_MAX_ATTEMPTS failures, then gives up (retriesExhausted).
// Quiet hours: a text that would go out inside the organizer's quiet hours is NOT claimed and NOT marked
// (skippedQuietHours), so the next hourly run delivers it once quiet hours end, as long as the sale has
// not started. Email and push are not subject to quiet hours.
// A crash between claim and send loses that one reminder (at-most-once, never twice). If the ledger table
// is missing or unreachable the run logs one clear error and sends NOTHING (fail closed): no ledger means
// no way to prevent duplicates. Apply migrations 20260929200000_sale_reminder_sent_marker and
// 20260929210000_sms_double_optin (SaleSubscriber.emailOptOutAt, read below) first.
// ---------------------------------------------------------------------------------------------

export type ReminderKind = 'DAY_BEFORE' | 'TWO_HOURS';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Due band for each reminder, as (now + fromMs, now + toMs] on the sale start time. Exclusive at the
 * lower edge so a sale starting exactly now is never reminded, inclusive at the upper edge so a sale
 * that is exactly 24h / 2h away is already due.
 */
export const REMINDER_WINDOWS: Record<ReminderKind, { fromMs: number; toMs: number }> = {
  DAY_BEFORE: { fromMs: 2 * HOUR_MS, toMs: 24 * HOUR_MS },
  TWO_HOURS: { fromMs: 0, toMs: 2 * HOUR_MS },
};

/** Sale start times that are due for `kind` at `now`: from < startDate <= to. */
export const reminderWindow = (kind: ReminderKind, now: Date): { from: Date; to: Date } => ({
  from: new Date(now.getTime() + REMINDER_WINDOWS[kind].fromMs),
  to: new Date(now.getTime() + REMINDER_WINDOWS[kind].toMs),
});

/** Failed sends per (subscriber, sale, kind) before later runs stop retrying. */
export const REMINDER_MAX_ATTEMPTS = 3;

/** SMS outcomes that mean "nothing was delivered and a later run may still deliver": claim is released. */
export const RETRYABLE_SMS_OUTCOMES: ReadonlySet<ReminderSmsOutcome> = new Set<ReminderSmsOutcome>([
  'failed',
  'skipped_quiet_hours',
  'skipped_not_configured',
  'skipped_daily_cap', // the rolling 24 hour cap frees up as old sends age out
]);

/** Marker kind recording failed attempt number `attempt` (1-based) of `kind`. */
export const failureKind = (kind: string, attempt: number): string => `${kind}_FAIL_${attempt}`;

/** True for the Prisma / Postgres errors that mean the ledger table or one of its columns is missing. */
export const isMissingTableError = (err: any): boolean => {
  const code = err?.code;
  if (code === 'P2021' || code === 'P2022' || code === '42P01') return true;
  return /does not exist/i.test(String(err?.message ?? ''));
};

/** Thrown out of a pass when the ledger cannot be read or written: the run must send nothing. */
const ledgerUnavailable = (cause: unknown): Error => {
  const err: any = new Error(
    isMissingTableError(cause)
      ? 'SaleReminderSent ledger table is missing (migration 20260929200000_sale_reminder_sent_marker not applied)'
      : `SaleReminderSent ledger is unreachable: ${String((cause as any)?.message ?? cause)}`
  );
  err.reminderLedgerUnavailable = true;
  err.missingTable = isMissingTableError(cause);
  return err;
};
export const isLedgerUnavailable = (err: any): boolean => err?.reminderLedgerUnavailable === true;

/** Take the once-only claim. True = this caller owns the send. Throws if the ledger is unreachable. */
export const claimReminder = async (subscriberId: string, saleId: string, kind: string): Promise<boolean> => {
  const res = await prisma.saleReminderSent.createMany({
    data: [{ subscriberId, saleId, kind }],
    skipDuplicates: true,
  });
  return res.count === 1;
};

/** Give the claim back after a failed / deferred send so a later run can retry. Best-effort, never throws. */
export const releaseReminder = async (subscriberId: string, saleId: string, kind: string): Promise<void> => {
  try {
    await prisma.saleReminderSent.deleteMany({ where: { subscriberId, saleId, kind } });
  } catch (err) {
    console.error(`[emailReminder] Failed to release ${kind} claim for subscriber ${subscriberId} / sale ${saleId}:`, err);
  }
};

/** Record failed attempt `attempt` of `kind` so retries stay bounded. Best-effort, never throws. */
const recordFailedAttempt = async (subscriberId: string, saleId: string, kind: string, attempt: number): Promise<void> => {
  try {
    await prisma.saleReminderSent.createMany({
      data: [{ subscriberId, saleId, kind: failureKind(kind, attempt) }],
      skipDuplicates: true,
    });
  } catch (err) {
    console.error(`[emailReminder] Failed to record failed ${kind} attempt ${attempt} for subscriber ${subscriberId} / sale ${saleId}:`, err);
  }
};

type ClaimResult = 'owned' | 'taken' | 'error';

/** claimReminder with the pass-level failure policy: a missing table aborts the run, any other error skips this send. */
const tryClaim = async (subscriberId: string, saleId: string, kind: string): Promise<ClaimResult> => {
  try {
    return (await claimReminder(subscriberId, saleId, kind)) ? 'owned' : 'taken';
  } catch (claimErr) {
    if (isMissingTableError(claimErr)) throw ledgerUnavailable(claimErr);
    console.error(`[emailReminder] ${kind} claim failed for subscriber ${subscriberId}; skipping (fail closed):`, claimErr);
    return 'error';
  }
};

/** Ledger rows for the given sales, keyed `subscriberId|saleId`. Any failure aborts the run (fail closed). */
const loadLedger = async (saleIds: string[]): Promise<Map<string, Set<string>>> => {
  let rows: Array<{ subscriberId: string; saleId: string; kind: string }>;
  try {
    rows = await prisma.saleReminderSent.findMany({
      where: { saleId: { in: saleIds } },
      select: { subscriberId: true, saleId: true, kind: true },
    });
  } catch (err) {
    throw ledgerUnavailable(err);
  }
  const ledger = new Map<string, Set<string>>();
  for (const row of rows ?? []) {
    const key = `${row.subscriberId}|${row.saleId}`;
    let kinds = ledger.get(key);
    if (!kinds) {
      kinds = new Set<string>();
      ledger.set(key, kinds);
    }
    kinds.add(row.kind);
  }
  return ledger;
};

const failedAttemptsIn = (kinds: Set<string>, kind: string): number => {
  let n = 0;
  for (let i = 1; i <= REMINDER_MAX_ATTEMPTS; i++) if (kinds.has(failureKind(kind, i))) n += 1;
  return n;
};

interface ReminderPassConfig {
  reminderType: 'one-day' | 'two-hours';
  smsKind: string;
  pushType: string;
  push: (sale: { title: string; address: string; city: string }) => { title: string; body: string };
}

const PASS_CONFIG: Record<ReminderKind, ReminderPassConfig> = {
  DAY_BEFORE: {
    reminderType: 'one-day',
    smsKind: 'DAY_BEFORE_SMS',
    pushType: 'SALE_REMINDER_ONE_DAY',
    push: (sale) => ({ title: `Tomorrow: ${sale.title}`, body: `${sale.address}, ${sale.city}. Starts tomorrow.` }),
  },
  TWO_HOURS: {
    reminderType: 'two-hours',
    smsKind: 'TWO_HOURS_SMS',
    pushType: 'SALE_REMINDER_TWO_HOURS',
    push: (sale) => ({ title: `Starting soon: ${sale.title}`, body: `${sale.address}, ${sale.city}. Starts in about 2 hours.` }),
  },
};

/** The signed-in account's own email for a subscriber row (User.email), lower-cased; null when there is none. */
const accountEmailOf = (subscriber: { user?: { email?: string | null } | null }): string | null => {
  const e = subscriber.user?.email;
  return typeof e === 'string' && e.trim() ? e.trim().toLowerCase() : null;
};

/**
 * One reminder pass (email + push + SMS) for a kind: every subscriber of every published sale that is due
 * for `kind` at `now` and has not yet been sent it. Returns how many sales were due. Counters go into
 * `smsOutcomes` (SMS outcome names plus already_claimed_*, email_handled, email_failed, skipped_quiet_hours,
 * skipped_started, retries_exhausted, claim_errors). Each subscriber is isolated: one failure never stops
 * the rest of the pass. Throws only when the ledger is unavailable (see isLedgerUnavailable).
 */
export const processReminderPass = async (
  kind: ReminderKind,
  now: Date,
  smsOutcomes: Record<string, number>,
): Promise<number> => {
  const cfg = PASS_CONFIG[kind];
  const { from, to } = reminderWindow(kind, now);
  const bump = (key: string) => {
    smsOutcomes[key] = (smsOutcomes[key] ?? 0) + 1;
  };
  // `now` is the run's snapshot; a long pass (retries, many subscribers) must not text a sale that has
  // meanwhile started or push a send into quiet hours, so time advances with the real clock during the run.
  const runStartedAt = Date.now();
  const clock = () => new Date(now.getTime() + (Date.now() - runStartedAt));

  const sales = await prisma.sale.findMany({
    where: {
      status: 'PUBLISHED',
      deletedAt: null,
      startDate: { gt: from, lte: to },
      endDate: { gt: now },
    },
    include: {
      subscribers: {
        // user.email: reminder emails go to the ACCOUNT's own address, never to SaleSubscriber.email (see below).
        select: { id: true, email: true, phone: true, userId: true, smsConsentAt: true, emailOptOutAt: true, emailConfirmedAt: true, user: { select: { email: true } } },
      },
      organizer: { select: { id: true, businessName: true, timezone: true, subscriptionTier: true } },
    },
  });
  if (sales.length === 0) return 0;

  const ledger = await loadLedger(sales.map((s: any) => s.id));

  for (const sale of sales) {
    const saleUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/sales/${sale.id}`;
    const saleAddress = `${sale.address}, ${sale.city}, ${sale.state}`;
    const orgTimeZone = (sale as any).organizer?.timezone ?? null;
    const orgTier = (sale as any).organizer?.subscriptionTier ?? null;

    for (const subscriber of sale.subscribers) {
      try {
        const done = ledger.get(`${subscriber.id}|${sale.id}`) ?? new Set<string>();

        // --- Email + push: one claim (kind) for both ---------------------------------------
        if (subscriber.email || subscriber.userId) {
          const failures = failedAttemptsIn(done, kind);
          let claim: ClaimResult = 'taken';
          if (done.has(kind)) {
            bump('already_claimed_email_push');
          } else if (failures >= REMINDER_MAX_ATTEMPTS) {
            bump('retries_exhausted');
          } else if (clock().getTime() >= sale.startDate.getTime()) {
            bump('skipped_started');
          } else {
            claim = await tryClaim(subscriber.id, sale.id, kind);
            if (claim === 'taken') bump('already_claimed_email_push');
            else if (claim === 'error') bump('claim_errors');
          }

          if (claim === 'owned') {
            let emailOk = true;
            if (subscriber.email && subscriber.emailOptOutAt) {
              // The subscriber used the "stop sale reminders" email link: no reminder EMAIL (push still goes).
              bump('skipped_email_opt_out');
            } else if (subscriber.email && !subscriber.userId && !subscriber.emailConfirmedAt) {
              // Guest / orphaned row that never completed the double opt-in (no confirmed address): never emailed.
              // A guest address must never receive a reminder until it has been confirmed through the confirm link.
              bump('skipped_email_no_account');
            } else if (subscriber.email && !subscriber.userId) {
              // CONFIRMED guest row (double opt-in, 2026-09-30): the address the owner confirmed, with an opt-out link.
              try {
                emailOk = await sendGuestReminderEmail({
                  to: String(subscriber.email).trim().toLowerCase(),
                  saleName: sale.title,
                  saleAddress,
                  startDate: sale.startDate,
                  saleUrl,
                  reminderType: cfg.reminderType,
                  orgTimeZone,
                  now: clock(),
                });
              } catch (emailErr) {
                console.error('[emailReminder] sendGuestReminderEmail threw:', emailErr);
                emailOk = false;
              }
            } else if (subscriber.email && !accountEmailOf(subscriber)) {
              bump('skipped_email_no_account'); // account has no email on file: nothing to send to
            } else if (subscriber.email) {
              try {
                emailOk = await sendReminderEmail({
                  // The account's own address, NOT subscriber.email: that column is only an "email me" flag, so a
                  // stored third-party address (older rows, or any future writer) can never receive a reminder.
                  to: accountEmailOf(subscriber) as string,
                  userId: subscriber.userId ?? '',
                  saleName: sale.title,
                  saleAddress,
                  startDate: sale.startDate,
                  saleUrl,
                  reminderType: cfg.reminderType,
                  orgTimeZone,
                  now: clock(),
                });
              } catch (emailErr) {
                console.error('[emailReminder] sendReminderEmail threw:', emailErr);
                emailOk = false;
              }
            }

            if (!emailOk) {
              // Nothing went out: give the claim back so a later run retries (bounded by the failure markers).
              bump('email_failed');
              await releaseReminder(subscriber.id, sale.id, kind);
              await recordFailedAttempt(subscriber.id, sale.id, kind, failures + 1);
            } else {
              // A suppressed address is "handled" (never retried) and counted here too.
              if (subscriber.email && !subscriber.emailOptOutAt && (subscriber.userId || subscriber.emailConfirmedAt)) bump('email_handled');
              if (subscriber.userId) {
                // Push errors never release the claim (the email may already be out).
                try {
                  const pushSubs = await prisma.pushSubscription.findMany({
                    where: { userId: subscriber.userId },
                  });
                  const payload = cfg.push(sale);
                  for (const ps of pushSubs) {
                    await sendPushNotification(ps, {
                      title: payload.title,
                      body: payload.body,
                      url: saleUrl,
                    }, { userId: subscriber.userId, type: cfg.pushType }).catch((err: any) =>
                      console.warn(`Push failed for user ${subscriber.userId}:`, err?.message)
                    );
                  }
                } catch (pushErr) {
                  console.warn(`[emailReminder] Push lookup failed for user ${subscriber.userId}:`, pushErr);
                }
              }
            }
          }
        }

        // --- SMS: only with a phone AND recorded consent (sendReminderSMS re-checks consent, the STOP
        // list and quiet hours; a bare phone number is never texted). Separate claim so a quiet-hours
        // skip can be retried without re-sending the email. ---------------------------------------
        if (subscriber.phone && subscriber.smsConsentAt) {
          const failures = failedAttemptsIn(done, cfg.smsKind);
          if (done.has(cfg.smsKind)) {
            bump('already_claimed_sms');
          } else if (failures >= REMINDER_MAX_ATTEMPTS) {
            bump('retries_exhausted');
          } else if (clock().getTime() >= sale.startDate.getTime()) {
            bump('skipped_started');
          } else if (!organizerHasTier(orgTier, 'PRO')) {
            // Reminder texts are a PRO/TEAMS feature (same as organizer text updates): no claim, no marker.
            bump('skipped_tier');
          } else if (!checkQuietHours(clock(), resolveSendTimeZone(orgTimeZone)).allowed) {
            // Quiet hours: no claim, no marker. The next hourly run delivers it once quiet hours end.
            bump('skipped_quiet_hours');
          } else {
            const smsClaim = await tryClaim(subscriber.id, sale.id, cfg.smsKind);
            if (smsClaim === 'taken') {
              bump('already_claimed_sms');
            } else if (smsClaim === 'error') {
              bump('claim_errors');
            } else {
              let smsOutcome: ReminderSmsOutcome = 'failed';
              try {
                smsOutcome = await sendReminderSMS({
                  to: subscriber.phone,
                  saleName: sale.title,
                  saleAddress,
                  startDate: sale.startDate,
                  reminderType: cfg.reminderType,
                  smsConsentAt: subscriber.smsConsentAt,
                  orgName: (sale as any).organizer?.businessName ?? null,
                  orgTimeZone,
                  orgTier,
                  organizerId: sale.organizerId,
                  saleId: sale.id,
                  now: clock(),
                });
              } catch (smsErr) {
                console.error('[emailReminder] sendReminderSMS threw:', smsErr);
              }
              bump(smsOutcome);
              if (RETRYABLE_SMS_OUTCOMES.has(smsOutcome)) {
                await releaseReminder(subscriber.id, sale.id, cfg.smsKind);
                // Only a real send failure counts toward the retry bound; a quiet-hours or not-configured
                // deferral is not the subscriber's fault and stays retryable until the sale starts.
                if (smsOutcome === 'failed') {
                  await recordFailedAttempt(subscriber.id, sale.id, cfg.smsKind, failures + 1);
                }
              }
            }
          }
        } else if (subscriber.phone) {
          bump('skipped_no_consent');
        }
      } catch (subscriberErr) {
        if (isLedgerUnavailable(subscriberErr)) throw subscriberErr;
        console.error(`[emailReminder] ${kind} reminder failed for subscriber ${subscriber.id}:`, subscriberErr);
      }
    }
  }

  return sales.length;
};

export interface ReminderRunSummary {
  salesChecked: number;
  /** Emails handled (sent, or deliberately skipped for a suppressed address) plus texts sent. */
  sent: number;
  emailHandled: number;
  smsSent: number;
  skippedQuietHours: number;
  /** Texts not sent because the organizer's rolling 24 hour text cap was used up (retried by later runs). */
  skippedCap: number;
  /** Texts not sent because the organizer is not on PRO or TEAMS. */
  skippedTier: number;
  /** Subscribers that already held the ledger row (or lost a concurrent claim): nothing re-sent. */
  alreadySent: number;
  failed: number;
  retriesExhausted: number;
  skippedStarted: number;
  /** True when the ledger table was missing/unreachable: the run sent nothing. */
  ledgerUnavailable: boolean;
  outcomes: Record<string, number>;
}

export const processReminderEmails = async (now: Date = new Date()): Promise<ReminderRunSummary> => {
  const outcomes: Record<string, number> = {};
  let salesChecked = 0;
  let ledgerDown = false;

  for (const kind of ['DAY_BEFORE', 'TWO_HOURS'] as ReminderKind[]) {
    try {
      salesChecked += await processReminderPass(kind, now, outcomes);
    } catch (error) {
      if (isLedgerUnavailable(error)) {
        // Logged once per run: the second pass would only hit the same wall.
        ledgerDown = true;
        console.error(`✗ Reminder run sent nothing: ${(error as Error).message}. Reminders resume once the ledger is available.`);
        break;
      }
      console.error(`✗ Error processing ${kind} reminders:`, error);
    }
  }

  const emailHandled = outcomes.email_handled ?? 0;
  const smsSent = outcomes.sent ?? 0;
  const summary: ReminderRunSummary = {
    salesChecked,
    sent: emailHandled + smsSent,
    emailHandled,
    smsSent,
    skippedQuietHours: outcomes.skipped_quiet_hours ?? 0,
    skippedCap: outcomes.skipped_daily_cap ?? 0,
    skippedTier: outcomes.skipped_tier ?? 0,
    alreadySent: (outcomes.already_claimed_email_push ?? 0) + (outcomes.already_claimed_sms ?? 0),
    failed: (outcomes.email_failed ?? 0) + (outcomes.failed ?? 0),
    retriesExhausted: outcomes.retries_exhausted ?? 0,
    skippedStarted: outcomes.skipped_started ?? 0,
    ledgerUnavailable: ledgerDown,
    outcomes,
  };
  console.log(`✓ Processed reminders: ${salesChecked} sales checked; ${JSON.stringify(summary)}`);
  return summary;
};
