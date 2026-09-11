/**
 * ebayInsertionsQuotaTracker.ts — Monthly eBay free-insertion counter (ADR-115)
 *
 * OBSERVABILITY ONLY. This does NOT gate whether ebayListingQueueCron.ts or a
 * manual eBay push publishes an item -- that gate is the live per-item
 * getListingFees check (eBay's own account state, checked at publish time).
 * This counter exists purely so the organizer dashboard can eventually show
 * "you've used ~N of your free eBay listings this month" without an extra
 * eBay API call on every page load.
 *
 * Lazy-reset pattern copied from the working aiTagsQuotaTracker.ts (that one
 * is confirmed correct and in production use). Do NOT copy the OLDER
 * ebayPushesThisMonth/ebayPushesResetAt pattern in ebayController.ts --
 * that one was found during the ADR-115 review to never actually reset
 * (no code anywhere checks ebayPushesResetAt against the current month).
 */

import { prisma } from './prisma';

function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Increment the free-insertion counter for an organizer, resetting it first
 * if the stored reset timestamp is from a previous calendar month.
 * Call this AFTER a successful $0 eBay publish (queue cron or manual push).
 */
export async function recordFreeEbayInsertion(organizerId: string): Promise<void> {
  const monthStart = getMonthStart();

  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { ebayInsertionsResetAt: true },
  });

  if (!organizer) {
    console.warn(`[eBay Insertions Quota] Organizer ${organizerId} not found — skipping increment`);
    return;
  }

  const dbResetAt = organizer.ebayInsertionsResetAt ? new Date(organizer.ebayInsertionsResetAt) : null;
  const isStale = !dbResetAt || dbResetAt < monthStart;

  await prisma.organizer.update({
    where: { id: organizerId },
    data: isStale
      ? { ebayInsertionsThisMonth: 1, ebayInsertionsResetAt: monthStart }
      : { ebayInsertionsThisMonth: { increment: 1 } },
  });
}

/**
 * Read the current (lazily-reset) count for dashboard display. Does not
 * increment anything; resets in DB if the stored value is stale so the
 * number shown is never wrong across a month boundary.
 */
export async function getEbayInsertionsUsed(organizerId: string): Promise<number> {
  const monthStart = getMonthStart();

  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { ebayInsertionsThisMonth: true, ebayInsertionsResetAt: true },
  });

  if (!organizer) return 0;

  const dbResetAt = organizer.ebayInsertionsResetAt ? new Date(organizer.ebayInsertionsResetAt) : null;
  if (!dbResetAt || dbResetAt < monthStart) {
    await prisma.organizer.update({
      where: { id: organizerId },
      data: { ebayInsertionsThisMonth: 0, ebayInsertionsResetAt: monthStart },
    });
    return 0;
  }

  return organizer.ebayInsertionsThisMonth || 0;
}
