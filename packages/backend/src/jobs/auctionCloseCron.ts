import cron from 'node-cron';
import { prisma } from '../index';
import { closeAuction } from '../services/auctionService';

/**
 * Auto-close auctions whose end time has passed.
 * Runs every 5 minutes.
 */
export function scheduleAuctionCloseCron(): void {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const expiredAuctions = await prisma.item.findMany({
        where: {
          auctionEndTime: { lte: now },
          auctionClosed: false,
          listingType: 'AUCTION'
        },
        select: { id: true }
      });

      if (expiredAuctions.length === 0) {
        // Silent — nothing to do
        return;
      }

      console.log(`[auction-cron] Found ${expiredAuctions.length} auctions to close`);

      for (const item of expiredAuctions) {
        await closeAuction(item.id);
      }

      console.log(`[auction-cron] Closed ${expiredAuctions.length} auctions`);
    } catch (error) {
      console.error('[auction-cron] Error in auction close cron:', error);
      // Continue — don't let cron job crash
    }
  });

  console.log('[auction-cron] Registered auction auto-close cron (every 5 minutes)');
}
