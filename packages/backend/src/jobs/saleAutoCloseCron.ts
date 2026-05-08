import cron from 'node-cron';
import { prisma } from '../index';
import { cronGuard } from '../utils/cronGuard';

/**
 * Auto-close expired PUBLISHED sales.
 * Runs every hour to transition PUBLISHED sales with endDate in the past to ENDED status.
 * Restricts to scraped sales (sourceUrl IS NOT NULL) to avoid closing organizer-owned sales
 * where the date may have been entered incorrectly but the sale is still active.
 */
export function scheduleSaleAutoCloseCron(): void {
  // Every hour at minute 0
  cron.schedule('0 * * * *', cronGuard({ jobName: 'saleAutoCloseCron' }, async () => {
    const now = new Date();

    console.log(`[sale-auto-close] Starting auto-close of expired PUBLISHED sales`);

    // Find and close all PUBLISHED scraped sales where endDate has passed
    const closedSales = await prisma.sale.updateMany({
      where: {
        status: 'PUBLISHED',
        endDate: { lt: now },
        deletedAt: null,
        sourceUrl: { not: null }, // Only close scraped sales to protect organizer-owned sales
      },
      data: { status: 'ENDED' }
    });

    console.log(`[sale-auto-close] Closed ${closedSales.count} expired sales`);
  }));

  console.log('[sale-auto-close] Registered hourly auto-close cron for expired PUBLISHED sales');
}
