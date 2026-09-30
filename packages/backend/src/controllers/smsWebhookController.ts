import { Request, Response } from 'express';
import twilio from 'twilio';
import {
  classifyInboundKeyword,
  clearSmsOptOut,
  confirmPendingSmsConsent,
  maskPhone,
  normalizePhoneE164,
  recordSmsOptOut,
  sanitizeInboundText,
  SMS_HELP_REPLY,
  verifyTwilioSignature,
} from '../services/smsComplianceService';
import { redisIsBlocked, redisSetBlock } from '../middleware/rateLimitShared';
import { safeErrorForLog } from '../utils/logMask';

/**
 * Replay protection (2026-09-29). A Twilio signature covers the URL and parameters but carries NO timestamp, so a
 * captured valid request (a leaked log, a proxy, a compromised intermediary) verifies forever. That matters because
 * START/YES re-opts a number IN: replaying an old "START" after the person later texted STOP would silently
 * resubscribe them. Each inbound MessageSid is therefore accepted once: it is marked only AFTER the message was
 * processed successfully (so a Twilio retry after our own 500 still works), and a repeat is acknowledged with an empty
 * TwiML reply and NOT processed again. Redis key `rl:sms-inbound-sid:<sid>` (TTL SMS_WEBHOOK_REPLAY_TTL_SECONDS,
 * default 7 days) is shared across instances; when Redis is down a bounded per-process map is used instead.
 * Twilio's own retry window is seconds, so nothing legitimate is ever a repeat.
 */
