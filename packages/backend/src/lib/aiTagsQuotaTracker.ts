/**
 * aiTagsQuotaTracker.ts — Monthly AI tag quota enforcement per organizer
 *
 * Tracks AI tag usage per organizer and enforces monthly quotas:
 * - SIMPLE: 100 tags/month
 * - PRO: 2000 tags/month
 * - TEAMS: unlimited (Infinity)
 *
 * Source of truth is Organizer.aiTagsUsedThisMonth / aiTagsResetAt in the database. Enforcement is
 * ATOMIC and never relies on a per-process cache (2026-09-29 hardening):
 *
 *   reserveAiTags()  -> one conditional UPDATE ("used = used + n WHERE used <= limit - n"). Postgres
 *                       re-evaluates the predicate under the row lock, so N parallel requests (or N
 *                       Railway instances) can never collectively pass more than the limit.
 *   refundAiTags()   -> hands back the unused part of a reservation when the paid call fails/skips.
 *   checkAiTagQuota()-> read-only status straight from the DB (used for 429 bodies / capture hints).
 *
 * The in-memory quotaCache is a short-TTL DISPLAY cache only (getCachedAiTagQuotaForDisplay); it is
 * never consulted for an allow/deny decision.
 *
 * Monthly counters reset lazily at the start of each calendar month (UTC) with a guarded
 * updateMany so two concurrent first-requests-of-the-month cannot both reset (and lose usage).
 */

import { prisma } from './prisma';
import { TIER_LIMITS, SubscriptionTier } from '../constants/tierLimits';

interface QuotaRecord {
  organizerId: string;
  tagsUsed: number;
  monthStart: Date; // Start of current calendar month
  cachedAt?: number; // ms epoch, display cache TTL
}

// In-memory DISPLAY cache: organizerId → QuotaRecord. Never used to enforce a limit.
const quotaCache = new Map<string, QuotaRecord>();
const DISPLAY_CACHE_TTL_MS = 15_000;

/**
 * Get the start of the current calendar month (midnight UTC on the 1st)
 */
function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Organizer.subscriptionTier is the entitlement truth; unknown values degrade to SIMPLE. */
export function normalizeTier(rawTier: unknown): SubscriptionTier {
  return typeof rawTier === 'string' && Object.prototype.hasOwnProperty.call(TIER_LIMITS, rawTier)
    ? (rawTier as SubscriptionTier)
    : 'SIMPLE';
}

function clampUnits(units: number): number {
  return Number.isFinite(units) ? Math.max(1, Math.floor(units)) : 1;
}

/**
 * Guarded lazy monthly reset. Only the request that finds a stale (or null) resetAt performs it;
 * a concurrent request sees count 0 and does nothing, so usage recorded after the reset is never wiped.
 */
async function ensureMonthlyReset(organizerId: string, monthStart: Date): Promise<void> {
  await prisma.organizer.updateMany({
    where: {
      id: organizerId,
      OR: [{ aiTagsResetAt: null }, { aiTagsResetAt: { lt: monthStart } }],
    },
    data: { aiTagsUsedThisMonth: 0, aiTagsResetAt: monthStart },
  });
}

/** Fresh read of the organizer's counter (after the guarded reset). Throws when the organizer is missing. */
async function readUsedFromDb(organizerId: string): Promise<number> {
  const monthStart = getMonthStart();
  await ensureMonthlyReset(organizerId, monthStart);
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { aiTagsUsedThisMonth: true },
  });
  if (!organizer) {
    throw new Error(`Organizer ${organizerId} not found`);
  }
  return organizer.aiTagsUsedThisMonth || 0;
}

export interface AiTagQuotaStatus {
  exceeded: boolean;
  used: number;
  limit: number;
  remaining: number;
}

