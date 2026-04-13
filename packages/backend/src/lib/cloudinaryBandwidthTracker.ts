/**
 * cloudinaryBandwidthTracker.ts — #105 Cloudinary Bandwidth Monitoring + Alerts
 *
 * Tracks daily image serve counts and estimates bandwidth usage.
 * Alerts when approaching 80% of Cloudinary free tier limit (25 GB).
 *
 * Key format: cloudinary:serves:YYYY-MM-DD (resets daily)
 * Assumes average image size: 200 KB (configurable via CLOUDINARY_AVG_IMAGE_SIZE_KB)
 *
 * Free tier limit: 25 GB/month
 * 80% threshold: 20 GB (~102,400 images at 200KB average)
 */

const CLOUDINARY_FREE_TIER_GB = 25;
const BANDWIDTH_THRESHOLD_PCT = 0.8; // Alert at 80% usage
const CLOUDINARY_AVG_IMAGE_SIZE_KB = parseInt(process.env.CLOUDINARY_AVG_IMAGE_SIZE_KB || '200');

interface BandwidthRecord {
  dateKey: string;
  serveCount: number;
  estimatedBandwidthGB: number;
  lastUpdated: Date;
}

// In-memory store for daily serve counts
const dailyBandwidthStore = new Map<string, BandwidthRecord>();

/**
 * Generate current date key (YYYY-MM-DD)
 */
function getDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Generate current month key (YYYY-MM)
 */
function getMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get or initialize bandwidth record for the current day
 */
function getDayRecord(): BandwidthRecord {
  const dateKey = getDateKey();
  if (!dailyBandwidthStore.has(dateKey)) {
    dailyBandwidthStore.set(dateKey, {
      dateKey,
      serveCount: 0,
      estimatedBandwidthGB: 0,
      lastUpdated: new Date(),
    });
  }
  return dailyBandwidthStore.get(dateKey)!;
}

/**
 * Increment serve count for current day
 * Called when a Cloudinary URL is generated/served
 *
 * @returns true if under threshold, false if threshold exceeded
 */
export function trackCloudinaryServe(): boolean {
  const record = getDayRecord();
  record.serveCount += 1;
  record.estimatedBandwidthGB = (record.serveCount * CLOUDINARY_AVG_IMAGE_SIZE_KB) / (1024 * 1024);
  record.lastUpdated = new Date();

  // Check monthly threshold (rough estimate: daily sum for month)
  const monthlyEstimate = getMonthlyCloudinaryEstimate();
  const thresholdGB = CLOUDINARY_FREE_TIER_GB * BANDWIDTH_THRESHOLD_PCT;

  if (monthlyEstimate.estimatedBandwidthGB >= thresholdGB) {
    console.warn(
      `[CLOUDINARY_BANDWIDTH_WARNING] Current month estimated bandwidth: ${monthlyEstimate.estimatedBandwidthGB.toFixed(2)} GB of ${CLOUDINARY_FREE_TIER_GB} GB (${(monthlyEstimate.estimatedBandwidthGB / CLOUDINARY_FREE_TIER_GB * 100).toFixed(1)}% used). Daily serves: ${record.serveCount}`
    );
    return false;
  }

  return true;
}

/**
 * Get today's Cloudinary serve count and estimated bandwidth
 */
export function getTodayCloudinaryUsage(): { dateKey: string; serveCount: number; estimatedBandwidthGB: number } {
  const record = getDayRecord();
  return {
    dateKey: record.dateKey,
    serveCount: record.serveCount,
    estimatedBandwidthGB: record.estimatedBandwidthGB,
  };
}

/**
 * Estimate current month's bandwidth based on daily records
 * Sums all days of the current month
 */
export function getMonthlyCloudinaryEstimate(): { monthKey: string; serveCount: number; estimatedBandwidthGB: number } {
  const monthKey = getMonthKey();
  let totalServes = 0;

  // Sum serves from all days in current month
  for (const [dateKey, record] of dailyBandwidthStore.entries()) {
    if (dateKey.startsWith(monthKey)) {
      totalServes += record.serveCount;
    }
  }

  const estimatedBandwidthGB = (totalServes * CLOUDINARY_AVG_IMAGE_SIZE_KB) / (1024 * 1024);
  return {
    monthKey,
    serveCount: totalServes,
    estimatedBandwidthGB,
  };
}

/**
 * Get bandwidth threshold (80% of free tier)
 */
export function getBandwidthThreshold(): { limitGB: number; thresholdGB: number; thresholdPct: number } {
  return {
    limitGB: CLOUDINARY_FREE_TIER_GB,
    thresholdGB: CLOUDINARY_FREE_TIER_GB * BANDWIDTH_THRESHOLD_PCT,
    thresholdPct: BANDWIDTH_THRESHOLD_PCT * 100,
  };
}

/**
 * Reset current day's serve count (admin use only)
 */
export function resetTodayCloudinaryUsage(): void {
  const dateKey = getDateKey();
  dailyBandwidthStore.delete(dateKey);
  console.log(`[Cloudinary Tracker] Reset serve count for day ${dateKey}`);
}

/**
 * Clean up old day records (keep last 90 days only)
 * Call this periodically to prevent memory buildup
 */
export function pruneOldBandwidthRecords(): void {
  const now = new Date();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  for (const [dateKey] of dailyBandwidthStore.entries()) {
    // Parse dateKey (YYYY-MM-DD format)
    const [year, month, day] = dateKey.split('-').map(Number);
    const recordDate = new Date(year, month - 1, day);

    if (recordDate < ninetyDaysAgo) {
      dailyBandwidthStore.delete(dateKey);
    }
  }
}
