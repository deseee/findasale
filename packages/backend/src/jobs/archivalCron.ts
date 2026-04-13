import cron from 'node-cron';
import { prisma } from '../index';

/**
 * Quarterly soft-delete of old sales and items.
 * Runs on the 1st day of each quarter at 2:00 AM UTC.
 * Soft-deletes sales/items that ended 2+ years ago.
 */
export function scheduleArchivalCron(): void {
  // First day of each quarter (Jan 1, Apr 1, Jul 1, Oct 1) at 02:00 UTC
  cron.schedule('0 2 1 1,4,7,10 *', async () => {
    try {
      const now = new Date();
      const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());

      console.log(`[archival-cron] Starting quarterly archival (cutoff: ${twoYearsAgo.toISOString()})`);

      // Soft-delete old ENDED sales
      const archivedSales = await prisma.sale.updateMany({
        where: {
          endDate: { lt: twoYearsAgo },
          deletedAt: null,
          status: { not: 'DRAFT' }
        },
        data: { deletedAt: now }
      });

      console.log(`[archival-cron] Archived ${archivedSales.count} old sales`);

      // Soft-delete old items from archived sales
      const archivedItems = await prisma.item.updateMany({
        where: {
          sale: {
            endDate: { lt: twoYearsAgo },
            deletedAt: { not: null }
          },
          deletedAt: null
        },
        data: { deletedAt: now }
      });

      console.log(`[archival-cron] Archived ${archivedItems.count} old items`);

    } catch (error) {
      console.error('[archival-cron] Error in archival cron:', error);
    }
  });

  console.log('[archival-cron] Registered quarterly archival cron (1st of quarter at 02:00 UTC)');
}