function statusFor(used: number, tier: SubscriptionTier): AiTagQuotaStatus {
  const limit = TIER_LIMITS[normalizeTier(tier)].aiTagsPerMonth;
  return {
    exceeded: used >= limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}

/**
 * Read-only quota status from the database (never from a cache).
 * Returns { exceeded: boolean, used: number, limit: number, remaining: number }.
 * This is informational: the atomic gate is reserveAiTags().
 */
export async function checkAiTagQuota(
  organizerId: string,
  tier: SubscriptionTier
): Promise<AiTagQuotaStatus> {
  const used = await readUsedFromDb(organizerId);
  quotaCache.set(organizerId, { organizerId, tagsUsed: used, monthStart: getMonthStart(), cachedAt: Date.now() });
  return statusFor(used, tier);
}

/**
 * Display-only variant with a short TTL cache (a UI badge may be a few seconds stale; an enforcement
 * decision must never be). Falls back to a fresh DB read on a miss.
 */
export async function getCachedAiTagQuotaForDisplay(
  organizerId: string,
  tier: SubscriptionTier
): Promise<AiTagQuotaStatus> {
  const monthStart = getMonthStart();
  const cached = quotaCache.get(organizerId);
  if (
    cached &&
    cached.cachedAt !== undefined &&
    Date.now() - cached.cachedAt < DISPLAY_CACHE_TTL_MS &&
    cached.monthStart.getTime() === monthStart.getTime()
  ) {
    return statusFor(cached.tagsUsed, tier);
  }
  return checkAiTagQuota(organizerId, tier);
}

export interface ReserveResult {
  /** True when `units` were atomically reserved (the caller now owns them and must settle/refund). */
  ok: boolean;
  /** Units held by this reservation (0 when !ok). */
  reserved: number;
  used?: number;
  limit: number;
  remaining?: number;
  exceeded?: boolean;
}

/**
 * ATOMIC reserve-then-refund gate. Reserves `units` Smart tags for the organizer in one conditional
 * UPDATE; returns ok:false (nothing reserved) when fewer than `units` remain this month.
 * Unlimited tiers (Infinity) always succeed but are still counted for usage accounting.
 */
export async function reserveAiTags(
  organizerId: string,
  tier: SubscriptionTier,
  units: number = 1
): Promise<ReserveResult> {
  const n = clampUnits(units);
  const limit = TIER_LIMITS[normalizeTier(tier)].aiTagsPerMonth;
  const monthStart = getMonthStart();
  await ensureMonthlyReset(organizerId, monthStart);

  let ok = false;
  if (Number.isFinite(limit)) {
    const res = await prisma.organizer.updateMany({
      where: { id: organizerId, aiTagsUsedThisMonth: { lte: limit - n } },
      data: { aiTagsUsedThisMonth: { increment: n } },
    });
    ok = res.count === 1;
  } else {
    const res = await prisma.organizer.updateMany({
      where: { id: organizerId },
      data: { aiTagsUsedThisMonth: { increment: n } },
    });
    ok = res.count === 1;
  }

  quotaCache.delete(organizerId);
  if (ok) {
    return { ok: true, reserved: n, limit };
  }

  // Denied (or organizer missing): report the real numbers for the 429 body.
  const used = await readUsedFromDb(organizerId);
  return {
    ok: false,
    reserved: 0,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    exceeded: used >= limit,
  };
}

/**
 * Give back `units` previously reserved with reserveAiTags() (paid call failed, was skipped, or used
 * fewer photos than reserved). Never drives the counter below zero and never touches a counter that
 * has already rolled into a new month. Returns the number of rows refunded (0 or 1).
 */
export async function refundAiTags(organizerId: string, units: number = 1): Promise<number> {
  if (!Number.isFinite(units) || units <= 0) return 0;
  const n = Math.floor(units);
  if (n <= 0) return 0;
  const res = await prisma.organizer.updateMany({
    where: {
      id: organizerId,
      aiTagsUsedThisMonth: { gte: n },
      aiTagsResetAt: { gte: getMonthStart() },
    },
    data: { aiTagsUsedThisMonth: { decrement: n } },
  });
  quotaCache.delete(organizerId);
  return res.count;
}

/**
 * Increment AI tag counter for organizer (legacy post-hoc metering used by routes that check first
 * and count after; new paid routes use reserveAiTags/refundAiTags instead).
 * The increment is a single atomic DB update; no cache is involved.
 * Returns updated count
 */
export async function incrementAiTagCount(
  organizerId: string,
  tagCount: number = 1
): Promise<number> {
  await ensureMonthlyReset(organizerId, getMonthStart());

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

  quotaCache.delete(organizerId);
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
