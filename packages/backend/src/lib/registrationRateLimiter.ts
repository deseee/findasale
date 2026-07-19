/**
 * registrationRateLimiter.ts — IP-based rate limiting for /register endpoint
 *
 * Tracks registration attempts per IP address and enforces a limit of 5 registrations per hour.
 * Backed by the shared Redis client (see lib/redis.ts) so the counter survives process restarts
 * and redeploys. Previously this used an in-memory Map that reset on every deploy, silently
 * allowing ~120 accounts/day from one IP across redeploys (P0 fix, 2026-07-18). Reuses the same
 * Redis client/graceful-fallback pattern as aiCostTracker.ts — no new Redis dependency added.
 *
 * Storage: one key per IP (`regratelimit:<ip>`) holding a JSON array of attempt timestamps
 * (ms epoch) within the current sliding 1-hour window, with a matching Redis TTL.
 *
 * Prevents automated account creation abuse and protects against bulk burner email attacks.
 */

import { redis } from './redis';

// Configuration
const MAX_REGISTRATIONS_PER_HOUR = 5;
const WINDOW_SIZE_MS = 60 * 60 * 1000; // 1 hour in milliseconds
const WINDOW_SIZE_SECONDS = WINDOW_SIZE_MS / 1000;

function getKey(ip: string): string {
  return `regratelimit:${ip}`;
}

/**
 * Read the stored attempt timestamps for an IP and filter out anything outside the current
 * sliding window. Fails open (returns []) on a Redis read/parse error — consistent with the
 * fail-open posture used elsewhere in this codebase (e.g. aiCostTracker.ts) so a transient
 * Redis blip never hard-blocks legitimate registrations.
 */
async function getWindowTimestamps(ip: string): Promise<number[]> {
  const key = getKey(ip);
  const now = Date.now();
  let timestamps: number[] = [];
  try {
    const raw = await redis.get(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) timestamps = parsed;
    }
  } catch (err) {
    console.error(
      '[registrationRateLimiter] Failed to read/parse Redis record — treating as empty:',
      (err as Error)?.message || err
    );
    timestamps = [];
  }
  return timestamps.filter((ts) => typeof ts === 'number' && now - ts < WINDOW_SIZE_MS);
}

/**
 * Check if an IP has exceeded the registration rate limit.
 * Returns { limited: boolean, count: number, limit: number, resetAt: Date }
 */
export async function checkRegistrationLimit(ip: string): Promise<{
  limited: boolean;
  count: number;
  limit: number;
  resetAt: Date;
}> {
  const timestamps = await getWindowTimestamps(ip);
  const count = timestamps.length;
  // resetAt: when the oldest attempt in the current window falls out of it. If there are no
  // attempts yet, report a full window from now (matches prior in-memory behavior).
  const resetAt = count > 0
    ? new Date(Math.min(...timestamps) + WINDOW_SIZE_MS)
    : new Date(Date.now() + WINDOW_SIZE_MS);

  return {
    limited: count >= MAX_REGISTRATIONS_PER_HOUR,
    count,
    limit: MAX_REGISTRATIONS_PER_HOUR,
    resetAt,
  };
}

/**
 * Record a registration attempt from an IP.
 * Should be called AFTER successful user creation.
 */
export async function recordRegistration(ip: string): Promise<void> {
  const key = getKey(ip);
  const timestamps = await getWindowTimestamps(ip);
  timestamps.push(Date.now());

  try {
    await redis.setex(key, WINDOW_SIZE_SECONDS, JSON.stringify(timestamps));
  } catch (err) {
    console.error(
      '[registrationRateLimiter] Failed to persist Redis record:',
      (err as Error)?.message || err
    );
  }

  if (timestamps.length > MAX_REGISTRATIONS_PER_HOUR) {
    console.warn(
      `[REGISTRATION_RATE_LIMIT] IP ${ip} exceeded registration limit (${timestamps.length} attempts in 1 hour)`
    );
  }
}

/**
 * Reset rate limit for an IP (admin use only)
 */
export async function resetIpLimit(ip: string): Promise<void> {
  try {
    await redis.del(getKey(ip));
    console.log(`[Registration Rate Limiter] Reset limit for IP ${ip}`);
  } catch (err) {
    console.error('[registrationRateLimiter] Failed to reset limit:', (err as Error)?.message || err);
  }
}

/**
 * No-op: Redis TTL (1 hour, refreshed on each write) handles cleanup automatically.
 * Kept for backward compatibility with any existing callers/cron references.
 */
export function pruneOldRecords(): void {
  // Redis TTL handles expiry — no manual cleanup needed.
}
