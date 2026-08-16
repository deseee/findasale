import { Router, Request, Response } from 'express';
import twilio from 'twilio';
import { emailService } from '../lib/emailService';

// Inbound voice + voicemail handling for the existing FindA.Sale Twilio toll-free
// number (TWILIO_PHONE_NUMBER, +18556943115). That number is otherwise used only
// for outbound SMS (see lineController.ts / notificationController.ts /
// emailReminderService.ts) — this file adds the "someone calls it" side.
//
// Flow:
//   1. Twilio POSTs to /api/twilio/voice-incoming when the number is called.
//      We reply with TwiML: a short greeting, then <Record> a voicemail.
//   2. When the recording finishes, Twilio POSTs to
//      /api/twilio/voice-recording-complete (recordingStatusCallback). We email
//      support@finda.sale with the caller's number and the recording URL.
//
// Both endpoints are public/unauthenticated (Twilio can't send a cookie or JWT),
// so every request is verified with Twilio's own request-signature check
// (twilio.validateRequest) using TWILIO_AUTH_TOKEN before anything else runs —
// fail-closed if the signature is missing/invalid/unconfigured, mirroring the
// pattern already used for the Resend webhook (routes/outreach.ts) and Stripe
// webhook (controllers/stripeController.ts).
//
// No transcription (TranscriptionCallback) — not requested, adds cost.
// No new schema/DB model for MVP — this is a stateless webhook + email notify.

const router = Router();

/**
 * Verify the request actually came from Twilio using the X-Twilio-Signature
 * header. Returns true/false; also handles the "not configured" case by
 * returning false (fail-closed) after logging.
 */
function isValidTwilioRequest(req: Request): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('[TwilioVoice] TWILIO_AUTH_TOKEN not set — rejecting webhook (fail-closed).');
    return false;
  }

  const twilioSignature = req.headers['x-twilio-signature'] as string | undefined;
  if (!twilioSignature) {
    console.warn('[TwilioVoice] Missing X-Twilio-Signature header — rejecting.');
    return false;
  }

  // Must match the exact URL Twilio signed against. app.set('trust proxy', 1) in
  // index.ts makes req.protocol reflect the real scheme (https) behind Railway's
  // proxy rather than the internal http hop.
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  return twilio.validateRequest(authToken, twilioSignature, url, req.body || {});
}

// POST /api/twilio/voice-incoming — "A call comes in" webhook.
router.post('/voice-incoming', (req: Request, res: Response) => {
  if (!isValidTwilioRequest(req)) {
    res.status(401).type('text/plain').send('Unauthorized: invalid Twilio signature');
    return;
  }

  const host = req.get('host');
  const recordingCallbackUrl = `${req.protocol}://${host}/api/twilio/voice-recording-complete`;

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    { voice: 'Polly.Joanna' },
    "Thanks for calling FindA.Sale. We can't take your call right now. Please leave a message after the tone and we'll get back to you."
  );
  twiml.record({
    maxLength: 120,
    playBeep: true,
    trim: 'trim-silence',
    recordingStatusCallback: recordingCallbackUrl,
    recordingStatusCallbackMethod: 'POST',
    recordingStatusCallbackEvent: ['completed'],
  });
  // Reached only if the caller hangs up without leaving a message after <Record> times out.
  twiml.say({ voice: 'Polly.Joanna' }, "We didn't receive a message. Goodbye.");
  twiml.hangup();

  res.type('text/xml').send(twiml.toString());
});

// POST /api/twilio/voice-recording-complete — recordingStatusCallback.
router.post('/voice-recording-complete', async (req: Request, res: Response) => {
  if (!isValidTwilioRequest(req)) {
    res.status(401).type('text/plain').send('Unauthorized: invalid Twilio signature');
    return;
  }

  // Ack Twilio immediately with 200 regardless of downstream email outcome —
  // Twilio retries this callback on non-2xx, and a flaky email send shouldn't
  // trigger duplicate retries/notifications.
  res.status(200).type('text/plain').send('OK');

  const recordingStatus = (req.body?.RecordingStatus as string) || '';
  if (recordingStatus && recordingStatus !== 'completed') {
    // In-progress / failed status pings — nothing to notify on yet.
    return;
  }

  const from = (req.body?.From as string) || 'Unknown number';
  const recordingUrl = (req.body?.RecordingUrl as string) || '';
  const callSid = (req.body?.CallSid as string) || '';

  try {
    const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
    const toEmail = process.env.SUPPORT_EMAIL || 'support@finda.sale';

    await emailService.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `New voicemail from ${from}`,
      html: `
        <p>You have a new voicemail on the FindA.Sale support line.</p>
        <p><strong>From:</strong> ${from}</p>
        <p><strong>Recording:</strong> ${recordingUrl ? `<a href="${recordingUrl}">${recordingUrl}</a>` : '(no recording URL provided)'}</p>
        <p style="color:#666;font-size:12px">Note: opening the recording link requires the Twilio account login (Basic Auth), same as any Twilio recording URL. Call SID: ${callSid || 'n/a'}</p>
      `,
      jobName: 'twilio-voicemail-notification',
    });
    console.log(`[TwilioVoice] Voicemail notification email sent for call ${callSid} from ${from}`);
  } catch (err) {
    console.error('[TwilioVoice] Failed to send voicemail notification email:', err);
  }
});

export default router;
