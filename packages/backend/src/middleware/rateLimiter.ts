/**
 * Rate Limiter Middleware
 *
 * Custom rate limiters for sensitive photo-op endpoints.
 * - photoShareLimiter: 10 requests per user/IP per hour on share POST
 * - shareLikeLimiter: 30 requests per user/IP per 15 minutes on like POST
 */

import rateLimit from 'express-rate-limit';
import { Request } from 'express';

/**
 * Key generator: use user ID if authenticated, fall back to IP address
 */
const getKeyGenerator = (req: Request) => {
  const authReq = req as any;
  return authReq.user?.id || req.ip || '0.0.0.0';
};

/**
 * Photo share limiter: 10 requests per hour per user/IP
 */
export const photoShareLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: getKeyGenerator,
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
  message: 'Too many like requests from this IP, please try again later.',
  standardHeaders: false,
  legacyHeaders: false,
});
