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
  message: 'Too many AI analysis requests. Maximum 50 per hour.',
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
