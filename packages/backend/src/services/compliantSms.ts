/**
 * compliantSms (2026-09-29): the ONE way the backend sends a text message to a shopper.
 *
 * Every sender (organizer text updates, virtual line texts, sale reminders, the double opt-in
 * confirmation) goes through sendCompliantSms / sendCompliantSmsBatch so the rules cannot drift:
 *
 *   1. tier gate (optional minTier + orgTier)      -- paid feature, every text is billed by Twilio
 *   2. recorded consent (SaleSubscriber.smsConsentAt) -- a bare phone number is never texted
 *   3. strict E.164 normalization (+1 only by default), duplicates collapsed
 *   4. STOP suppression list (SmsOptOut), fail closed when the lookup fails
 *   5. quiet hours in the organizer's timezone (8:00 AM to 9:00 PM), unless the caller passes
 *      enforceQuietHours:false for a real-time message the person just asked for (documented per call site)
 *   6. sender prefix "<Business> via FindA.Sale: " + "Reply STOP to opt out." on every message, segment cap
 *   7. per-organizer rolling 24 hour cap. Bulk sends RESERVE their allowance in the database first
 *      (SmsSendLog row with status RESERVED, inside a transaction guarded by a Postgres advisory lock)
 *      and reconcile it to the real numbers afterwards, so a crash or a second server process cannot
 *      undercount. A send larger than the remaining allowance is sent PARTIALLY (skippedByCap).
 *   8. SmsSendLog audit row for every send, masked phone numbers in every log line
 *
 * Nothing here throws: callers get an outcome / a result object.
 */

import twilio from 'twilio';
import { prisma } from '../lib/prisma';
import { organizerHasTier } from '../utils/tierAccess';
import type { SubscriptionTier } from '../utils/tierAccess';
import { redactPhonesInText, safeErrorForLog } from '../utils/logMask';
import {
  SMS_MAX_SEGMENTS,
  checkQuietHours,
  composeSmsBody,
  confirmationLogPrefix,
  estimateSmsSegments,
  getOptedOutPhoneSet,
  getSentInLast24h,
  getSmsDailyCap,
  maskPhone,
  normalizePhoneE164,
  recordSmsOptOut,
  resolveSendTimeZone,
} from './smsComplianceService';

export const SMS_SEND_CONCURRENCY = 10;
/** A RESERVED row older than this is treated as a crashed send: it still counts toward the cap but no longer blocks a new send. */
export const SMS_RESERVATION_STALE_MS = 10 * 60 * 1000;
/** Twilio codes where retrying can never help (bad number, not a mobile, blocked, not permitted). */
const NON_RETRYABLE_TWILIO_CODES = new Set([21211, 21214, 21217, 21408, 21606, 21610, 21611, 21612, 21614]);

// ---------------------------------------------------------------------------
// Twilio client (lazy, same env vars as the rest of the backend)
// ---------------------------------------------------------------------------

let _twilioClient: any = null;
export const getSmsTwilioClient = (): any => {
  if (!_twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (accountSid && authToken) {
      try {
        _twilioClient = twilio(accountSid, authToken);
      } catch (error) {
        console.warn('[SMS] Failed to initialize Twilio client:', (error as Error)?.message);
        _twilioClient = null;
      }
    }
  }
  return _twilioClient;
};

export const isSmsConfigured = (): boolean => !!getSmsTwilioClient() && !!process.env.TWILIO_PHONE_NUMBER;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CompliantSmsOutcome =
  | 'sent'
  | 'failed'
  | 'skipped_tier'
  | 'skipped_no_consent'
  | 'skipped_invalid_phone'
  | 'skipped_opted_out'
  | 'skipped_quiet_hours'
  | 'skipped_not_configured'
  | 'skipped_too_long'
  | 'skipped_daily_cap';

export interface SmsItem {
  /** Raw phone number as stored; normalized here. */
  to: string;
  /** Text between the sender prefix and the STOP footer. */
  message: string;
  /** SaleSubscriber.smsConsentAt for this number. Required unless the context sets requireConsent:false. */
  consentAt?: Date | null;
  /** Shorter text tried when `message` would exceed the segment cap. */
  altMessage?: string;
}

