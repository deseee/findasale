/**
 * registrationRateLimiter.ts — IP-based rate limiting for /register endpoint
 *
 * Tracks registration attempts per IP address and enforces a limit of 5 registrations per hour.
 * Uses in-memory storage with hourly sliding windows.
 *
 * Prevents automated account creation abuse and protects against bulk burner email attacks.
 */

interface IpRecord {
  registrations: number[];  // Array of timestamps (milliseconds) of registration attempts in the current window
  windowStart: number;      // When the current hour window started
}

// In-memory store for IP registration tracking
const ipStore = new Map<string, IpRecord>();

// Configuration
const MAX_REGISTRATIONS_PER_HOUR = 5;
const WINDOW_SIZE_MS = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Get or create a record for an IP address
 */
function getOrCreateIpRecord(ip: string): IpRecord {
  if (!ipStore.has(ip)) {
    ipStore.set(ip, {
      registrations: [],
      windowStart: Date.now(),
    });
  }
  return ipStore.get(ip)!;
}

/**
 * Clean up old registration attempts outside the current window
 */
function cleanWindowForIp(record: IpRecord): void {
  const now = Date.now();
  const windowEnd = record.windowStart + WINDOW_SIZE_MS;

  // If current window has expired, reset it
  if (now > windowEnd) {
    record.registrations = [];
    record.windowStart = now;
  } else {
    // Remove timestamps older than the current window
    record.registrations = record.registrations.filter(
      (timestamp) => now - timestamp < WINDOW_SIZE_MS
    );
  }
}

/**
 * Check if an IP has exceeded the registration rate limit
 * Returns { limited: boolean, count: number, limit: number, resetAt: Date }
 */
export function checkRegistrationLimit(ip: string): {
  limited: boolean;
  count: number;
  limit: number;
  resetAt: Date;
} {
  const record = getOrCreateIpRecord(ip);
  cleanWindowForIp(record);

  const count = record.registrations.length;
  const resetAt = new Date(record.windowStart + WINDOW_SIZE_MS);

  return {
    limited: count >= MAX_REGISTRATIONS_PER_HOUR,
    count,
    limit: MAX_REGISTRATIONS_PER_HOUR,
    resetAt,
  };
}

/**
 * Record a registration attempt from an IP
 * Should be called AFTER successful user creation
 */
export function recordRegistration(ip: string): void {
  const record = getOrCreateIpRecord(ip);
  cleanWindowForIp(record);
  record.registrations.push(Date.now());

  if (record.registrations.length > MAX_REGISTRATIONS_PER_HOUR) {
    console.warn(
      `[REGISTRATION_RATE_LIMIT] IP ${ip} exceeded registration limit (${record.registrations.length} attempts in 1 hour)`
    );
  }
}

/**
 * Reset rate limit for an IP (admin use only)
 */
export function resetIpLimit(ip: string): void {
  ipStore.delete(ip);
  console.log(`[Registration Rate Limiter] Reset limit for IP ${ip}`);
}

/**
 * Prune old IP records (keep only last 24 hours of data)
 * Call this periodically to prevent memory buildup
 */
export function pruneOldRecords(): void {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  const ipsToDelete: string[] = [];

  ipStore.forEach((record, ip) => {
    // If window start is older than 24 hours, delete the record
    if (now - record.windowStart > oneDay) {
      ipsToDelete.push(ip);
    }
  });

  ipsToDelete.forEach((ip) => ipStore.delete(ip));
}
