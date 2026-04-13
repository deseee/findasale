import cron from 'node-cron';
import { prisma } from '../index';

/**
 * Auto-apply markdown to items based on sale age.
 * Day 1: no markdown
 * Day 2 (24-48h after startDate): 50% off
 * Day 3+ (48h+ after startDate): 75% off
 *
 * AUCTION items are skipped.
 * Prices never drop below markdownFloor.
 * Creates ItemPriceHistory record for each markdown.
 *
 * Runs every 5 minutes.
 */
export function scheduleMarkdownCron(): void {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();

      // Find all published sales with markdown enabled
      const salesToProcess = await prisma.sale.findMany({
        where: {
          status: 'PUBLISHED',
          markdownEnabled: true,
          startDate: { lte: now },
        },
        select: {
          id: true,
          startDate: true,
          markdownFloor: true,
        },
      });

      if (salesToProcess.length === 0) {
        // Silent — nothing to do
        return;
      }

      console.log(`[markdown-cron] Found ${salesToProcess.length} sales to process for markdown`);

      let totalMarkdowns = 0;

      for (const sale of salesToProcess) {
        // Calculate day offset
        const timeElapsedMs = now.getTime() - sale.startDate.getTime();
        const dayOffset = timeElapsedMs / (1000 * 60 * 60 * 24);

        // Determine discount tier
        let discount = 0;
        if (dayOffset >= 1 && dayOffset < 2) {
          discount = 0.5; // Day 2: 50% off
        } else if (dayOffset >= 2) {
          discount = 0.75; // Day 3+: 75% off
        }

        // Skip Day 1 (dayOffset < 1)
        if (discount === 0) {
          continue;
        }

        // Find items in this sale that haven't been marked down yet
        // Skip AUCTION listing type
        const itemsToMarkdown = await prisma.item.findMany({
          where: {
            saleId: sale.id,
            listingType: { not: 'AUCTION' },
            markdownApplied: false,
            price: { gt: 0 }, // Only items with a price
          },
          select: {
            id: true,
            price: true,
          },
        });

        for (const item of itemsToMarkdown) {
          const originalPrice = item.price!;
          const newPrice = Math.max(
            originalPrice * (1 - discount),
            sale.markdownFloor ?? 0
          );

          // Update item
          await prisma.item.update({
            where: { id: item.id },
            data: {
              price: newPrice,
              priceBeforeMarkdown: originalPrice,
              markdownApplied: true,
            },
          });

          // Record price history
          await prisma.itemPriceHistory.create({
            data: {
              itemId: item.id,
              price: newPrice,
              changedBy: 'markdown',
              note: `Day ${Math.floor(dayOffset) + 1} markdown (${(discount * 100).toFixed(0)}% off)`,
            },
          });

          totalMarkdowns++;
        }
      }

      if (totalMarkdowns > 0) {
        console.log(`[markdown-cron] Applied markdown to ${totalMarkdowns} items`);
      }
    } catch (error) {
      console.error('[markdown-cron] Error in markdown cron:', error);
      // Continue — don't let cron job crash
    }
  });

  console.log('[markdown-cron] Registered auto-markdown cron (every 5 minutes)');
}
