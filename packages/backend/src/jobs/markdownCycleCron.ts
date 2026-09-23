import cron from 'node-cron';
import { prisma } from '../index';
import { cronGuard } from '../utils/cronGuard';
import { notifyPriceDropAlerts } from '../services/priceDropService';
import {
  classifyPropagationFailure,
  formatPropagationFailureReason,
  propagateMarkdownPriceToMarketplaces,
} from '../services/markdownPricePropagationService';

/**
 * Feature: Automatic Markdown Cycles (PRO Tier)
 * Apply time-based automatic price reductions based on organizer-defined markdown cycles.
 * 
 * For each active MarkdownCycle:
 * 1. Find items where organizerId matches (or saleId matches if cycle is sale-scoped)
 * 2. Check if item.createdAt >= daysUntilFirst days ago
 *    - If yes AND priceBeforeMarkdown is NULL: apply firstPct markdown, set priceBeforeMarkdown
 *    - If yes AND markdownApplied is TRUE (a real first markdown, not the manual-price-edit
 *      display hack in itemController.ts) AND createdAt >= daysUntilSecond days ago:
 *      apply secondPct markdown, skipping any item already at the target price
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
              // ADR-128 follow-up (2026-09-19, fixed for real this time -- see markdown-sync-issues audit):
              // eBay rejects any listing price below $0.99 (errorId 25016). A price cut computed
              // without this floor gets stuck in the eBay sync-issues queue forever, since nothing
              // about the stale value changes between retries. Never push the organizer's price
              // below eBay's own minimum.
              const newPrice = Math.max(0.99, currentPrice * (1 - effectiveFirstPct / 100));

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
                  // ADR-128 (2026-09-19): the desired price just moved and eBay has not confirmed
                  // it yet -- that in-flight gap now has a name instead of being inferred from two
                  // timestamps. Gated on the same eBay-live condition buildHandlers() uses in
                  // markdownPricePropagationService.ts, so an item with no eBay listing is never
                  // marked PENDING for a push that will never be attempted. Resolved to SYNCED or
                  // FAILED_* by the propagation block below, inside this same iteration.
                  ...(item.ebayOfferId || item.ebayListingId
                    ? { ebaySyncState: 'PENDING' as const }
                    : {}),
                },
              });

              // Audit trail: markdownCron.ts writes an ItemPriceHistory row for every markdown it
              // applies; this job wrote none, which is exactly why markdown-cycle discounts left
              // no trace to reconstruct after the fact. Wrapped so a history-write failure can
              // never break the markdown loop itself.
              try {
                await prisma.itemPriceHistory.create({
                  data: {
                    itemId: item.id,
                    price: newPrice,
                    changedBy: 'markdown',
                    note: `First markdown (${effectiveFirstPct}% off, cycle ${cycle.id})`,
                  },
                });
              } catch (historyErr) {
                console.warn(
                  `[markdown-cycle-cron] price history write failed for item ${item.id}:`,
                  historyErr
                );
              }

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
                    data: {
                      ebayPriceSyncedAt: new Date(),
                      // ADR-128 (2026-09-19): eBay confirmed this price, so it is now also the
                      // confirmed-live price a shopper on eBay would actually be charged. Clearing
                      // the failure reason and resetting the attempt counter means a later failure
                      // starts counting from zero rather than inheriting a stale history.
                      ebayLivePrice: newPrice,
                      ebaySyncState: 'SYNCED',
                      ebaySyncFailureReason: null,
                      ebaySyncAttempts: 0,
                    },
                  });
                } else if (ebayResult) {
                  // ADR-128 (2026-09-19): record the gap instead of collapsing every failure into
                  // one console.warn. Item.price is deliberately NOT rolled back -- the markdown is
                  // a real business decision the organizer configured, and ADR-128 rejects rollback
                  // explicitly. What changes is that the failure is now classified, so
                  // ebayListingSyncCron.ts can stop retrying what no retry can fix, and eBay's own
                  // error text is kept for the organizer-facing alert.
                  const failureClass = classifyPropagationFailure(ebayResult.reason, ebayResult.detail);
                  await prisma.item.update({
                    where: { id: item.id },
                    data: {
                      ebaySyncState: failureClass === 'terminal' ? 'FAILED_TERMINAL' : 'FAILED_RETRYABLE',
                      ebaySyncFailureReason: formatPropagationFailureReason(ebayResult.reason, ebayResult.detail),
                      ebaySyncAttempts: { increment: 1 },
                    },
                  });
                  console.warn(
                    `[markdown-cycle-cron] item ${item.id} eBay propagation did not confirm (${failureClass}): ${ebayResult.reason ?? 'unknown'}`
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
                // `priceBeforeMarkdown` alone is NOT proof of markdown enrollment.
                // itemController.ts's manual-price-edit path (~line 1670) sets
                // priceBeforeMarkdown = newPrice together with markdownApplied = false purely
                // so the strikethrough display has a reference price. Selecting on
                // `priceBeforeMarkdown: { not: null }` alone therefore swept every
                // manually-repriced item straight into the SECOND (deeper) markdown, while the
                // first-markdown filter above (`priceBeforeMarkdown: null`) permanently excluded
                // those same items from the first. `markdownApplied` is the real enrollment
                // flag — only a genuine first markdown sets it true.
                priceBeforeMarkdown: { not: null }, // Already has first markdown
                markdownApplied: true, // ...and that first markdown was a REAL one, not the display hack
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
                // ADR-128 follow-up (2026-09-19): same $0.99 eBay minimum-price floor as the
                // first-markdown loop above -- see that comment for the full rationale.
                const newPrice = Math.max(0.99, originalPrice * (1 - effectiveSecondPct / 100));

                // Idempotency guard. Unlike the first-markdown loop — whose
                // `priceBeforeMarkdown: null` filter stops an item being re-selected once it has
                // been marked down — this loop's filter (`priceBeforeMarkdown NOT NULL` +
                // `createdAt <= now - daysUntilSecond`) stays true forever, so the same items are
                // re-selected every single night. Without this skip each one is re-written,
                // re-pushed to the eBay API, and has `priceUpdatedAt` re-stamped nightly in
                // perpetuity — and that nightly re-stamp is what keeps items permanently flagged
                // "unsynced" downstream in ebayListingSyncCron.ts. If the item already sits at the
                // target price there is nothing to do: skip the update, the price-drop alert and
                // the marketplace propagation alike.
                // item.price is nullable in the schema (the query filters `price: { gt: 0 }`, so
                // in practice it is always set); a null price cannot match and falls through.
                const currentPrice = item.price;
                if (currentPrice != null && Math.abs(currentPrice - newPrice) < 0.005) {
                  continue;
                }

                await prisma.item.update({
                  where: { id: item.id },
                  data: {
                    price: newPrice,
                    // ADR markdown-cycle-ebay-price-sync (2026-09-15): see first-markdown
                    // loop above for why this is stamped on every FAS-initiated price write.
                    priceUpdatedAt: new Date(),
                    // ADR-128 (2026-09-19): the desired price just moved and eBay has not confirmed
                    // it yet -- that in-flight gap now has a name instead of being inferred from two
                    // timestamps. Gated on the same eBay-live condition buildHandlers() uses in
                    // markdownPricePropagationService.ts, so an item with no eBay listing is never
                    // marked PENDING for a push that will never be attempted. Resolved to SYNCED or
                    // FAILED_* by the propagation block below, inside this same iteration.
                    ...(item.ebayOfferId || item.ebayListingId
                      ? { ebaySyncState: 'PENDING' as const }
                      : {}),
                  },
                });

                // Audit trail: same ItemPriceHistory row markdownCron.ts writes, and the same
                // reason as the first-markdown loop above. Wrapped so a history-write failure can
                // never break the markdown loop itself.
                try {
                  await prisma.itemPriceHistory.create({
                    data: {
                      itemId: item.id,
                      price: newPrice,
                      changedBy: 'markdown',
                      note: `Second markdown (${effectiveSecondPct}% off, cycle ${cycle.id})`,
                    },
                  });
                } catch (historyErr) {
                  console.warn(
                    `[markdown-cycle-cron] price history write failed for item ${item.id}:`,
                    historyErr
                  );
                }

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
                      data: {
                        ebayPriceSyncedAt: new Date(),
                        // ADR-128 (2026-09-19): eBay confirmed this price, so it is now also the
                        // confirmed-live price a shopper on eBay would actually be charged. Clearing
                        // the failure reason and resetting the attempt counter means a later failure
                        // starts counting from zero rather than inheriting a stale history.
                        ebayLivePrice: newPrice,
                        ebaySyncState: 'SYNCED',
                        ebaySyncFailureReason: null,
                        ebaySyncAttempts: 0,
                      },
                    });
                  } else if (ebayResult) {
                    // ADR-128 (2026-09-19): record the gap instead of collapsing every failure into
                    // one console.warn. Item.price is deliberately NOT rolled back -- the markdown is
                    // a real business decision the organizer configured, and ADR-128 rejects rollback
                    // explicitly. What changes is that the failure is now classified, so
                    // ebayListingSyncCron.ts can stop retrying what no retry can fix, and eBay's own
                    // error text is kept for the organizer-facing alert.
                    const failureClass = classifyPropagationFailure(ebayResult.reason, ebayResult.detail);
                    await prisma.item.update({
                      where: { id: item.id },
                      data: {
                        ebaySyncState: failureClass === 'terminal' ? 'FAILED_TERMINAL' : 'FAILED_RETRYABLE',
                        ebaySyncFailureReason: formatPropagationFailureReason(ebayResult.reason, ebayResult.detail),
                        ebaySyncAttempts: { increment: 1 },
                      },
                    });
                    console.warn(
                      `[markdown-cycle-cron] item ${item.id} eBay propagation did not confirm (${failureClass}): ${ebayResult.reason ?? 'unknown'}`
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
