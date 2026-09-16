import cron from 'node-cron';
import { prisma } from '../index';
import { cronGuard } from '../utils/cronGuard';
import { notifyPriceDropAlerts } from '../services/priceDropService';
import { propagateMarkdownPriceToMarketplaces } from '../services/markdownPricePropagationService';

/**
 * Feature: Automatic Markdown Cycles (PRO Tier)
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
  cron.schedule('8 3 * * *', cronGuard({ jobName: 'markdownCycleCron' }, async () => { // staggered off huntPassExpiryCron's 0 3 * * * 2026-08-04 cost-optimization batch
    const now = new Date();

    // Find all active markdown cycles
    const cycles = await prisma.markdownCycle.findMany({
      where: { isActive: true },
      include: { sale: { select: { id: true, organizerId: true, saleType: true, moveOutDate: true } } },
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

          // Feature #411: Dorm Dash — 2x markdown rate when moveOutDate is within 48 hours
          const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
          const isDormDashUrgent =
            cycle.sale?.saleType === 'DORM_DASH' &&
            cycle.sale?.moveOutDate != null &&
            new Date(cycle.sale.moveOutDate).getTime() - now.getTime() <= FORTY_EIGHT_HOURS_MS;
          const dormDashMultiplier = isDormDashUrgent ? 2 : 1;

          if (isDormDashUrgent) {
            console.log(`[markdown-cycle-cron] DORM_DASH urgency detected for cycle ${cycle.id} — applying 2x markdown rate`);
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
            select: { id: true, price: true, ebayOfferId: true, ebayListingId: true, discogsListingId: true, reverbListingId: true },
          });

          if (firstMarkdownItems.length > 0) {
            const effectiveFirstPct = Math.min(100, cycle.firstPct * dormDashMultiplier);

            // Per-item update: each item must store ITS OWN current price as
            // priceBeforeMarkdown and have its own price reduced. A batch
            // updateMany would (incorrectly) write item[0]'s price onto every item.
            // The `priceBeforeMarkdown: null` filter above is the idempotency guard —
            // items already marked down were excluded from firstMarkdownItems.
            for (const item of firstMarkdownItems) {
              const currentPrice = item.price!;
              const newPrice = Math.max(0, currentPrice * (1 - effectiveFirstPct / 100));

              await prisma.item.update({
                where: { id: item.id },
                data: {
                  priceBeforeMarkdown: currentPrice,
                  price: newPrice,
                  markdownApplied: true,
                  // ADR markdown-cycle-ebay-price-sync (2026-09-15): stamp so the
                  // ebayListingSyncCron.ts pull-sync guard knows this price change
                  // hasn't reached eBay yet and won't clobber it back on the next pull.
                  priceUpdatedAt: new Date(),
                },
              });

              // Tell anyone who favorited this item that its price just dropped.
              notifyPriceDropAlerts(item.id, currentPrice, newPrice).catch(err =>
                console.warn(`[markdown-cycle-cron] price drop alert failed for item ${item.id}:`, err)
              );

              // ADR markdown-cycle-ebay-price-sync (2026-09-15), Dev Instructions step 6:
              // propagate the new price to eBay (Discogs/Reverb are extension points, not
              // wired yet — see markdownPricePropagationService.ts). Awaited (unlike the
              // fire-and-forget alert above) so a confirmed eBay push can stamp
              // ebayPriceSyncedAt before moving to the next item, but wrapped in try/catch
              // so a propagation failure never blocks the loop.
              try {
                const propResults = await propagateMarkdownPriceToMarketplaces({
                  id: item.id,
                  organizerId: cycle.organizerId,
                  price: newPrice,
                  ebayOfferId: item.ebayOfferId,
                  ebayListingId: item.ebayListingId,
                  discogsListingId: item.discogsListingId,
                  reverbListingId: item.reverbListingId,
                });
                const ebayResult = propResults.find(r => r.platform === 'EBAY');
                if (ebayResult?.ok) {
                  await prisma.item.update({
                    where: { id: item.id },
                    data: { ebayPriceSyncedAt: new Date() },
                  });
                } else if (ebayResult) {
                  console.warn(
                    `[markdown-cycle-cron] item ${item.id} eBay propagation did not confirm: ${ebayResult.reason ?? 'unknown'}`
                  );
                }
              } catch (propErr) {
                console.error(`[markdown-cycle-cron] propagation threw for item ${item.id}:`, propErr);
              }
            }

            totalMarkdownsApplied += firstMarkdownItems.length;
            console.log(
              `[markdown-cycle-cron] Applied first markdown (${effectiveFirstPct}% off${isDormDashUrgent ? ' — 2x DORM_DASH rate' : ''}) to ${firstMarkdownItems.length} items for cycle ${cycle.id}`
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
              select: { id: true, priceBeforeMarkdown: true, price: true, ebayOfferId: true, ebayListingId: true, discogsListingId: true, reverbListingId: true },
            });

            if (secondMarkdownItems.length > 0) {
              const effectiveSecondPct = Math.min(100, cycle.secondPct * dormDashMultiplier);

              // Per-item update: each item must have ITS OWN priceBeforeMarkdown used
              // to compute ITS OWN new price and have its own price reduced. A batch
              // updateMany would (incorrectly) write item[0]'s computed price onto
              // every item — same class of bug the first-markdown loop above avoids.
              for (const item of secondMarkdownItems) {
                const originalPrice = item.priceBeforeMarkdown!;
                const newPrice = Math.max(0, originalPrice * (1 - effectiveSecondPct / 100));

                await prisma.item.update({
                  where: { id: item.id },
                  data: {
                    price: newPrice,
                    // ADR markdown-cycle-ebay-price-sync (2026-09-15): see first-markdown
                    // loop above for why this is stamped on every FAS-initiated price write.
                    priceUpdatedAt: new Date(),
                  },
                });

                // Tell anyone who favorited this item that its price just dropped.
                // Uses this item's own pre-write price as "old", and this item's own
                // newly computed price as "new".
                notifyPriceDropAlerts(item.id, item.price, newPrice).catch(err =>
                  console.warn(`[markdown-cycle-cron] price drop alert failed for item ${item.id}:`, err)
                );

                // ADR markdown-cycle-ebay-price-sync (2026-09-15), Dev Instructions step 6:
                // same propagation call as the first-markdown loop above.
                try {
                  const propResults = await propagateMarkdownPriceToMarketplaces({
                    id: item.id,
                    organizerId: cycle.organizerId,
                    price: newPrice,
                    ebayOfferId: item.ebayOfferId,
                    ebayListingId: item.ebayListingId,
                    discogsListingId: item.discogsListingId,
                    reverbListingId: item.reverbListingId,
                  });
                  const ebayResult = propResults.find(r => r.platform === 'EBAY');
                  if (ebayResult?.ok) {
                    await prisma.item.update({
                      where: { id: item.id },
                      data: { ebayPriceSyncedAt: new Date() },
                    });
                  } else if (ebayResult) {
                    console.warn(
                      `[markdown-cycle-cron] item ${item.id} eBay propagation did not confirm: ${ebayResult.reason ?? 'unknown'}`
                    );
                  }
                } catch (propErr) {
                  console.error(`[markdown-cycle-cron] propagation threw for item ${item.id}:`, propErr);
                }
              }

              totalMarkdownsApplied += secondMarkdownItems.length;
              console.log(
                `[markdown-cycle-cron] Applied second markdown (${effectiveSecondPct}% off${isDormDashUrgent ? ' — 2x DORM_DASH rate' : ''}) to ${secondMarkdownItems.length} items for cycle ${cycle.id}`
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
  }));

  console.log('[markdown-cycle-cron] Registered automatic markdown cycle cron (3:00 AM UTC daily)');
}
