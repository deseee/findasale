/**
 * ADR-013 Phase 2: Auction Auto-Close Cron
 * Runs every 5 minutes to close expired auctions and notify winners
 */

import { prisma } from '../lib/prisma';
import { createNotification } from '../services/notificationService';
import { cronGuard } from '../utils/cronGuard';

export function scheduleAuctionAutoCloseCron() {
  // Run every 5 minutes
  const intervalId = setInterval(cronGuard({ jobName: 'auctionAutoCloseCron' }, async () => {
    // Find all auctions that have expired and are not yet closed
    // UTC: auctionEndTime is stored as UTC in DB — comparisons use new Date() (current UTC time)
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
      // P0 Race Fix: Wrap close logic in transaction with optimistic lock
      const result = await prisma.$transaction(async (tx) => {
        // 1. Atomic update with WHERE-clause guard: only update if not already closed
        const updated = await tx.item.updateMany({
          where: {
            id: item.id,
            auctionClosed: false,
            auctionEndTime: { lte: new Date() }
          },
          data: { auctionClosed: true }
        });

        // If count === 0, another process already closed it. Skip notifications.
        if (updated.count === 0) {
          console.log(`[AuctionAutoCloseCron] Item ${item.id} already closed by another process, skipping`);
          return null;
        }

        // 2. Now safely fetch bids and create notifications within transaction
        const closedItem = await tx.item.findUnique({
          where: { id: item.id },
          include: {
            bids: {
              where: { status: 'WINNING' },
              include: { user: { select: { id: true, name: true } } }
            },
            sale: { include: { organizer: { select: { userId: true } } } }
          }
        });

        return closedItem;
      });

      // Notifications happen OUTSIDE the transaction to avoid blocking
      if (result && result.bids.length > 0) {
        const winner = result.bids[0];
        await createNotification(
          winner.user.id,
          'AUCTION_WON',
          'Auction Won!',
          `Congratulations! You won the auction for ${result.title} with a bid of $${(result.currentBid ?? 0).toFixed(2)}`,
          `/items/${result.id}`,
          'OPERATIONAL'
        ).catch(err => console.warn('[AuctionAutoCloseCron] Failed to create winner notification:', err));
      }

      if (result) {
        // Notify organizer of auction closure
        await createNotification(
          result.sale!.organizer.userId,
          'AUCTION_CLOSED',
          'Auction Closed',
          `Your auction for ${result.title} has ended. Final bid: $${(result.currentBid ?? 0).toFixed(2)}`,
          `/items/${result.id}`,
          'OPERATIONAL'
        ).catch(err => console.warn('[AuctionAutoCloseCron] Failed to create organizer notification:', err));
      }
    }
  }), 5 * 60 * 1000); // 5 minutes

  return intervalId;
}
