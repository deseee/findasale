import cron from 'node-cron';
import { prisma } from '../index';

/**
 * Feature #XXX: Automatic Markdown Cycles (PRO Tier)
 * Apply time-based automatic price reductions based on organizer-defined markdown cycles.
 * 
 * For each active MarkdownCycle:
 * 1. Find items where organizerId matches (or saleId matches if cycle is sale-scoped)
 * 2. Check if item.createdAt >= daysUntilFirst days ago
 *    - If yes AND priceBeforeMarkdown is NULL: apply firstPct markdown, set priceBeforeMarkdown
 *    - If yes AND priceBeforeMarkdown is NOT NULL AND createdAt >= daysUntilSecond days ago: apply secondPct markdown
 * 3. Use updateMany for efficiency
 * 4. Log counts
 *
 * Runs nightly at 3:00 AM UTC (after shopAutoRenewJob at 1:00 AM UTC, before reverseAuctionJob at 6:00 AM UTC)
 */
export function scheduleMarkdownCycleCron(): void {
  // 0 3 * * * = 3:00 AM UTC every day
  cron.schedule('0 3 * * *', async () => {
    try {
      const now = new Date();

      // Find all active markdown cycles
      const cycles = await prisma.markdownCycle.findMany({
        where: { isActive: true },
        include: { sale: { select: { id: true, organizerId: true } } },
      });

      if (cycles.length === 0) {
        // Silent — nothing to do
        return;
      }

      console.log(`[markdown-cycle-cron] Found ${cycles.length} active markdown cycles to process`);

      let totalMarkdownsApplied = 0;

      for (const cycle of cycles) {
        try {
          // Determine item query filter based on whether cycle is sale-scoped or organizer-wide
          const itemFilter: any = {
            status: 'AVAILABLE',
            price: { gt: 0 }, // Only items with a price
          };

          if (cycle.saleId) {
            // Sale-scoped cycle
            itemFilter.saleId = cycle.saleId;
          } else {
            // Organizer-wide cycle
            itemFilter.organizerId = cycle.organizerId;
          }

          // Find items eligible for first markdown (createdAt >= daysUntilFirst days ago, priceBeforeMarkdown is NULL)
          const firstMarkdownItems = await prisma.item.findMany({
            where: {
              ...itemFilter,
              priceBeforeMarkdown: null, // Not yet marked down
              createdAt: {
                lte: new Date(now.getTime() - cycle.daysUntilFirst * 24 * 60 * 60 * 1000),
              },
            },
            select: { id: true, price: true },
          });

          if (firstMarkdownItems.length > 0) {
            const newPrice = Math.max(
              0,
              firstMarkdownItems[0].price! * (1 - cycle.firstPct / 100)
            );

            await prisma.item.updateMany({
              where: {
                id: { in: firstMarkdownItems.map(item => item.id) },
              },
              data: {
                priceBeforeMarkdown: firstMarkdownItems[0].price,
                markdownApplied: true,
              },
            });

            totalMarkdownsApplied += firstMarkdownItems.length;
            console.log(
              `[markdown-cycle-cron] Applied first markdown (${cycle.firstPct}% off) to ${firstMarkdownItems.length} items for cycle ${cycle.id}`
            );
          }

          // Apply second markdown if configured
          if (cycle.daysUntilSecond && cycle.secondPct) {
            const secondMarkdownItems = await prisma.item.findMany({
              where: {
                ...itemFilter,
                priceBeforeMarkdown: { not: null }, // Already has first markdown
                createdAt: {
                  lte: new Date(now.getTime() - cycle.daysUntilSecond * 24 * 60 * 60 * 1000),
                },
              },
              select: { id: true, priceBeforeMarkdown: true },
            });

            if (secondMarkdownItems.length > 0) {
              // Use original price (priceBeforeMarkdown) for second markdown calculation
              const originalPrice = secondMarkdownItems[0].priceBeforeMarkdown!;
              const newPrice = Math.max(
                0,
                originalPrice * (1 - cycle.secondPct / 100)
              );

              await prisma.item.updateMany({
                where: {
                  id: { in: secondMarkdownItems.map(item => item.id) },
                },
                data: {
                  price: newPrice,
                },
              });

              totalMarkdownsApplied += secondMarkdownItems.length;
              console.log(
                `[markdown-cycle-cron] Applied second markdown (${cycle.secondPct}% off) to ${secondMarkdownItems.length} items for cycle ${cycle.id}`
              );
            }
          }
        } catch (cycleError) {
          console.error(`[markdown-cycle-cron] Error processing cycle ${cycle.id}:`, cycleError);
          // Continue with next cycle
        }
      }

      if (totalMarkdownsApplied > 0) {
        console.log(`[markdown-cycle-cron] Total items marked down: ${totalMarkdownsApplied}`);
      }
    } catch (error) {
      console.error('[markdown-cycle-cron] Error in markdown cycle cron:', error);
      // Continue — don't let cron job crash
    }
  });

  console.log('[markdown-cycle-cron] Registered automatic markdown cycle cron (3:00 AM UTC daily)');
}
