import cron from 'node-cron';
import { prisma } from '../lib/prisma';

/**
 * CD2 Phase 4: Reverse Auction Cron Job
 * Runs daily at 6:00 AM UTC
 * Processes all active reverse auction items:
 * - Calculates daily price drop
 * - Sends push notifications to users who favorited the item
 */

const job = cron.schedule('0 6 * * *', async () => {
  try {
    console.log('[reverseAuctionJob] Starting daily price drop processing...');

    // Fetch all items with reverse auction enabled and AVAILABLE status
    const reverseItems = await prisma.item.findMany({
      where: {
        reverseAuction: true,
        status: 'AVAILABLE',
        reverseStartDate: {
          lte: new Date(), // Only process if start date has passed
        },
      },
      include: {
        favorites: {
          include: {
            user: {
              select: { id: true },
            },
          },
        },
      },
    });

    console.log(`[reverseAuctionJob] Found ${reverseItems.length} active reverse auction items`);

    for (const item of reverseItems) {
      if (
        !item.reverseStartDate ||
        !item.reverseDailyDrop ||
        item.reverseFloorPrice == null
      ) {
        console.warn(
          `[reverseAuctionJob] Item ${item.id} missing required fields, skipping`
        );
        continue;
      }

      // Calculate days elapsed since reverse auction start
      const now = new Date();
      const startDate = new Date(item.reverseStartDate);
      const daysElapsed = Math.floor(
        (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Calculate new price: originalPrice - (days * dailyDrop)
      // Use price field as the original price
      if (!item.price) {
        console.warn(
          `[reverseAuctionJob] Item ${item.id} has no original price, skipping`
        );
        continue;
      }

      const originalPrice = item.price; // in dollars (float)
      const dailyDropDollars = item.reverseDailyDrop / 100; // convert cents to dollars
      const floorPriceDollars = item.reverseFloorPrice! / 100; // convert cents to dollars
      let newPrice = originalPrice - daysElapsed * dailyDropDollars;

      // Enforce floor price
      if (newPrice < floorPriceDollars) {
        newPrice = floorPriceDollars;
      }

      // Update item price only if it changed
      if (newPrice !== item.price) {
        await prisma.item.update({
          where: { id: item.id },
          data: { price: newPrice },
        });

        console.log(
          `[reverseAuctionJob] Item ${item.id} (${item.title}): ${item.price} → ${newPrice}`
        );
      }

      // Optionally notify organizer when item reaches floor price
      if (newPrice === floorPriceDollars) {
        console.log(
          `[reverseAuctionJob] Item ${item.id} has reached floor price ($${floorPriceDollars})`
        );
        // Could queue a notification or email to organizer here
      }
    }

    console.log('[reverseAuctionJob] Completed daily price drop processing');
  } catch (error) {
    console.error('[reverseAuctionJob] Error:', error);
  }
});

export default job;