/**
 * Rate-limit shared infrastructure -- Redis-backed store, IP whitelist, and burst-alert
 * helpers used by index.ts, routes/auth.ts, and middleware/rateLimiter.ts.
 *
 * Extracted from index.ts (2026-08-27, rate-limit hardening pass) so routes/auth.ts and
 * middleware/rateLimiter.ts can reach createRateLimitStore()/isWhitelistedIP() without a
 * circular import back to index.ts. index.ts imports authRoutes (./routes/auth) near the
 * TOP of its file -- had auth.ts imported these from '../index' instead, Node would
 * resolve them as `undefined` at auth.ts's module-load time, because auth.ts's limiters
 * call createRateLimitStore() eagerly at top level (unlike the existing
 * `import { prisma } from '../index'` already in auth.ts, which is only ever dereferenced
 * lazily inside request handlers and so tolerates that circularity). This module has zero
 * dependency on index.ts, so there is no such hazard.
 */

import * as Sentry from '@sentry/node';
import express from 'express';
import { RedisStore } from 'rate-limit-redis';
import { createClient, RedisClientType } from 'redis';

// Feature #106: Initialize Redis client for distributed rate limiting.
// Falls back gracefully to in-memory store if Redis is unavailable.
let redisRateLimitClient: RedisClientType | null = null;
// Deduped health flag so we emit exactly ONE Sentry event per drop (and one per
// recovery), not one per failed request. Sentry FINDASALE-NODEJS-4G (2026-07-02).
let redisRateLimitHealthy = true;
if (process.env.REDIS_URL) {
  try {
    redisRateLimitClient = createClient({ url: process.env.REDIS_URL });
    redisRateLimitClient.on('error', (err) => {
      // Do NOT null the client here — node-redis auto-reconnects; nulling our
      // reference permanently defeats recovery, leaving the limiter dead until a
      // process restart. The store closure guards on isReady instead.
      console.error('[rateLimit] Redis error:', err);
      // Deduped alert: only the first error in a drop fires Sentry (check-then-set is
      // synchronous, no await between, so no interleave). Subsequent errors log only.
      if (redisRateLimitHealthy) {
        redisRateLimitHealthy = false;
        try {
          Sentry.captureMessage(
            `[rateLimit] Redis connection lost — rate limiting failing open to in-memory (${err instanceof Error ? err.message : String(err)})`,
            'error'
          );
        } catch (_sentryErr) {
          // Sentry not ready — continue
        }
      }
    });
    // Recovery alert: fire once when the client becomes ready again after a drop.
    redisRateLimitClient.on('ready', () => {
      if (!redisRateLimitHealthy) {
        redisRateLimitHealthy = true;
        console.log('[rateLimit] Redis reconnected — distributed limiting restored');
        try {
          Sentry.captureMessage(
            '[rateLimit] Redis reconnected — distributed limiting restored',
            'info'
          );
        } catch (_sentryErr) {
          // Sentry not ready — continue
        }
      }
    });
    redisRateLimitClient.connect().catch((err) => {
      console.error('[rateLimit] Failed to connect to Redis:', err);
      redisRateLimitClient = null;
    });
  } catch (error) {
    console.error('[rateLimit] Failed to initialize Redis client:', error);
    redisRateLimitClient = null;
  }
}

// Build store config for rate limiters.
export const createRateLimitStore = () => {
  // Guard on isReady (not isOpen): rate-limit-redis runs a SCRIPT LOAD inside the
  // RedisStore constructor; when the client is isOpen-but-not-isReady at boot, the
  // guarded sendCommand closure's Promise.reject becomes an unhandled rejection
  // (Sentry FINDASALE-NODEJS-4G). isReady means the store is only built when Redis can
  // actually serve — otherwise this returns undefined → in-memory fallback (documented).
  if (redisRateLimitClient && redisRateLimitClient.isReady) {
    return new RedisStore({
      sendCommand: (...args: string[]) => {
        const c = redisRateLimitClient;
        if (!c || !c.isReady) return Promise.reject(new Error('redis-unavailable'));
        return c.sendCommand(args);
      },
    });
  }
  return undefined; // Falls back to default in-memory store
};

