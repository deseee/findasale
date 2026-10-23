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
 *
 * PER-SALE ALLOWANCE (2026-10-23): the optional $9.99 a-la-carte upgrade includes 500 auto tags for that one sale
 * (lib/saleProFeatures.ts). Every entry point takes an optional saleId. When it names a paid ALA_CARTE sale owned by
 * this organizer, the tags come from that sale's SaleAiTagUsage row first (same atomic conditional UPDATE), and only
 * fall back to the monthly allowance once the sale's 500 are used. Any other sale (including the same organizer's other
 * sales) never touches the sale row. If the sale row cannot be read or written (e.g. migration not yet applied), the
 * call falls back to the monthly allowance, which is still metered, so a failure can never grant unmetered tags.
 */

import { prisma } from './prisma';
import { TIER_LIMITS, SubscriptionTier } from '../constants/tierLimits';
import { ALA_CARTE_AI_TAGS_PER_SALE, loadSaleEntitlement, saleHasAlaCarteUpgrade } from './saleProFeatures';

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
  /** Present only when a saleId named a paid a-la-carte sale of this organizer: that sale's own 500-tag allowance. */
  sale?: SaleAiTagAllowance;
}

export interface SaleAiTagAllowance {
  saleId: string;
  used: number;
  limit: number;
  remaining: number;
}

/** Which allowance a reservation came from, so a refund goes back to the same place. */
export type AiTagBucket = 'SALE' | 'MONTHLY';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The saleId when it names a paid a-la-carte sale owned by this organizer, otherwise null. Lookup errors resolve to
 * null (monthly allowance applies, still metered).
 */
async function upgradedSaleIdFor(organizerId: string, saleId: string | null | undefined): Promise<string | null> {
  if (!saleId) return null;
  try {
    const sale = await loadSaleEntitlement(saleId);
    return sale && saleHasAlaCarteUpgrade(sale, { id: organizerId }) ? sale.id : null;
  } catch (err) {
    console.warn('[AI Tags Quota] sale entitlement lookup failed, using the monthly allowance:', errMessage(err));
    return null;
  }
}

/** Atomically take n tags from the sale's 500. False when fewer than n remain or the row cannot be written. */
async function reserveFromSale(saleId: string, n: number): Promise<boolean> {
  try {
    await prisma.saleAiTagUsage.createMany({ data: [{ saleId }], skipDuplicates: true });
    const res = await prisma.saleAiTagUsage.updateMany({
      where: { saleId, tagsUsed: { lte: ALA_CARTE_AI_TAGS_PER_SALE - n } },
      data: { tagsUsed: { increment: n } },
    });
    return res.count === 1;
  } catch (err) {
    console.error(`[AI Tags Quota] per-sale allowance unavailable for sale ${saleId}, using the monthly allowance:`, errMessage(err));
    return false;
  }
}

/** Read the sale's allowance (null when the row cannot be read). */
async function readSaleAllowance(saleId: string): Promise<SaleAiTagAllowance | null> {
  try {
    const row = await prisma.saleAiTagUsage.findUnique({ where: { saleId }, select: { tagsUsed: true } });
    const used = row?.tagsUsed ?? 0;
    return { saleId, used, limit: ALA_CARTE_AI_TAGS_PER_SALE, remaining: Math.max(0, ALA_CARTE_AI_TAGS_PER_SALE - used) };
  } catch (err) {
    console.error(`[AI Tags Quota] per-sale allowance unreadable for sale ${saleId}:`, errMessage(err));
    return null;
  }
}

/**
 * The 500-tag allowance of a paid a-la-carte sale, or null when the sale is not an upgraded sale of this organizer.
 */
export async function getSaleAiTagAllowance(
  organizerId: string,
  saleId: string | null | undefined
): Promise<SaleAiTagAllowance | null> {
  const upgraded = await upgradedSaleIdFor(organizerId, saleId);
  return upgraded ? readSaleAllowance(upgraded) : null;
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
  tier: SubscriptionTier,
  saleId?: string | null
): Promise<AiTagQuotaStatus> {
  const used = await readUsedFromDb(organizerId);
  quotaCache.set(organizerId, { organizerId, tagsUsed: used, monthStart: getMonthStart(), cachedAt: Date.now() });
  const monthly = statusFor(used, tier);
  if (!saleId) return monthly;
  // Items of a paid a-la-carte sale can also draw on that sale's 500 tags.
  const sale = await getSaleAiTagAllowance(organizerId, saleId);
  if (!sale) return monthly;
  return {
    ...monthly,
    exceeded: monthly.exceeded && sale.remaining <= 0,
    remaining: monthly.remaining + sale.remaining,
    sale,
  };
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
  /** Where the units came from: pass this object (or bucket + saleId) to refundAiTags so they go back there. */
  bucket?: AiTagBucket;
  /** The upgraded sale the units came from (bucket 'SALE' only). */
  saleId?: string | null;
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
  units: number = 1,
  saleId?: string | null
): Promise<ReserveResult> {
  const n = clampUnits(units);
  // A paid a-la-carte sale spends its own 500 tags first; any other sale goes straight to the monthly allowance.
  const upgradedSaleId = await upgradedSaleIdFor(organizerId, saleId);
  if (upgradedSaleId && (await reserveFromSale(upgradedSaleId, n))) {
    return { ok: true, reserved: n, limit: ALA_CARTE_AI_TAGS_PER_SALE, bucket: 'SALE', saleId: upgradedSaleId };
  }
  return reserveMonthlyAiTags(organizerId, tier, n);
}

async function reserveMonthlyAiTags(organizerId: string, tier: SubscriptionTier, n: number): Promise<ReserveResult> {
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
    return { ok: true, reserved: n, limit, bucket: 'MONTHLY', saleId: null };
  }

  // Denied (or organizer missing): report the real numbers for the 429 body.
  const used = await readUsedFromDb(organizerId);
  return {
    ok: false,
    reserved: 0,
    bucket: 'MONTHLY',
    saleId: null,
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
export async function refundAiTags(
  organizerId: string,
  units: number = 1,
  from?: { bucket?: AiTagBucket; saleId?: string | null } | null
): Promise<number> {
  if (!Number.isFinite(units) || units <= 0) return 0;
  const n = Math.floor(units);
  if (n <= 0) return 0;
  if (from?.bucket === 'SALE' && from.saleId) {
    // Back to the a-la-carte sale's own allowance (never below zero).
    try {
      const saleRes = await prisma.saleAiTagUsage.updateMany({
        where: { saleId: from.saleId, tagsUsed: { gte: n } },
        data: { tagsUsed: { decrement: n } },
      });
      return saleRes.count;
    } catch (err) {
      console.warn(`[AI Tags Quota] per-sale refund failed for sale ${from.saleId}:`, errMessage(err));
      return 0;
    }
  }
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
  tagCount: number = 1,
  saleId?: string | null
): Promise<number> {
  // Items of a paid a-la-carte sale are counted against that sale's 500 first (whole amount or not at all).
  const upgradedSaleId = await upgradedSaleIdFor(organizerId, saleId);
  if (upgradedSaleId && (await reserveFromSale(upgradedSaleId, clampUnits(tagCount)))) {
    return readUsedFromDb(organizerId);
  }
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
