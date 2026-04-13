import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

/**
 * Initialize Redis connection for coupon validation rate limiting.
 * Call this during server startup.
 */
export async function initCouponRateLimiter() {
  if (!process.env.REDIS_URL) {
    console.warn('[couponRateLimiter] REDIS_URL not set — rate limiting disabled');
    return;
  }

  try {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => {
      console.error('[couponRateLimiter] Redis error:', err);
      redisClient = null; // graceful degradation
    });
    await redisClient.connect();
    console.log('[couponRateLimiter] Redis connected');
  } catch (error) {
    console.error('[couponRateLimiter] Failed to initialize Redis:', error);
    redisClient = null; // graceful degradation
  }
}

/**
 * Middleware: Coupon Validation Rate Limiter
 * Uses Redis sliding window to track validation attempts per userId.
 * Limit: 10 validations per 60 seconds.
 * Prevents coupon code enumeration at scale.
 * If Redis is unavailable, logs warning and allows the validation (graceful degradation).
 */
export const couponRateLimiter = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // If Redis is not available, gracefully allow the validation
    if (!redisClient || !redisClient.isOpen) {
      console.warn('[couponRateLimiter] Redis unavailable — allowing validation (graceful degradation)');
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowMs = 60 * 1000; // 60 seconds
    const maxValidations = 10;
    const redisKey = `coupon-validate:${userId}`;

    // Fetch all validation timestamps for this user in the last 60 seconds
    const validationTimestamps = await redisClient.zRangeByScore(redisKey, String(now - windowMs), String(now));

    if (validationTimestamps.length >= maxValidations) {
      return res.status(429).json({
        message: 'Too many validation attempts. Please wait before trying again.'
      });
    }

    // Record this validation timestamp
    await redisClient.zAdd(redisKey, { score: now, value: `${now}-${Math.random()}` });

    // Set expiration on the key (90 seconds to be safe)
    await redisClient.expire(redisKey, 90);

    next();
  } catch (error) {
    console.error('[couponRateLimiter] Error checking coupon validation rate limit:', error);
    console.warn('[couponRateLimiter] Allowing validation due to rate limiter error (graceful degradation)');
    // Allow the validation on error (graceful degradation)
    next();
  }
};