export interface SmsSenderContext {
  organizerId?: string | null;
  saleId?: string | null;
  orgName?: string | null;
  orgTimeZone?: string | null;
  /** The organizer's subscription tier, checked against minTier when minTier is set. */
  orgTier?: unknown;
  minTier?: SubscriptionTier;
  /** Default true. Only false for the double opt-in confirmation, and for callers that already filtered on smsConsentAt. */
  requireConsent?: boolean;
  /** Default true. False only for a real-time message to someone who just took an action (see call sites). */
  enforceQuietHours?: boolean;
  /** Default true. Requires organizerId. */
  enforceDailyCap?: boolean;
  /** Text stored in SmsSendLog.message (never a phone number). Defaults to the first message. */
  logMessage?: string;
  now?: Date;
  /** Twilio attempts per single send (default 1). Backoff: baseDelayMs * 2^n, 4^n for 429s. */
  maxAttempts?: number;
  baseDelayMs?: number;
}

export interface SmsBatchOptions extends SmsSenderContext {
  /** Refuse to start while another bulk send for this organizer is in flight (double-click / multi-process guard). */
  exclusive?: boolean;
}

export type SmsBatchBlock =
  | 'tier'
  | 'no_organizer'
  | 'not_configured'
  | 'quiet_hours'
  | 'opt_out_lookup_failed'
  | 'in_progress'
  | 'cap_reached'
  | 'reservation_failed';

export interface SmsBatchResult {
  blocked: SmsBatchBlock | null;
  timeZone: string;
  nextAllowedAt: Date | null;
  /** Numbers that passed every check and were eligible for a send (before the daily cap). */
  audience: number;
  sent: number;
  failed: number;
  skippedNoConsent: number;
  skippedInvalidPhone: number;
  /** STOP-list numbers, plus numbers Twilio reported as carrier-blocked during this send. */
  skippedOptedOut: number;
  skippedTooLong: number;
  /** Eligible numbers NOT texted because the rolling 24 hour cap ran out (partial send). */
  skippedByCap: number;
  dailyCap: number;
  /** Allowance left after this send (null when the cap is not enforced). */
  remainingToday: number | null;
  reservationId: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** One-line, length-capped text that is safe to put inside a text message (sale titles, names). */
export const cleanSmsText = (value: unknown, maxLen = 40): string =>
  String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);

const describeSendError = (err: any): string => {
  const code = err?.code ?? err?.status ?? 'unknown';
  return `code=${code} ${redactPhonesInText(err?.message ?? err, 200)}`;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Composed = { phone: string; body: string; text: string; segments: number };

/** Compose the final body; falls back to altMessage when the first would exceed the segment cap. */
const composeItem = (phone: string, item: SmsItem, orgName: string | null | undefined): Composed | null => {
  for (const text of [item.message, item.altMessage]) {
    if (!text || !text.trim()) continue;
    const body = composeSmsBody(orgName, text);
    const { segments } = estimateSmsSegments(body);
    if (segments <= SMS_MAX_SEGMENTS) return { phone, body, text: text.trim(), segments };
  }
  return null;
};

type TwilioSendResult = { ok: true } | { ok: false; carrierBlocked: boolean; error: any };

/** One Twilio create() with bounded retries. 21610 and other permanent errors are never retried. */
async function twilioSend(client: any, body: string, to: string, maxAttempts: number, baseDelayMs: number): Promise<TwilioSendResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await client.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER, to });
      return { ok: true };
    } catch (error: any) {
      if (error?.code === 21610) return { ok: false, carrierBlocked: true, error };
      const permanent = NON_RETRYABLE_TWILIO_CODES.has(Number(error?.code));
      if (permanent || attempt === maxAttempts - 1) return { ok: false, carrierBlocked: false, error };
      const isRateLimit = error?.status === 429 || error?.code === 20429 || error?.statusCode === 429;
      await sleep(isRateLimit ? baseDelayMs * Math.pow(4, attempt) : baseDelayMs * Math.pow(2, attempt));
    }
  }
  return { ok: false, carrierBlocked: false, error: new Error('Max retries exceeded') };
}