// Fail-open wrapper: if the rate-limit store errors (e.g. Redis drop mid-life),
// proceed instead of 500ing. Over-limit still returns 429 (express-rate-limit
// sends it itself and never calls this callback). Incident: Sentry
// FINDASALE-NODEJS-4F (2026-07-02) — the RedisStore closure NPE'd on a Redis drop
// and 500'd every rate-limited request; store now fails open + the client
// reference is no longer nulled so Redis-backed limiting self-restores on reconnect.
export const resilientLimiter = (limiter: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => limiter(req, res, (err?: unknown) => {
    if (err) {
      console.error('[rateLimit] store error — failing open:', err instanceof Error ? err.message : err);
      return next();
    }
    next();
  });

// IP whitelist — comma-separated IPs in RATE_LIMIT_WHITELIST_IPS env var bypass all rate
// limits (or, for loginLimiter/registerLimiter specifically, get a materially higher cap
// instead of an unconditional bypass — see routes/auth.ts).
// Usage: set RATE_LIMIT_WHITELIST_IPS=203.0.113.1,203.0.113.2 in Railway environment variables
const RATE_LIMIT_WHITELIST = (process.env.RATE_LIMIT_WHITELIST_IPS || '')
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean);

// P0 fix (2026-08-27, rate-limit hardening Item 0 — found by Hacker review, unrelated to
// the storm this session): this used to also accept `clientIP.endsWith(allowed)` — a
// suffix/substring match, not an exact IP match. A whitelist entry "73.181.9.14" would
// also match a completely different, real attacker IP like "173.181.9.14" that merely
// happens to share the tail. Exact match only now. The codebase only ever configures
// single exact IPs in RATE_LIMIT_WHITELIST_IPS, not CIDR ranges — CIDR matching is
// intentionally out of scope, not requested.
export const isWhitelistedIP = (req: express.Request): boolean => {
  if (RATE_LIMIT_WHITELIST.length === 0) return false;
  const clientIP = req.ip || req.socket?.remoteAddress || '';
  return RATE_LIMIT_WHITELIST.some((allowed) => clientIP === allowed);
};

// --- Sustained-429-burst alerting (rate-limit hardening Item 3) ---
// Fires ONE Sentry message when a given limiter's 429 count exceeds
// BURST_ALERT_THRESHOLD within a rolling BURST_ALERT_WINDOW_MS window, then suppresses
// further alerts from that same counter for BURST_ALERT_COOLDOWN_MS — a long storm
// produces one alert, not hundreds. Mirrors the STRANDED-PAID alert pattern in
// jobs/invoiceExpiryJob.ts (single console + Sentry.captureMessage, wrapped in try/catch
// since Sentry may not be initialized). Call createBurstAlerter(name) ONCE per limiter at
// module scope and invoke the returned function from that limiter's `handler`. Counters
// are per-limiter/in-process — intentionally not unified across limiters (per-limiter is
// sufficient per the approved spec).
const BURST_ALERT_THRESHOLD = 50;
const BURST_ALERT_WINDOW_MS = 60 * 1000;
const BURST_ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const BURST_ALERT_MAX_SNAPSHOT = 10;

export const createBurstAlerter = (limiterName: string) => {
  let windowStart = Date.now();
  let count = 0;
  let cooldownUntil = 0;
  let recent: string[] = [];

  return (req: express.Request): void => {
    const now = Date.now();
    if (now - windowStart > BURST_ALERT_WINDOW_MS) {
      windowStart = now;
      count = 0;
      recent = [];
    }
    count += 1;
    if (recent.length < BURST_ALERT_MAX_SNAPSHOT) {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      const ua = (req.headers['user-agent'] as string) || '';
      recent.push(`${ip} ua="${ua}"`);
    }
    if (count > BURST_ALERT_THRESHOLD && now >= cooldownUntil) {
      cooldownUntil = now + BURST_ALERT_COOLDOWN_MS;
      const msg = `[rateLimit] Sustained 429 burst on ${limiterName}: ${count} rejections in the last ${Math.round(BURST_ALERT_WINDOW_MS / 1000)}s. Recent offenders: ${recent.join(', ') || 'none captured'}`;
      console.error(msg);
      try {
        Sentry.captureMessage(msg, 'error');
      } catch (_sentryErr) {
        // Sentry may not be initialized — silently continue
      }
    }
  };
};
