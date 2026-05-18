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

    // Find sales to close (collect IDs first for post-close liquidation logging)
    const salesToClose = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        endDate: { lt: now },
        deletedAt: null,
        sourceUrl: { not: null }, // Only close scraped sales to protect organizer-owned sales
      },
      select: { id: true },
    });

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

    // Roadmap #460: End-of-Sale Auto-Liquidation — log available items per closed sale
    if (salesToClose.length > 0) {
      const saleIds = salesToClose.map((s) => s.id);
      const liquidationCount = await prisma.item.count({
        where: {
          saleId: { in: saleIds },
          status: 'AVAILABLE',
          isActive: true,
        },
      });
      console.log(`[liquidation] Auto-close batch: ${saleIds.length} sales ended, ${liquidationCount} items queued for liquidation`);
      // Phase 2: clearance UI queries items WHERE status='AVAILABLE' AND isActive=true AND sale.status='ENDED'
    }
  }));

  console.log('[sale-auto-close] Registered hourly auto-close cron for expired PUBLISHED sales');
}
