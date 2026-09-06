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
import jwt from 'jsonwebtoken';
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

// --- Cookie/Bearer session verification for rate-limit tier decisions (2026-09-05) ---
// globalLimiter (index.ts) grants a higher per-window budget to "authenticated" requests, but
// it is registered BEFORE app.use(cookieParser()) in index.ts (cookie-parser sits after the
// raw-body webhook routes + express.json(), and moving it earlier wasn't worth re-auditing that
// ordering for) -- so req.cookies is not populated when this runs. This is the exact same
// constraint Socket.io's handshake auth already solves the same way (lib/socket.ts:48-56): read
// the raw `Cookie` header directly and pull out `accessToken` with a regex, instead of depending
// on cookie-parser having run.
//
// Before this fix, globalLimiter only checked `Authorization: Bearer <token>` for the elevated
// tier -- and did not even verify that token, just that the header started with "Bearer ".
// packages/frontend/lib/api.ts (the web app's only real HTTP client, every browser session) never
// sends that header: it authenticates purely via the httpOnly `accessToken` cookie
// (`withCredentials: true`). Every real logged-in browser session was therefore silently capped
// at the anonymous tier. This helper fixes both: it recognizes the cookie AND actually verifies
// the JWT signature/expiry for both the cookie and Bearer paths (closing the unverified-Bearer
// gap as a side effect, using one real check instead of trusting header shape alone).
//
// Deliberately does NOT do the DB-backed checks `authenticate` (middleware/auth.ts) does --
// tokenVersion, organizerTokenVersion, account suspension. Those need a Prisma round-trip; this
// runs on EVERY request the app receives (rate-limited or not, public or not), so a DB call here
// would meaningfully change this app's per-request cost profile. Proving the request holds a
// token this server actually issued and that hasn't expired is enough for a DoS-tier decision --
// it is not an authorization decision. A revoked-but-unexpired token still gets the higher budget
// here even though `authenticate` would reject it on the actual route; that gap is bounded by the
// token's own short expiry.
export const getVerifiedSessionUserId = (req: express.Request): string | null => {
  // Memoize per-request: express-rate-limit calls both `keyGenerator` and `max` for the same
  // request, and this would otherwise run jwt.verify twice per request.
  const cached = (req as any)._rateLimitVerifiedUserId;
  if (cached !== undefined) return cached;

  const resolve = (): string | null => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return null;

    let token: string | null = null;
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const match = /(?:^|;\s*)accessToken=([^;]+)/.exec(cookieHeader);
      if (match) token = decodeURIComponent(match[1]);
    }
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }
    if (!token) return null;

    try {
      const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as { id?: string };
      return typeof decoded.id === 'string' && decoded.id.length > 0 ? decoded.id : null;
    } catch {
      return null; // expired / malformed / bad signature -- treat as anonymous for rate-limit purposes
    }
  };

  const result = resolve();
  (req as any)._rateLimitVerifiedUserId = result;
  return result;
};

// --- Generic velocity/block helpers (2026-09-06 guest-checkout carding incident) ---
// Thin wrappers around the SAME Redis client the rate limiters above use, for app-level
// abuse-detection logic that isn't an express-rate-limit middleware (e.g.
// services/guestCheckoutVelocityGuard.ts's cross-sale guest-checkout failure/volume
// counters -- see that file's header for the full incident writeup). Same fail-open
// posture as createRateLimitStore(): every function below returns a "do nothing / not
// blocked" result when Redis isn't connected, rather than throwing or blocking a real
// buyer's checkout because Redis had a bad moment. No second Redis connection is opened
// here -- redisRateLimitClient is the one already managed above.

/**
 * Atomically increments `key` and sets its TTL to `windowSeconds` the first time it is
 * created -- a fixed-window counter, not a sliding log; good enough for abuse-threshold
 * detection and far cheaper than a sorted-set sliding window. Returns the new count, or
 * `null` if Redis is unavailable (callers must treat null as "don't block, Redis is down").
 */
export const redisIncrWithWindow = async (key: string, windowSeconds: number): Promise<number | null> => {
  const c = redisRateLimitClient;
  if (!c || !c.isReady) return null;
  try {
    const count = await c.incr(key);
    if (count === 1) {
      await c.expire(key, windowSeconds);
    }
    return count;
  } catch (err) {
    console.error('[rateLimit] redisIncrWithWindow failed — failing open:', err instanceof Error ? err.message : err);
    return null;
  }
};

/** Sets a boolean "blocked" flag for `key` that expires after `ttlSeconds`. Fails open (no-op) if Redis is down. */
export const redisSetBlock = async (key: string, ttlSeconds: number): Promise<void> => {
  const c = redisRateLimitClient;
  if (!c || !c.isReady) return;
  try {
    await c.set(key, '1', { EX: ttlSeconds });
  } catch (err) {
    console.error('[rateLimit] redisSetBlock failed (non-fatal):', err instanceof Error ? err.message : err);
  }
};

/** Returns whether `key`'s block flag is currently set. Fails open (false) if Redis is down. */
export const redisIsBlocked = async (key: string): Promise<boolean> => {
  const c = redisRateLimitClient;
  if (!c || !c.isReady) return false;
  try {
    const exists = await c.exists(key);
    return exists === 1;
  } catch (err) {
    console.error('[rateLimit] redisIsBlocked failed — failing open:', err instanceof Error ? err.message : err);
    return false;
  }
};
