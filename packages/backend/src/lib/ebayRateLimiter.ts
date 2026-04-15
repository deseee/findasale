/**
 * ebayRateLimiter.ts — Daily eBay API rate limiter
 *
 * Tracks daily eBay Trading API call count and enforces a soft cap.
 * eBay hard limit is 5,000 calls/day; we cap at 4,500 by default to provide safety margin.
 *
 * Uses in-memory storage (compatible with aiCostTracker.ts pattern).
 * Date key resets at midnight UTC.
 */

const DAILY_LIMIT = parseInt(process.env.EBAY_API_DAILY_LIMIT || '4500');

interface DayRecord {
  dateKey: string; // YYYY-MM-DD
  callCount: number;
  lastUpdated: Date;
}

// In-memory store for daily call counts
const dailyCallStore = new Map<string, DayRecord>();

/**
 * Generate current date key (YYYY-MM-DD in UTC)
 */
function getDateKey(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get or initialize the call record for today
 */
function getDayRecord(): DayRecord {
  const dateKey = getDateKey();
  if (!dailyCallStore.has(dateKey)) {
    dailyCallStore.set(dateKey, {
      dateKey,
      callCount: 0,
      lastUpdated: new Date(),
    });
  }
  return dailyCallStore.get(dateKey)!;
}

/**
 * Increment eBay API call counter by 1
 * Called after each successful eBay API call
 */
export function trackEbayCall(): void {
  const record = getDayRecord();
  record.callCount += 1;
  record.lastUpdated = new Date();

  if (record.callCount > DAILY_LIMIT) {
    console.warn(
      `[EBAY_RATE_LIMIT_WARNING] Daily eBay API call count (${record.callCount}) exceeds soft cap (${DAILY_LIMIT}). ` +
        `Approaching hard limit of 5,000 calls/day.`
    );
  }
}

/**
 * Get today's eBay API call count
 */
export function getEbayCallCount(): number {
  const record = getDayRecord();
  return record.callCount;
}

/**
 * Check if daily eBay API limit has been reached
 * Returns true if call count >= DAILY_LIMIT
 */
export function isEbayRateLimited(): boolean {
  const record = getDayRecord();
  return record.callCount >= DAILY_LIMIT;
}

/**
 * Get detailed rate limit status
 * Returns object with call count, limit, remaining calls, and limited flag
 */
export function getEbayRateLimitStatus(): {
  callCount: number;
  limit: number;
  remaining: number;
  limited: boolean;
} {
  const record = getDayRecord();
  const remaining = Math.max(0, DAILY_LIMIT - record.callCount);
  return {
    callCount: record.callCount,
    limit: DAILY_LIMIT,
    remaining,
    limited: record.callCount >= DAILY_LIMIT,
  };
}

/**
 * Reset today's call counter (admin use only)
 */
export function resetEbayCallCount(): void {
  const dateKey = getDateKey();
  dailyCallStore.delete(dateKey);
  console.log(`[eBay Rate Limiter] Reset call count for day ${dateKey}`);
}

/**
 * Clean up old day records (keep last 7 days only)
 * Call this periodically to prevent memory buildup
 */
export function pruneOldCallRecords(): void {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  const keysToDelete: string[] = [];

  dailyCallStore.forEach((_record, dateKey) => {
    // Parse dateKey (YYYY-MM-DD format)
    const [year, month, day] = dateKey.split('-').map(Number);
    const recordDate = new Date(Date.UTC(year, month - 1, day));

    if (recordDate < sevenDaysAgo) {
      keysToDelete.push(dateKey);
    }
  });

  keysToDelete.forEach(key => dailyCallStore.delete(key));
}