// ---------------------------------------------------------------------------
// Single send
// ---------------------------------------------------------------------------

export async function sendCompliantSms(item: SmsItem, ctx: SmsSenderContext): Promise<{ outcome: CompliantSmsOutcome; segments: number }> {
  const requireConsent = ctx.requireConsent !== false;
  const enforceQuiet = ctx.enforceQuietHours !== false;
  const enforceCap = ctx.enforceDailyCap !== false;
  const noSend = (outcome: CompliantSmsOutcome, segments = 0) => ({ outcome, segments });

  if (ctx.minTier && !organizerHasTier(ctx.orgTier, ctx.minTier)) {
    console.log(`[SMS] skipped: organizer tier below ${ctx.minTier}`);
    return noSend('skipped_tier');
  }
  if (requireConsent && !item.consentAt) {
    console.log('[SMS] skipped: no recorded text-message consent');
    return noSend('skipped_no_consent');
  }

  const phone = normalizePhoneE164(item.to);
  if (!phone) {
    console.warn(`[SMS] skipped: invalid phone ${maskPhone(item.to)}`);
    return noSend('skipped_invalid_phone');
  }

  try {
    if ((await getOptedOutPhoneSet([phone])).has(phone)) {
      console.log(`[SMS] skipped: ${maskPhone(phone)} is on the STOP list`);
      return noSend('skipped_opted_out');
    }
  } catch (err) {
    // Cannot prove the number is not opted out: fail closed.
    console.error('[SMS] skipped: opt-out lookup failed:', (err as Error)?.message);
    return noSend('skipped_opted_out');
  }

  if (enforceQuiet) {
    const timeZone = resolveSendTimeZone(ctx.orgTimeZone);
    const quiet = checkQuietHours(ctx.now ?? new Date(), timeZone);
    if (!quiet.allowed) {
      console.log(`[SMS] skipped for ${maskPhone(phone)}: quiet hours in ${timeZone} (local hour ${quiet.localHour})`);
      return noSend('skipped_quiet_hours');
    }
  }

  const client = getSmsTwilioClient();
  if (!client || !process.env.TWILIO_PHONE_NUMBER) {
    console.warn('[SMS] Twilio not configured, skipping text');
    return noSend('skipped_not_configured');
  }

  const composed = composeItem(phone, item, ctx.orgName);
  if (!composed) {
    console.warn(`[SMS] skipped for ${maskPhone(phone)}: message exceeds ${SMS_MAX_SEGMENTS} segments`);
    return noSend('skipped_too_long');
  }

  if (enforceCap) {
    if (!ctx.organizerId) return noSend('skipped_daily_cap', composed.segments); // cannot account for it: fail closed
    try {
      const sentToday = await getSentInLast24h(ctx.organizerId, ctx.now ?? new Date());
      if (sentToday >= getSmsDailyCap()) {
        console.log(`[SMS] skipped for ${maskPhone(phone)}: organizer ${ctx.organizerId} reached the daily text cap`);
        return noSend('skipped_daily_cap', composed.segments);
      }
    } catch (err) {
      console.error('[SMS] skipped: daily cap lookup failed:', (err as Error)?.message);
      return noSend('skipped_daily_cap', composed.segments);
    }
  }

  const result = await twilioSend(client, composed.body, phone, Math.max(1, ctx.maxAttempts ?? 1), ctx.baseDelayMs ?? 1000);
  if (!result.ok && result.carrierBlocked) {
    await recordSmsOptOut(phone, null, 'TWILIO_21610').catch((e: unknown) => console.error(`[SMS] Failed to record 21610 opt-out: ${safeErrorForLog(e)}`));
    console.log(`[SMS] skipped: ${maskPhone(phone)} blocked our number at the carrier (21610)`);
    return noSend('skipped_opted_out', composed.segments);
  }
  const sent = result.ok;
  if (sent) console.log(`[SMS] sent to ${maskPhone(phone)}`);
  else console.error(`[SMS] failed to send to ${maskPhone(phone)}: ${describeSendError((result as any).error)}`);

  if (ctx.organizerId && ctx.saleId) {
    try {
      await prisma.smsSendLog.create({
        data: {
          organizerId: ctx.organizerId,
          saleId: ctx.saleId,
          message: (ctx.logMessage ?? composed.text).slice(0, 500),
          segments: composed.segments,
          recipientCount: 1,
          sentCount: sent ? 1 : 0,
          failedCount: sent ? 0 : 1,
          skippedOptOutCount: 0,
        },
      });
    } catch (logErr) {
      console.error('[SMS] Failed to write SmsSendLog row:', (logErr as Error)?.message);
    }
  }
  return { outcome: sent ? 'sent' : 'failed', segments: composed.segments };
}

