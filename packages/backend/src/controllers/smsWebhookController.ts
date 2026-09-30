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

/** Sent (as the webhook reply) only when a YES/START confirmed at least one pending opt-in. */
export const SMS_CONSENT_CONFIRMED_REPLY =
  "FindA.Sale: You're signed up for sale text updates. Msg frequency varies. Msg&data rates may apply. Reply STOP to opt out, HELP for help.";

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
 *  - START, YES, UNSTOP: remove the number from SmsOptOut, then CONFIRM ONLY rows that are still
 *    pending (double opt-in, submitted within 48 hours). It never revives consent that a STOP removed:
 *    the shopper has to opt in again on the sale page and reply YES again.
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
  try {
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

    res.status(200).type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error('[SMS webhook] Failed to process inbound message:', error);
    res.status(500).type('text/plain').send('Server error');
  }
};
