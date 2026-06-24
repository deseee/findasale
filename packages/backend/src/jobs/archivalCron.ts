import cron from 'node-cron';
import { prisma } from '../index';
import { cronGuard } from '../utils/cronGuard';

/**
 * Quarterly soft-delete of old sales and items.
 * Runs on the 1st day of each quarter at 2:00 AM UTC.
 * Soft-deletes sales/items that ended 2+ years ago.
 */
export function scheduleArchivalCron(): void {
  // First day of each quarter (Jan 1, Apr 1, Jul 1, Oct 1) at 02:00 UTC
  cron.schedule('0 2 1 1,4,7,10 *', cronGuard({ jobName: 'archivalCron' }, async () => {
    const now = new Date();
    const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());

    console.log(`[archival-cron] Starting quarterly archival (cutoff: ${twoYearsAgo.toISOString()})`);

    // Soft-delete old ENDED sales
    const archivedSales = await prisma.sale.updateMany({
      where: {
        endDate: { lt: twoYearsAgo },
        deletedAt: null,
        status: { not: 'DRAFT' },
        isOngoing: false, // never archive permanent storefronts
      },
      data: { deletedAt: now }
    });

    console.log(`[archival-cron] Archived ${archivedSales.count} old sales`);

    // Soft-delete old items from archived sales
    const archivedItems = await prisma.item.updateMany({
      where: {
        sale: {
          endDate: { lt: twoYearsAgo },
          deletedAt: { not: null },
          isOngoing: false, // never archive items of permanent storefronts
        },
        deletedAt: null
      },
      data: { deletedAt: now }
    });

    console.log(`[archival-cron] Archived ${archivedItems.count} old items`);
  }));

  console.log('[archival-cron] Registered quarterly archival cron (1st of quarter at 02:00 UTC)');
}

/**
 * Daily job that archives stale scraped venue records.
 * Runs at 3:00 AM UTC every day.
 *
 * Targets RETAIL and FLEA_MARKET records that were scraped (sourceName IS NOT NULL)
 * and whose endDate has passed. These records have a rolling fake date window that is
 * refreshed on every re-scrape (Issue 1 fix). If the window has expired it means the
 * venue was not re-scraped in time — soft-archive it so it stops showing as PUBLISHED.
 * Status is set to ARCHIVED (not hard-deleted) so it can be restored on next scrape.
 */
export function expireStaleVenueCron(): void {
  // Daily at 03:00 UTC
  cron.schedule('0 3 * * *', cronGuard({ jobName: 'expireStaleVenueCron' }, async () => {
    const now = new Date();

    console.log(`[expire-stale-venue-cron] Starting stale venue expiry sweep (now: ${now.toISOString()})`);

    const expired = await prisma.sale.updateMany({
      where: {
        endDate: { lt: now },
        deletedAt: null,
        status: 'PUBLISHED',
        saleType: { in: ['RETAIL', 'FLEA_MARKET'] },
        sourceName: { not: null },
      },
      data: { status: 'ARCHIVED' },
    });

    console.log(`[expire-stale-venue-cron] Archived ${expired.count} stale venue records`);
  }));

  console.log('[expire-stale-venue-cron] Registered daily stale venue expiry cron (03:00 UTC)');
}
