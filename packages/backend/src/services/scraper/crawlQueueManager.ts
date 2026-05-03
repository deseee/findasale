/**
 * DirectoryCrawlQueueManager
 * Manages the crawl queue for directory sources: GooglePlaces, HERE, Foursquare, OSMOverpass
 * 
 * Handles:
 * - Queue item selection with backoff/saturation logic
 * - Recording crawl success/failure with backoff multiplier updates
 * - Monthly budget resets
 * - Queue seeding for new metros/sub-areas
 */

import { DirectoryCrawlQueue, DirectoryCrawlLog, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export interface SeedEntry {
  metro: string;
  subArea?: string;
  country?: string;
  province?: string;
  sourceName: string;
  queryType: string;
  locale?: string;
  requestsBudgetMax?: number;
  priority?: number;
}

/**
 * Get the next batch of crawl items ready to run
 * - Excludes paused items (isPaused=false required)
 * - Filters by nextRunAt <= now
 * - Orders by priority DESC, nextRunAt ASC
 * - Excludes saturated items unless no non-saturated items are ready
 */
export async function getNextCrawlsToRun(limit: number): Promise<DirectoryCrawlQueue[]> {
  const now = new Date();

  // First, try to get non-saturated items ready to run
  const nonSaturated = await prisma.directoryCrawlQueue.findMany({
    where: {
      isPaused: false,
      isSaturated: false,
      nextRunAt: { lte: now },
    },
    orderBy: [
      { priority: 'desc' },
      { nextRunAt: 'asc' },
    ],
    take: limit,
  });

  // If we got enough non-saturated items, return them
  if (nonSaturated.length >= limit) {
    return nonSaturated;
  }

  // Otherwise, fill remaining slots with saturated items if available
  const remaining = limit - nonSaturated.length;
  const saturated = await prisma.directoryCrawlQueue.findMany({
    where: {
      isPaused: false,
      isSaturated: true,
      nextRunAt: { lte: now },
    },
    orderBy: [
      { priority: 'desc' },
      { nextRunAt: 'asc' },
    ],
    take: remaining,
  });

  return [...nonSaturated, ...saturated];
}

/**
 * Record a successful crawl run
 * - Updates lastRunAt, lastResultCount, requestsUsedThisPeriod
 * - Resets consecutiveErrors and consecutiveZeroRuns (unless resultCount=0)
 * - If resultCount=0, increments consecutiveZeroRuns; if >=3, pauses with ZERO_RESULTS
 * - If resultCount>=60, marks isSaturated=true
 * - Calculates nextRunAt using backoffMultiplier
 * - Creates DirectoryCrawlLog record
 */
export async function recordCrawlSuccess(
  id: string,
  resultCount: number,
  baseIntervalMs: number = 86400000 // 24 hours default
): Promise<void> {
  const now = new Date();
  const queue = await prisma.directoryCrawlQueue.findUniqueOrThrow({
    where: { id },
  });

  // Determine if this is a zero-result run
  const isZeroRun = resultCount === 0;
  let newConsecutiveZeroRuns = isZeroRun ? queue.consecutiveZeroRuns + 1 : 0;
  let newIsPaused = queue.isPaused;
  let newPauseReason = queue.pauseReason;

  // If 3+ consecutive zero runs, auto-pause
  if (newConsecutiveZeroRuns >= 3) {
    newIsPaused = true;
    newPauseReason = 'ZERO_RESULTS';
  }

  // Check if saturated (60+ results = API cap hit)
  const newIsSaturated = resultCount >= 60;

  // Calculate nextRunAt with backoff
  const nextRunAt = new Date(now.getTime() + baseIntervalMs * queue.backoffMultiplier);

  // Update queue
  await prisma.directoryCrawlQueue.update({
    where: { id },
    data: {
      lastRunAt: now,
      lastResultCount: resultCount,
      requestsUsedThisPeriod: queue.requestsUsedThisPeriod + 1,
      consecutiveErrors: 0, // Reset on success
      consecutiveZeroRuns: newConsecutiveZeroRuns,
      isPaused: newIsPaused,
      pauseReason: newPauseReason,
      isSaturated: newIsSaturated,
      nextRunAt,
    },
  });

  // Create audit log
  await prisma.directoryCrawlLog.create({
    data: {
      queueId: id,
      runAt: now,
      sourceName: queue.sourceName,
      metro: queue.metro,
      subArea: queue.subArea || null,
      queryType: queue.queryType,
      resultCount,
      newOrganizersCreated: 0, // Populated by scraper on ingest
      organizersUpdated: 0,
      duplicatesSkipped: 0,
      errorMessage: null,
    },
  });
}

/**
 * Record a failed crawl run
 * - Increments consecutiveErrors
 * - Applies exponential backoff: backoffMultiplier = min(backoffMultiplier * 2, 32.0)
 * - Sets nextRunAt = now + (baseInterval × backoffMultiplier)
 * - If >=3 consecutive errors, pauses with ERROR reason
 * - Updates lastError
 * - Creates DirectoryCrawlLog record with errorMessage
 */
export async function recordCrawlFailure(
  id: string,
  errorMessage: string,
  baseIntervalMs: number = 86400000 // 24 hours default
): Promise<void> {
  const now = new Date();
  const queue = await prisma.directoryCrawlQueue.findUniqueOrThrow({
    where: { id },
  });

  const newConsecutiveErrors = queue.consecutiveErrors + 1;
  let newBackoffMultiplier = Math.min(queue.backoffMultiplier * 2, 32.0);
  let newIsPaused = queue.isPaused;
  let newPauseReason = queue.pauseReason;

  // If 3+ consecutive errors, auto-pause
  if (newConsecutiveErrors >= 3) {
    newIsPaused = true;
    newPauseReason = 'ERROR';
  }

  const nextRunAt = new Date(now.getTime() + baseIntervalMs * newBackoffMultiplier);

  // Update queue
  await prisma.directoryCrawlQueue.update({
    where: { id },
    data: {
      consecutiveErrors: newConsecutiveErrors,
      backoffMultiplier: newBackoffMultiplier,
      lastError: errorMessage,
      isPaused: newIsPaused,
      pauseReason: newPauseReason,
      nextRunAt,
    },
  });

  // Create audit log with error details
  await prisma.directoryCrawlLog.create({
    data: {
      queueId: id,
      runAt: now,
      sourceName: queue.sourceName,
      metro: queue.metro,
      subArea: queue.subArea || null,
      queryType: queue.queryType,
      resultCount: 0,
      errorMessage,
    },
  });
}

/**
 * Reset monthly budget counters (call on 1st of month via cron)
 * - For all queues where budgetMonthYear != current month, reset requestsUsedThisPeriod=0
 * - Update budgetMonthYear to current month
 */
export async function resetMonthlyBudgets(): Promise<void> {
  const now = new Date();
  const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  await prisma.directoryCrawlQueue.updateMany({
    where: {
      NOT: {
        budgetMonthYear: currentMonthYear,
      },
    },
    data: {
      requestsUsedThisPeriod: 0,
      budgetMonthYear: currentMonthYear,
    },
  });
}

/**
 * Seed or upsert queue entries
 * - Upserts by unique constraint (metro, subArea, sourceName, queryType)
 * - Does NOT overwrite existing rows if already present
 * - Used for initial metro/sub-area setup
 */
export async function seedQueue(entries: SeedEntry[]): Promise<void> {
  const now = new Date();
  const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  for (const entry of entries) {
    await prisma.directoryCrawlQueue.upsert({
      where: {
        metro_subArea_sourceName_queryType: {
          metro: entry.metro,
          subArea: entry.subArea || null,
          sourceName: entry.sourceName,
          queryType: entry.queryType,
        },
      },
      update: {}, // Don't overwrite if exists
      create: {
        metro: entry.metro,
        subArea: entry.subArea || null,
        country: entry.country || 'US',
        province: entry.province || null,
        sourceName: entry.sourceName,
        queryType: entry.queryType,
        locale: entry.locale || 'en',
        nextRunAt: now, // Seed for immediate run
        budgetMonthYear: currentMonthYear,
        requestsBudgetMax: entry.requestsBudgetMax || 5000,
        priority: entry.priority || 50,
      },
    });
  }
}