const replayTtlSeconds = (): number => {
  const n = parseInt(process.env.SMS_WEBHOOK_REPLAY_TTL_SECONDS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 7 * 24 * 60 * 60;
};
const seenSidsLocal = new Map<string, number>();
const MAX_LOCAL_SIDS = 10_000;
const sidKey = (sid: string) => `rl:sms-inbound-sid:${sid}`;

const inboundSid = (req: Request): string | null => {
  const raw = req.body?.MessageSid ?? req.body?.SmsSid;
  return typeof raw === 'string' && raw.length > 0 && raw.length <= 64 ? raw : null;
};
const alreadyProcessed = async (sid: string): Promise<boolean> => {
  const exp = seenSidsLocal.get(sid);
  if (exp !== undefined && exp > Date.now()) return true;
  return redisIsBlocked(sidKey(sid));
};
const markProcessed = async (sid: string): Promise<void> => {
  if (seenSidsLocal.size >= MAX_LOCAL_SIDS) {
    const now = Date.now();
    for (const [k, v] of seenSidsLocal) if (v <= now) seenSidsLocal.delete(k);
    if (seenSidsLocal.size >= MAX_LOCAL_SIDS) seenSidsLocal.delete(seenSidsLocal.keys().next().value as string);
  }
  seenSidsLocal.set(sid, Date.now() + replayTtlSeconds() * 1000);
  await redisSetBlock(sidKey(sid), replayTtlSeconds());
};
/** Test helper. */
export const __resetInboundSidCache = () => seenSidsLocal.clear();

/** Sent (as the webhook reply) only when a YES/START confirmed at least one pending opt-in. */
// A YES confirms only the sale named in the most recent confirmation text to that number (confirmPendingSmsConsent), so
// the reply says so: someone who typed the number on other sales' pages has NOT been signed up for those.
export const SMS_CONSENT_CONFIRMED_REPLY =
  "FindA.Sale: You're signed up for text updates for the sale we just texted you about. Msg frequency varies. Msg&data rates may apply. Reply STOP to opt out, HELP for help.";

/**
 * POST /api/notifications/sms-webhook  (public, Twilio-signature-verified)
 *
 * Twilio "A message comes in" webhook for the FindA.Sale toll-free number. Setup (manual, in the
 * Twilio console): Phone Numbers > the number > Messaging > "A message comes in" > Webhook, HTTP POST,
 * https://<railway backend host>/api/notifications/sms-webhook. (The Voice webhooks configured for
 * /api/twilio/* are a separate setting and are unaffected.)
 *
 * The path contains "/webhook" on purpose: the global CSRF check in middleware/csrf.ts skips those
 * paths, and Twilio cannot send a CSRF cookie. Authentication is the X-Twilio-Signature check
 * (verifyTwilioSignature), fail closed.
 *
 * Behavior (CTIA):
 *  - STOP family (see classifyInboundKeyword: STOP, STOPALL, STOP ALL, UNSUBSCRIBE, CANCEL, END, QUIT,
 *    OPT OUT, REVOKE, REMOVE ME, "please stop texting me", fullwidth letters, ...): add the number to
 *    SmsOptOut AND null out recorded/pending consent on every SaleSubscriber row for that number.
 *    We reply with an empty TwiML document. Twilio sends its own STOP confirmation, and a
 *    <Message> to a just-blocked number would not be delivered anyway.
 *  - START, YES, UNSTOP: remove the number from SmsOptOut, then CONFIRM ONLY the still-pending row (double opt-in,
 *    submitted within 48 hours) of the sale named in the MOST RECENT confirmation text sent to that number, never
 *    every pending row for the number. It never revives consent that a STOP removed: the shopper has to opt in
 *    again on the sale page and reply YES again.
 *  - HELP, INFO: reply with program info and the STOP instruction.
 *  - Anything else: acknowledged with an empty response (no auto-reply loop) and logged with a masked
 *    number and a truncated body so a human can follow up.
 */
export const handleInboundSms = async (req: Request, res: Response) => {
  if (!verifyTwilioSignature(req)) {
    res.status(401).type('text/plain').send('Unauthorized: invalid Twilio signature');
    return;
  }

  const twiml = new twilio.twiml.MessagingResponse();
  const sid = inboundSid(req);
  try {
    if (sid && (await alreadyProcessed(sid))) {
      console.warn(`[SMS webhook] Duplicate/replayed MessageSid ignored (${sid.slice(0, 6)}...).`);
      res.status(200).type('text/xml').send(twiml.toString());
      return;
    }
    const from = normalizePhoneE164(req.body?.From);
    const keyword = classifyInboundKeyword(req.body?.Body, req.body?.OptOutType);

    if (!from) {
      console.warn('[SMS webhook] Inbound message with unusable From number, ignoring.');
    } else if (keyword === 'STOP') {
      // recordSmsOptOut sanitizes/caps the stored keyword at 20 characters and revokes stored consent.
      await recordSmsOptOut(from, String(req.body?.Body || 'STOP'), 'STOP_REPLY');
      console.info(`[SMS webhook] Opt-out recorded for ${maskPhone(from)}`);
    } else if (keyword === 'START') {
      await clearSmsOptOut(from);
      const confirmed = await confirmPendingSmsConsent(from);
      console.info(`[SMS webhook] START/YES from ${maskPhone(from)}: ${confirmed} pending opt-in(s) confirmed`);
      if (confirmed > 0) twiml.message(SMS_CONSENT_CONFIRMED_REPLY);
    } else if (keyword === 'HELP') {
      twiml.message(SMS_HELP_REPLY);
    } else {
      // Not a keyword: a real person may have written to us. Log it (masked) for a human to pick up.
      console.info(`[SMS webhook] Reply needing a human from ${maskPhone(from)}: "${sanitizeInboundText(req.body?.Body, 160)}"`);
    }

    if (sid) await markProcessed(sid);
    res.status(200).type('text/xml').send(twiml.toString());
  } catch (error) {
    // Masked: a raw Prisma error can embed the sender's phone number in the failing query text.
    console.error(`[SMS webhook] Failed to process inbound message: ${safeErrorForLog(error)}`);
    res.status(500).type('text/plain').send('Server error');
  }
};