// ---------------------------------------------------------------------------
// Bulk send with a database-backed reservation
// ---------------------------------------------------------------------------

export type Reservation =
  | { ok: true; reservationId: string; granted: number; remainingBefore: number }
  | { ok: false; reason: 'in_progress' | 'cap_reached' | 'reservation_failed'; remainingBefore: number };

/**
 * Reserve up to `requested` sends against the organizer's rolling 24 hour cap. Runs in one transaction
 * behind pg_try_advisory_xact_lock(organizer), so two processes (or a double click) cannot both read
 * the same "remaining" figure. Inserts the RESERVED SmsSendLog row that reconcileSmsReservation later
 * finalizes. `exclusive` also refuses while a fresh RESERVED row (another bulk send) exists.
 */
export async function reserveSmsAllowance(p: {
  organizerId: string;
  saleId: string;
  message: string;
  segments: number;
  requested: number;
  exclusive?: boolean;
  now?: Date;
}): Promise<Reservation> {
  const cap = getSmsDailyCap();
  const now = p.now ?? new Date();
  try {
    return await prisma.$transaction(
      async (tx: any) => {
        const lockRows = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${`sms-cap:${p.organizerId}`})) AS locked`;
        const locked = Array.isArray(lockRows) ? !!lockRows[0]?.locked : false;
        if (!locked) return { ok: false, reason: 'in_progress', remainingBefore: 0 } as Reservation;

        if (p.exclusive) {
          const inFlight = await tx.smsSendLog.count({
            where: {
              organizerId: p.organizerId,
              status: 'RESERVED',
              createdAt: { gte: new Date(now.getTime() - SMS_RESERVATION_STALE_MS) },
            },
          });
          if (inFlight > 0) return { ok: false, reason: 'in_progress', remainingBefore: 0 } as Reservation;
        }

        const agg = await tx.smsSendLog.aggregate({
          where: { organizerId: p.organizerId, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
          _sum: { sentCount: true },
        });
        const remaining = Math.max(0, cap - (agg?._sum?.sentCount ?? 0));
        if (remaining === 0) return { ok: false, reason: 'cap_reached', remainingBefore: 0 } as Reservation;

        const granted = Math.min(p.requested, remaining);
        const row = await tx.smsSendLog.create({
          data: {
            organizerId: p.organizerId,
            saleId: p.saleId,
            message: p.message.slice(0, 500),
            segments: p.segments,
            recipientCount: p.requested,
            sentCount: granted,
            failedCount: 0,
            skippedOptOutCount: 0,
            status: 'RESERVED',
          },
        });
        return { ok: true, reservationId: row.id, granted, remainingBefore: remaining } as Reservation;
      },
      { maxWait: 5000, timeout: 10000 }
    );
  } catch (err) {
    console.error('[SMS] Failed to reserve daily allowance (sending nothing):', (err as Error)?.message);
    return { ok: false, reason: 'reservation_failed', remainingBefore: 0 };
  }
}

/** Replace the planned numbers on a reservation row with what actually happened. Retries once; never throws. */
export async function reconcileSmsReservation(
  reservationId: string,
  actual: { sent: number; failed: number; skippedOptOut: number }
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await prisma.smsSendLog.update({
        where: { id: reservationId },
        data: {
          sentCount: actual.sent,
          failedCount: actual.failed,
          skippedOptOutCount: actual.skippedOptOut,
          status: 'COMPLETE',
          completedAt: new Date(),
        },
      });
      return true;
    } catch (err) {
      console.error(`[SMS] Failed to reconcile reservation ${reservationId} (attempt ${attempt + 1}); it keeps counting its planned sends:`, (err as Error)?.message);
    }
  }
  return false;
}

export async function sendCompliantSmsBatch(items: SmsItem[], opts: SmsBatchOptions): Promise<SmsBatchResult> {
  const requireConsent = opts.requireConsent !== false;
  const enforceQuiet = opts.enforceQuietHours !== false;
  const enforceCap = opts.enforceDailyCap !== false;
  const timeZone = resolveSendTimeZone(opts.orgTimeZone);
  const dailyCap = getSmsDailyCap();
  const result: SmsBatchResult = {
    blocked: null,
    timeZone,
    nextAllowedAt: null,
    audience: 0,
    sent: 0,
    failed: 0,
    skippedNoConsent: 0,
    skippedInvalidPhone: 0,
    skippedOptedOut: 0,
    skippedTooLong: 0,
    skippedByCap: 0,
    dailyCap,
    remainingToday: null,
    reservationId: null,
  };
  const block = (reason: SmsBatchBlock) => {
    result.blocked = reason;
    return result;
  };

  if (opts.minTier && !organizerHasTier(opts.orgTier, opts.minTier)) return block('tier');
  if (enforceCap && (!opts.organizerId || !opts.saleId)) return block('no_organizer');

  const client = getSmsTwilioClient();
  if (!client || !process.env.TWILIO_PHONE_NUMBER) return block('not_configured');

  if (enforceQuiet) {
    const quiet = checkQuietHours(opts.now ?? new Date(), timeZone);
    if (!quiet.allowed) {
      result.nextAllowedAt = quiet.nextAllowedAt;
      return block('quiet_hours');
    }
  }

  // Filter: consent, phone, duplicates, message length.
  const composed: Composed[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (requireConsent && !item.consentAt) {
      result.skippedNoConsent++;
      continue;
    }
    const phone = normalizePhoneE164(item.to);
    if (!phone) {
      result.skippedInvalidPhone++;
      continue;
    }
    if (seen.has(phone)) continue;
    seen.add(phone);
    const c = composeItem(phone, item, opts.orgName);
    if (!c) {
      result.skippedTooLong++;
      continue;
    }
    composed.push(c);
  }

  let eligible = composed;
  try {
    const optedOut = await getOptedOutPhoneSet(composed.map((c) => c.phone));
    eligible = composed.filter((c) => !optedOut.has(c.phone));
    result.skippedOptedOut += composed.length - eligible.length;
  } catch (err) {
    console.error('[SMS] batch blocked: opt-out lookup failed:', (err as Error)?.message);
    return block('opt_out_lookup_failed');
  }
  result.audience = eligible.length;
  if (eligible.length === 0) return result;

  let toSend = eligible;
  let reservationId: string | null = null;
  let remainingBefore: number | null = null;
  if (enforceCap) {
    const maxSegments = eligible.reduce((m, c) => Math.max(m, c.segments), 1);
    const reservation = await reserveSmsAllowance({
      organizerId: opts.organizerId as string,
      saleId: opts.saleId as string,
      message: opts.logMessage ?? eligible[0].text,
      segments: maxSegments,
      requested: eligible.length,
      exclusive: opts.exclusive,
      now: opts.now,
    });
    if (!reservation.ok) {
      if (reservation.reason === 'cap_reached') result.remainingToday = 0;
      return block(reservation.reason);
    }
    reservationId = reservation.reservationId;
    remainingBefore = reservation.remainingBefore;
    result.reservationId = reservationId;
    toSend = eligible.slice(0, reservation.granted);
    result.skippedByCap = eligible.length - toSend.length;
  }

  let carrierBlocked = 0;
  try {
    for (let i = 0; i < toSend.length; i += SMS_SEND_CONCURRENCY) {
      let chunk = toSend.slice(i, i + SMS_SEND_CONCURRENCY);
      // 2026-09-29: opt-out re-checked at send time. The snapshot taken above can be minutes old on a large
      // audience (quiet-hours wait, reservation, slow carrier retries), and a STOP that arrives mid-batch used to
      // still get the remaining messages. Every chunk after the first re-reads the opt-out table for just its
      // own phones; a lookup failure fails CLOSED for that chunk (not sent, counted as failed).
      if (i > 0) {
        try {
          const nowOptedOut = await getOptedOutPhoneSet(chunk.map((c) => c.phone));
          if (nowOptedOut.size > 0) {
            const still = chunk.filter((c) => !nowOptedOut.has(c.phone));
            result.skippedOptedOut += chunk.length - still.length;
            result.audience = Math.max(0, result.audience - (chunk.length - still.length));
            chunk = still;
          }
        } catch (err) {
          console.error('[SMS] chunk skipped: opt-out re-check failed:', (err as Error)?.message);
          result.failed += chunk.length;
          continue;
        }
        if (chunk.length === 0) continue;
      }
      const settled = await Promise.all(
        chunk.map((c) => twilioSend(client, c.body, c.phone, Math.max(1, opts.maxAttempts ?? 1), opts.baseDelayMs ?? 1000))
      );
      for (let j = 0; j < settled.length; j++) {
        const r = settled[j];
        if (r.ok) {
          result.sent++;
        } else if (r.carrierBlocked) {
          carrierBlocked++;
          await recordSmsOptOut(chunk[j].phone, null, 'TWILIO_21610').catch((e: unknown) =>
            console.error(`[SMS] Failed to record 21610 opt-out: ${safeErrorForLog(e)}`)
          );
        } else {
          result.failed++;
          console.error(`[SMS] Failed to send to ${maskPhone(chunk[j].phone)}: ${describeSendError(r.error)}`);
        }
      }
    }
  } finally {
    result.skippedOptedOut += carrierBlocked;
    if (reservationId) {
      // Runs even if a send threw unexpectedly, so the row reflects what really went out.
      await reconcileSmsReservation(reservationId, {
        sent: result.sent,
        failed: result.failed,
        skippedOptOut: result.skippedOptedOut,
      });
    }
  }

  if (remainingBefore !== null) result.remainingToday = Math.max(0, remainingBefore - result.sent);
  return result;
}

// ---------------------------------------------------------------------------
// Double opt-in confirmation text
// ---------------------------------------------------------------------------

/**
 * The single text sent when a shopper submits a phone number. It asks the person who OWNS the number
 * to reply YES; nothing else is ever sent to a pending number. Counted in the organizer's daily cap and
 * SmsSendLog like any other text. Not held back by quiet hours: it answers a request the shopper made
 * seconds ago (and holding it would leave the "check your phone" screen waiting for a text that never comes).
 */
export async function sendConsentConfirmationSms(p: {
  to: string;
  saleTitle: string;
  orgName?: string | null;
  organizerId?: string | null;
  saleId?: string | null;
  orgTimeZone?: string | null;
  now?: Date;
}): Promise<CompliantSmsOutcome> {
  const title = cleanSmsText(p.saleTitle, 40) || 'this sale';
  // The log message starts with a non-reversible per-number key (see phoneConfirmationKey) so confirmation texts can be
  // counted per number across sales and a later YES can be tied to the sale this text was about.
  const e164 = normalizePhoneE164(p.to);
  const logTag = e164 ? confirmationLogPrefix(e164) : '[confirmation]';
  const { outcome } = await sendCompliantSms(
    {
      to: p.to,
      message: `Reply YES to get text updates for ${title}. Msg&data rates may apply.`,
      altMessage: 'Reply YES to get sale text updates. Msg&data rates may apply.',
    },
    {
      organizerId: p.organizerId,
      saleId: p.saleId,
      orgName: p.orgName,
      orgTimeZone: p.orgTimeZone,
      requireConsent: false,
      enforceQuietHours: false,
      enforceDailyCap: !!p.organizerId,
      logMessage: `${logTag} ${title}`,
      now: p.now,
    }
  );
  return outcome;
}
