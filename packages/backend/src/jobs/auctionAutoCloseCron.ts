/**
 * ADR-013 Phase 2: Auction Auto-Close Cron
 * Runs every 5 minutes to close expired auctions and notify winners
 */

import { prisma } from '../index';
import { createNotification } from '../services/notificationService';

export function scheduleAuctionAutoCloseCron() {
  // Run every 5 minutes
  const intervalId = setInterval(async () => {
    try {
      // Find all auctions that have expired and are not yet closed
      const expiredAuctions = await prisma.item.findMany({
        where: {
          listingType: 'AUCTION',
          auctionClosed: false,
          auctionEndTime: { lt: new Date() }
        },
        include: {
          bids: {
            where: { status: 'WINNING' },
            include: { user: { select: { id: true, name: true } } }
          },
          sale: { include: { organizer: { select: { userId: true } } } }
        }
      });

      console.log(`[AuctionAutoCloseCron] Found ${expiredAuctions.length} expired auctions`);

      for (const item of expiredAuctions) {
        // Mark auction as closed
        await prisma.item.update({
          where: { id: item.id },
          data: { auctionClosed: true }
        });

        // Notify winner if bid exists
        if (item.bids.length > 0) {
          const winner = item.bids[0];
          await createNotification(
            winner.user.id,
            'AUCTION_WON',
            'Auction Won!',
            `Congratulations! You won the auction for ${item.title} with a bid of $${(item.currentBid ?? 0).toFixed(2)}`,
            `/items/${item.id}`,
            'OPERATIONAL'
          ).catch(err => console.warn('[AuctionAutoCloseCron] Failed to create winner notification:', err));
        }

        // Notify organizer of auction closure
        await createNotification(
          item.sale.organizer.userId,
          'AUCTION_CLOSED',
          'Auction Closed',
          `Your auction for ${item.title} has ended. Final bid: $${(item.currentBid ?? 0).toFixed(2)}`,
          `/items/${item.id}`,
          'OPERATIONAL'
        ).catch(err => console.warn('[AuctionAutoCloseCron] Failed to create organizer notification:', err));
      }
    } catch (error) {
      console.error('[AuctionAutoCloseCron] Error closing expired auctions:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes

  return intervalId;
}
