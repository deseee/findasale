/**
 * aiTagsQuotaTracker.ts — Monthly AI tag quota enforcement per organizer
 *
 * Tracks AI tag usage per organizer and enforces monthly quotas:
 * - SIMPLE: 100 tags/month
 * - PRO: 2000 tags/month
 * - TEAMS: 2000 tags/month (unlimited in practice via high limit)
 *
 * Uses hybrid approach: in-memory cache for speed + DB persistence for durability.
 * Monthly counters reset at the start of each calendar month.
 */

import { prisma } from './prisma';
import { TIER_LIMITS, SubscriptionTier } from '../constants/tierLimits';

interface QuotaRecord {
  organizerId: string;
  tagsUsed: number;
  monthStart: Date; // Start of current calendar month
}

// In-memory cache: organizerId → QuotaRecord
const quotaCache = new Map<string, QuotaRecord>();

/**
 * Get the start of the current calendar month (midnight UTC on the 1st)
 */
function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Get or refresh quota record for organizer from DB
 */
async function getOrRefreshQuota(
  organizerId: string
): Promise<QuotaRecord> {
  const monthStart = getMonthStart();

  // Check cache first
  const cached = quotaCache.get(organizerId);
  if (cached && cached.monthStart.getTime() === monthStart.getTime()) {
    return cached;
  }

  // Load from DB and update cache
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: {
      aiTagsUsedThisMonth: true,
      aiTagsResetAt: true,
    },
  });

  if (!organizer) {
    throw new Error(`Organizer ${organizerId} not found`);
  }

  // If DB counter is from a previous month, reset it
  const dbResetAt = organizer.aiTagsResetAt ? new Date(organizer.aiTagsResetAt) : null;
  let tagsUsed = organizer.aiTagsUsedThisMonth || 0;

  if (!dbResetAt || dbResetAt < monthStart) {
    // Reset the counter in DB
    await prisma.organizer.update({
      where: { id: organizerId },
      data: {
        aiTagsUsedThisMonth: 0,
        aiTagsResetAt: monthStart,
      },
    });
    tagsUsed = 0;
  }

  const record: QuotaRecord = {
    organizerId,
    tagsUsed,
    monthStart,
  };

  quotaCache.set(organizerId, record);
  return record;
}

/**
 * Check if organizer has exceeded their monthly AI tag quota
 * Returns { exceeded: boolean, used: number, limit: number, remaining: number }
 */
export async function checkAiTagQuota(
  organizerId: string,
  tier: SubscriptionTier
): Promise<{
  exceeded: boolean;
  used: number;
  limit: number;
  remaining: number;
}> {
  const record = await getOrRefreshQuota(organizerId);
  const limit = TIER_LIMITS[tier].aiTagsPerMonth;
  const remaining = Math.max(0, limit - record.tagsUsed);

  return {
    exceeded: record.tagsUsed >= limit,
    used: record.tagsUsed,
    limit,
    remaining,
  };
}

/**
 * Increment AI tag counter for organizer
 * Should be called AFTER successful AI analysis
 * Returns updated count
 */
export async function incrementAiTagCount(
  organizerId: string,
  tagCount: number = 1
): Promise<number> {
  const record = await getOrRefreshQuota(organizerId);

  // Update cache
  record.tagsUsed += tagCount;

  // Update DB
  const updated = await prisma.organizer.update({
    where: { id: organizerId },
    data: {
      aiTagsUsedThisMonth: {
        increment: tagCount,
      },
    },
    select: {
      aiTagsUsedThisMonth: true,
    },
  });

  return updated.aiTagsUsedThisMonth || 0;
}

/**
 * Reset quota for an organizer (admin use, e.g., manual month override)
 */
export async function resetAiTagQuota(organizerId: string): Promise<void> {
  const monthStart = getMonthStart();

  await prisma.organizer.update({
    where: { id: organizerId },
    data: {
      aiTagsUsedThisMonth: 0,
      aiTagsResetAt: monthStart,
    },
  });

  // Clear cache
  quotaCache.delete(organizerId);
  console.log(`[AI Tags Quota] Reset for organizer ${organizerId}`);
}

/**
 * Prune old cache entries (keep only ~100 most recent)
 * Call periodically to prevent unbounded memory growth
 */
export function pruneQuotaCache(): void {
  if (quotaCache.size > 200) {
    // Delete oldest 50% entries by replacing with fresh map
    const entries = Array.from(quotaCache.entries());
    const toKeep = entries.slice(Math.floor(entries.length / 2));
    quotaCache.clear();
    toKeep.forEach(([id, record]) => quotaCache.set(id, record));
  }
}
