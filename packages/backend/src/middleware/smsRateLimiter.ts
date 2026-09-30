import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { createRateLimitStore, createBurstAlerter } from './rateLimitShared';
import { AuthRequest } from './auth';
import { getClientIp } from '../utils/getClientIp';

/**
 * smsRateLimiter (2026-09-29): per-organizer burst and hourly limits for POST /notifications/send-sms.
 *
 * These sit IN FRONT of the real cost control (the rolling 24 hour recipient cap computed from
 * SmsSendLog in services/smsComplianceService.ts). They exist to stop double-clicks, retry loops
 * and scripted abuse from firing several Twilio blasts before the cap has a chance to count them.
 * Keyed by organizer id (falls back to user id, then IP), Redis-backed via createRateLimitStore.
 *
 *   burst:  2 sends / minute
 *   hourly: SMS_MAX_SENDS_PER_HOUR (default 6) sends / hour
 */
const smsKeyGenerator = (req: Request) => {
  const r = req as AuthRequest;
  return r.user?.organizerProfile?.id ?? r.user?.id ?? req.ip ?? '0.0.0.0';
};

const hourlyMax = (() => {
  const n = parseInt(process.env.SMS_MAX_SENDS_PER_HOUR || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 6;
})();

const burstAlert = createBurstAlerter('smsSendBurstLimiter');
const hourlyAlert = createBurstAlerter('smsSendHourlyLimiter');

export const smsSendBurstLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 2,
  keyGenerator: smsKeyGenerator,
  validate: false,
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore('rl:sms-burst:'),
  handler: (req, res) => {
    console.warn(`[smsRateLimiter] burst 429 organizer=${smsKeyGenerator(req)}`);
    burstAlert(req);
    res.status(429).json({
      message: 'You are sending texts too quickly. Wait a minute and try again.',
      code: 'SMS_RATE_LIMITED',
      retryAfterSeconds: 60,
    });
  },
});

export const smsSendHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: hourlyMax,
  keyGenerator: smsKeyGenerator,
  validate: false,
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore('rl:sms-hourly:'),
  handler: (req, res) => {
    console.warn(`[smsRateLimiter] hourly 429 organizer=${smsKeyGenerator(req)}`);
    hourlyAlert(req);
    res.status(429).json({
      message: `You can send up to ${hourlyMax} text updates per hour. Try again later.`,
      code: 'SMS_RATE_LIMITED',
      retryAfterSeconds: 3600,
    });
  },
});

// ---------------------------------------------------------------------------------------------
// Added 2026-09-29: limiters for the virtual line texts and for the phone-number subscribe flow.
// Separate counters from send-sms above so a busy sale day of "now serving" updates cannot eat the
// text-update allowance (and the other way round).
// ---------------------------------------------------------------------------------------------

const intEnv = (name: string, fallback: number): number => {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** True when the request carries a non-empty phone number (only those requests create a text opt-in). */
const bodyHasPhone = (req: Request): boolean => {
  const phone = (req.body as { phone?: unknown } | undefined)?.phone;
  return typeof phone === 'string' && phone.trim() !== '';
};

const lineHourlyMax = intEnv('LINE_SMS_MAX_BROADCASTS_PER_HOUR', 30);
const lineBurstAlert = createBurstAlerter('lineSmsBurstLimiter');
const lineHourlyAlert = createBurstAlerter('lineSmsHourlyLimiter');

/** Virtual line organizer actions that text shoppers (/start, /notify, /broadcast): 3 per minute per organizer. */
export const lineSmsBurstLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  keyGenerator: smsKeyGenerator,
  validate: false,
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore('rl:line-sms-burst:'),
  handler: (req, res) => {
    console.warn(`[smsRateLimiter] line burst 429 organizer=${smsKeyGenerator(req)}`);
    lineBurstAlert(req);
    res.status(429).json({
      message: 'You are sending line updates too quickly. Wait a minute and try again.',
      code: 'SMS_RATE_LIMITED',
      retryAfterSeconds: 60,
    });
  },
});

/** Same actions, LINE_SMS_MAX_BROADCASTS_PER_HOUR (default 30) per hour per organizer. */
export const lineSmsHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: lineHourlyMax,
  keyGenerator: smsKeyGenerator,
  validate: false,
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore('rl:line-sms-hourly:'),
  handler: (req, res) => {
    console.warn(`[smsRateLimiter] line hourly 429 organizer=${smsKeyGenerator(req)}`);
    lineHourlyAlert(req);
    res.status(429).json({
      message: `You can send up to ${lineHourlyMax} line updates per hour. Try again later.`,
      code: 'SMS_RATE_LIMITED',
      retryAfterSeconds: 3600,
    });
  },
});

const subscribeUserMax = intEnv('SMS_SUBSCRIBE_MAX_PER_USER_HOUR', 5);
const subscribeIpMax = intEnv('SMS_SUBSCRIBE_MAX_PER_IP_HOUR', 10);
const subscribeUserAlert = createBurstAlerter('smsSubscribeUserLimiter');
const subscribeIpAlert = createBurstAlerter('smsSubscribeIpLimiter');

const subscribeLimited = (res: import('express').Response) =>
  res.status(429).json({
    message: 'Too many text sign-up attempts. Please try again later.',
    code: 'SMS_SUBSCRIBE_RATE_LIMITED',
    retryAfterSeconds: 3600,
  });

/**
 * POST /notifications/subscribe with a phone number: SMS_SUBSCRIBE_MAX_PER_USER_HOUR (default 5) per
 * signed-in account per hour. Requests without a phone (email-only follow, "turn texts off") are not
 * counted, so normal use is unaffected. Every counted request can cost us one confirmation text, so
 * this is what stops an account from using the endpoint to text arbitrary numbers.
 */
export const smsSubscribeUserLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: subscribeUserMax,
  keyGenerator: (req: Request) => (req as AuthRequest).user?.id ?? getClientIp(req),
  skip: (req: Request) => !bodyHasPhone(req),
  validate: false,
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore('rl:sms-subscribe-user:'),
  handler: (req, res) => {
    console.warn(`[smsRateLimiter] subscribe user 429 user=${(req as AuthRequest).user?.id ?? 'unknown'}`);
    subscribeUserAlert(req);
    subscribeLimited(res);
  },
});

/** Same requests, SMS_SUBSCRIBE_MAX_PER_IP_HOUR (default 10) per client IP per hour (many accounts, one attacker). */
export const smsSubscribeIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: subscribeIpMax,
  keyGenerator: (req: Request) => getClientIp(req),
  skip: (req: Request) => !bodyHasPhone(req),
  validate: false,
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore('rl:sms-subscribe-ip:'),
  handler: (req, res) => {
    console.warn(`[smsRateLimiter] subscribe ip 429 ip=${getClientIp(req)}`);
    subscribeIpAlert(req);
    subscribeLimited(res);
  },
});
