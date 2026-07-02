import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

/**
 * Initialize Redis connection for bid rate limiting.
 * Call this during server startup.
 */
export async function initBidRateLimiter() {
  if (!process.env.REDIS_URL) {
    console.warn('[bidRateLimiter] REDIS_URL not set — rate limiting disabled');
    return;
  }

  try {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => {
      // Do NOT null the client here — node-redis auto-reconnects; nulling our
      // reference permanently disables the limiter until a process restart.
      // The middleware guards on client.isReady instead, so it auto-recovers
      // when Redis returns. (Mirrors index.ts rate-limit client pattern.)
      console.error('[bidRateLimiter] Redis error:', err);
    });
    await redisClient.connect();
    console.log('[bidRateLimiter] Redis connected');
  } catch (error) {
    console.error('[bidRateLimiter] Failed to initialize Redis:', error);
    redisClient = null; // graceful degradation
  }
}

/**
 * Middleware: Bid Rate Limiter
 * Uses Redis sliding window to track bid timestamps per userId.
 * Limit: 10 bids per 60 seconds.
 * If Redis is unavailable, logs warning and allows the bid (graceful degradation).
 */
export const bidRateLimiter = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // If Redis is not ready, gracefully allow the bid. Guard on isReady
    // (not isOpen) so a client mid-reconnect is treated as unavailable, and
    // so a later request auto-recovers once Redis is ready again.
    if (!redisClient || !redisClient.isReady) {
      console.warn('[bidRateLimiter] Redis unavailable — allowing bid (graceful degradation)');
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowMs = 60 * 1000; // 60 seconds
    const maxBids = 10;
    const redisKey = `bid:${userId}`;

    // Fetch all bid timestamps for this user in the last 60 seconds
    const bidTimestamps = await redisClient.zRangeByScore(redisKey, String(now - windowMs), String(now));

    if (bidTimestamps.length >= maxBids) {
      return res.status(429).json({
        message: 'Bidding too fast — please slow down'
      });
    }

    // Record this bid timestamp
    await redisClient.zAdd(redisKey, { score: now, value: `${now}-${Math.random()}` });

    // Set expiration on the key (90 seconds to be safe)
    await redisClient.expire(redisKey, 90);

    next();
  } catch (error) {
    console.error('[bidRateLimiter] Error checking bid rate limit:', error);
    console.warn('[bidRateLimiter] Allowing bid due to rate limiter error (graceful degradation)');
    // Allow the bid on error (graceful degradation)
    next();
  }
};
