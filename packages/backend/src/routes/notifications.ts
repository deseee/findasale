import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { smsSendBurstLimiter, smsSendHourlyLimiter, smsSubscribeUserLimiter, smsSubscribeIpLimiter } from '../middleware/smsRateLimiter';
import {
  subscribeToSale,
  unsubscribeFromSale,
  getUserSubscriptions,
  sendSMSUpdate,
  getSmsAudienceSummary
} from '../controllers/notificationController';
import { handleInboundSms } from '../controllers/smsWebhookController';

const router = express.Router();

// Subscription management
// /subscribe with a phone number can trigger one confirmation text, so it is limited per account and per
// IP (requests without a phone number are not counted by these limiters).
router.post('/subscribe', authenticate, smsSubscribeUserLimiter, smsSubscribeIpLimiter, subscribeToSale);
router.delete('/unsubscribe/:saleId', authenticate, unsubscribeFromSale);
router.get('/subscriptions', authenticate, getUserSubscriptions);

// SMS updates (2026-09-29): PRO and above only, because every text is billed by Twilio.
// Order matters: authenticate -> tier gate -> per-organizer burst + hourly limits -> handler
// (handler adds consent, STOP list, quiet hours and the rolling daily cap).
router.post('/send-sms', authenticate, requireTier('PRO'), smsSendBurstLimiter, smsSendHourlyLimiter, sendSMSUpdate);

// Audience + limits summary for the send-update page (counts only, no phone numbers or names)
router.get('/sms-audience/:saleId', authenticate, requireTier('PRO'), getSmsAudienceSummary);

// Twilio inbound SMS webhook (STOP / START / HELP). Public, Twilio-signature-verified.
// The path contains "/webhook" so the global CSRF check skips it (see middleware/csrf.ts).
router.post('/sms-webhook', handleInboundSms);

export default router;
