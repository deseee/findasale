/**
 * Rate Limiter Middleware
 *
 * Custom rate limiters for sensitive photo-op endpoints.
 * - photoShareLimiter: 10 requests per user/IP per hour on share POST
 * - shareLikeLimiter: 30 requests per 15 minutes per user/IP
 *
 * validate: false disables all express-rate-limit v8 runtime validations.
 * Trust proxy is correctly set to 1 in index.ts; validations are noise here.
 */

import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { createRateLimitStore, createBurstAlerter } from './rateLimitShared'; // rate-limit hardening Item 1: Redis-backed store + sustained-429-burst alerting

/**
 * Key generator: use user ID if authenticated, fall back to IP address.
 */
const getKeyGenerator = (req: Request) => {
  const authReq = req as any;
  return authReq.user?.id ?? req.ip ?? '0.0.0.0';
};

/**
 * Photo share limiter: 10 requests per hour per user/IP
 */
export const photoShareLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: getKeyGenerator,
  validate: false,
  message: 'Too many photo shares submitted from this IP, please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * Share like limiter: 30 requests per 15 minutes per user/IP
 */
export const shareLikeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  keyGenerator: getKeyGenerator,
  validate: false,
  message: 'Too many like requests from this IP, please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * Item endpoint limiter: 100 requests per minute per user/IP (#111: Bot rate limiting)
 */
export const itemEndpointLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  keyGenerator: getKeyGenerator,
  validate: false,
  message: 'Too many item requests from this IP, please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * Bulk item operations limiter: 10 operations per hour per authenticated user (P0-S3)
 * Applied to POST /api/items/bulk and CSV import endpoints
 */
export const bulkItemsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: getKeyGenerator,
  validate: false,
  message: 'Too many bulk item operations. Maximum 10 per hour per user.',
  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * Feed limiter: 100 requests per minute per IP
 */
export const feedLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  keyGenerator: getKeyGenerator,
  validate: false,
  message: 'Too many feed requests from this IP, please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * Search limiter: 50 requests per minute per IP
 */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50,
  keyGenerator: getKeyGenerator,
  validate: false,
  message: 'Too many search requests from this IP, please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * Message limiter: 30 requests per hour per user/IP
 */
export const messageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  keyGenerator: getKeyGenerator,
  validate: false,
  message: 'Too many message requests, please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * Upload limiter: 100 uploads per hour per user/IP
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  keyGenerator: getKeyGenerator,
  validate: false,
  message: 'Too many uploads. Maximum 100 per hour.',
  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * AI analyze limiter: 50 requests per hour per user/IP (AI inference cost)
 */
export const aiAnalyzeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  keyGenerator: getKeyGenerator,
  validate: false,
  message: 'Too many smart-tagging requests. Maximum 50 per hour.',
  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * Bid limiter: 60 requests per minute per user/IP
 */
export const bidLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  keyGenerator: getKeyGenerator,
  validate: false,
  message: 'Too many bid requests, please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * Payment limiter: 5 requests per minute per user/IP (sensitive operations)
 */
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  keyGenerator: getKeyGenerator,
  validate: false,
  message: 'Too many payment requests, please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * Support chat limiter: 10 requests per hour per user/IP
 */
export const supportChatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: getKeyGenerator,
  validate: false,
  message: 'Too many support requests, please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * Widget inventory limiter: 60 requests per minute per IP (public embed endpoint)
 * IP-keyed only — no user auth on this public route.
 */
export const widgetInventoryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  keyGenerator: (req: Request) => req.ip ?? '0.0.0.0',
  validate: false,
  message: 'Too many widget requests from this IP, please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
});

/**
 * Send test email limiter: 10 requests per hour per user/IP
 * Guards /admin/send-test-email against quota exhaustion (Gmail 1,500/day cap).
 */
export const sendTestEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: getKeyGenerator,
  validate: false,
  message: 'Too many test email requests. Maximum 10 per hour.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * ADR-096 hacker-pass finding: /api/stripe-connect/onboard/:consignorId had no
 * rate limit at all. Harmless before this session (it only returned a link to
 * the organizer's own browser) -- now that it can also email a real
 * consignor's inbox (emailConsignor: true), an organizer hammering this route
 * for the same consignor becomes an email-spam vector. 10 requests per hour
 * per user/IP, matching sendTestEmailLimiter's shape -- generous for the
 * legitimate one-time-per-consignor use case, tight enough to stop abuse.
 */
export const consignorOnboardingInviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: getKeyGenerator,
  validate: false,
  message: 'Too many onboarding invite requests. Maximum 10 per hour.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Shopper reservations limiter: 40 requests per minute, keyed by req.user.id (rate-limit
 * hardening Item 1, 2026-08-27 -- Architect + Hacker sign-off, incident: a ~17min external
 * 429-storm against /api/reservations/shopper and /api/reservations/my-holds-full, fully
 * contained by the existing global/auth limiters but with no dedicated budget of its own).
 * Applied to both GET /shopper and GET /my-holds-full in routes/reservations.ts -- same
 * handler (getMyHoldsFull), one limiter instance, not split.
 *
 * Keyed by req.user.id, NOT IP: both routes sit behind `router.use(authenticate)` already,
 * so req.user.id is always populated by the time this runs. IP-keying was rejected because
 * (a) it would have let a multi-IP burst like today's evade a tighter limit by rotating
 * source IPs, and (b) it risks a real DoS against a legitimate shopper sharing a NAT'd/
 * campus/corporate IP with anyone else hitting this tight budget. Reuses the existing
 * getKeyGenerator from this file rather than a new one.
 *
 * Redis-backed (createRateLimitStore()) like globalLimiter/authLimiter in index.ts, not the
 * in-memory default -- see rateLimitShared.ts. Custom `handler` (429 JSON + console.warn,
 * mirroring globalLimiter's handler shape in index.ts) doubles as the hook for Item 3's
 * sustained-429-burst Sentry alerting.
 */
const shopperReservationsBurstAlert = createBurstAlerter('shopperReservationsLimiter');
export const shopperReservationsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 40,
  keyGenerator: getKeyGenerator,
  validate: false,
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore(),
  handler: (req, res) => {
    const authReq = req as any;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    console.warn(`[rateLimit] 429 ${req.method} ${req.path} userId=${authReq.user?.id ?? 'unknown'} ip=${ip} ua="${req.headers['user-agent'] || ''}"`);
    shopperReservationsBurstAlert(req);
    res.status(429).json({ error: 'Too many requests, please try again later.' });
  },
});
