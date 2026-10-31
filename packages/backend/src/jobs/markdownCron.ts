import cron from 'node-cron';
import { prisma } from '../index';
import { cronGuard } from '../utils/cronGuard';
import { notifyPriceDropAlerts } from '../services/priceDropService';
import { applyCharmPricing } from '../utils/charmPricing';
import { recordItemPriceHistory } from '../utils/itemPriceHistory';

/**
 * Auto-apply markdown to items based on sale age.
 * Day 1: no markdown
 * Day 2 (24-48h after startDate): 50% off
 * Day 3+ (48h+ after startDate): 75% off
 *
 * AUCTION items are skipped.
 * Prices never drop below markdownFloor.
 * Creates ItemPriceHistory record for each markdown.
 * Tracks progress via Item.markdownTierApplied (0/1/2) so an item already at the Day-2 tier is
 * re-evaluated and advanced to Day-3+ instead of being excluded forever (fixed 2026-09-27, see
 * ADR markdown-tier-mercari-pricing-renewal-coordination-2026-09-27.md).
 *
 * FREE-TIER FEATURE (Patrick decision D3, 2026-09-29): this Day-2/Day-3 schedule runs for ALL
 * subscription tiers (it is the informal industry standard for 2-3 day sales). There is
 * intentionally no organizer-tier filter here. Only markdown CYCLES (markdownCycleCron.ts) and
 * marketplace price propagation are PRO/TEAMS.
 *
 * 2026-10-30 (owner rules: markdowns land on the nearest keystone .49/.99; a manual organizer price is the true
 * price; excludeFromMarkdown items are never marked down):
 *  - Every tier is computed from the ORIGINAL pre-markdown price (priceBeforeMarkdown ?? price), never the
 *    current price. Before this, Day-3's 75% was taken off Day-2's already-halved price ($20 -> $9.99 -> $2.49
 *    instead of $4.99) and Day-3 overwrote priceBeforeMarkdown with the Day-2 price. priceBeforeMarkdown is now
 *    written only when it is null (the first step) and never overwritten by a later step. A manual organizer
 *    price edit clears it (utils/itemPriceHistory.ts MANUAL_PRICE_MARKDOWN_CLEAR), so a later tier then anchors on
 *    the organizer's price.
 *  - One mechanism per item: this cron never touches an item a MarkdownCycle step has been applied to
 *    (markdownStepIndexApplied > 0) and markdownCycleCron never touches an item this cron has tiered
 *    (markdownTierApplied > 0). Both conditions sit in the query AND in the conditional write (updateMany WHERE),
 *    so the two crons cannot both cut one item even when they run at the same moment. Turning
 *    "Keep out of automatic markdowns" on resets both pointers (EXCLUDE_MARKDOWN_RESET).
 *  - Every price write records an ItemPriceHistory row via recordItemPriceHistory (never throws).
 *  - A computed price that is not below the current one is never written (no price increase): the tier is
 *    stamped and nothing else happens.
 *
 * Runs every 5 minutes.
 */
export function scheduleMarkdownCron(): void {
  cron.schedule('*/5 * * * *', cronGuard({ jobName: 'markdownCron' }, async () => {
    const now = new Date();

    // Find all published sales with markdown enabled
    const salesToProcess = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        markdownEnabled: true,
        isOngoing: false, // permanent storefronts don't run time-based auto-markdown
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

        // BUG FIX 2026-09-27 (ADR markdown-tier-mercari-pricing-renewal-coordination, Patrick-
        // reported): this used to compute a `discount` float and gate on the boolean
        // `markdownApplied`, which meant an item marked down once (Day-2) was excluded from this
        // query FOREVER and could never advance to the Day-3+ tier. Now expressed as an integer
        // tier (0/1/2) checked against the new `markdownTierApplied` counter, so an item already
        // at tier 1 is picked up again once the sale crosses into tier 2.
        let targetTier = 0;
        let discount = 0;
        if (dayOffset >= 1 && dayOffset < 2) {
          targetTier = 1; // Day 2: 50% off
          discount = 0.5;
        } else if (dayOffset >= 2) {
          targetTier = 2; // Day 3+: 75% off
          discount = 0.75;
        }

        // Skip Day 1 (targetTier === 0 -- no markdown tier reached yet)
        if (targetTier === 0) {
          continue;
        }

        // Find items in this sale not yet at this tier (or a later one already skipped forward
        // past it -- targetTier only ever increases with dayOffset within a single sale, so
        // `lt: targetTier` is equivalent to "not yet at this tier"). Skip AUCTION listing type.
        const itemsToMarkdown = await prisma.item.findMany({
          where: {
            saleId: sale.id,
            // 2026-09-29 (Patrick D3 + bug fix): only live, unsold, undeleted items are discounted.
            // This query used to have no status/deletedAt filter, so SOLD, DONATED, GRACE_LOCKED and
            // soft-deleted items were repriced too. Mirrors markdownCycleCron (status AVAILABLE).
            // RESERVED/INVOICE_ISSUED are deliberately excluded: those are held for a specific buyer at
            // an agreed price, and repricing under a hold would change what that buyer owes. An item
            // that returns to AVAILABLE is picked up on the next 5-minute run (markdownTierApplied is
            // still below the sale's tier), so nothing is skipped permanently.
            status: 'AVAILABLE',
            deletedAt: null,
            listingType: { not: 'AUCTION' },
            markdownTierApplied: { lt: targetTier },
            price: { gt: 0 }, // Only items with a price
            excludeFromMarkdown: false, // ADR item-exclude-from-markdown (2026-09-28): organizer opt-out
            // 2026-10-30: never an item a PRO MarkdownCycle step already marked down (one mechanism per item).
            OR: [{ markdownStepIndexApplied: null }, { markdownStepIndexApplied: 0 }],
          },
          select: {
            id: true,
            price: true,
            priceBeforeMarkdown: true,
          },
        });

        for (const item of itemsToMarkdown) {
          const currentPrice = item.price!;
          // 2026-10-30: the ORIGINAL pre-markdown price, captured once at the first tier and never overwritten.
          const originalPrice = item.priceBeforeMarkdown ?? currentPrice;
          // ADR-128 follow-up (2026-09-19): add eBay's own $0.99 minimum-price floor alongside
          // the organizer's own markdownFloor -- an organizer-set floor of $0 (or none) used to
          // let this cron compute a sub-$0.99 price that eBay silently rejects forever after.
          // 2026-09-29 (Patrick decision): every markdown lands on the nearest keystone
          // (.49/.99) via applyCharmPricing. The organizer's own markdownFloor is an explicit
          // organizer-set price and is honored as-is (never re-rounded).
          const newPrice = Math.max(
            applyCharmPricing(originalPrice * (1 - discount)),
            sale.markdownFloor ?? 0,
            0.99
          );

          // 2026-10-30: the conditional write is the cross-cron lock -- it lands only while the item is still
          // untouched by a MarkdownCycle step, below this tier, still eligible, and at the price read above
          // (an organizer edit or the cycle cron in between makes it a no-op instead of a second cut).
          const lockWhere = {
            id: item.id,
            status: 'AVAILABLE' as const,
            deletedAt: null,
            excludeFromMarkdown: false,
            markdownTierApplied: { lt: targetTier },
            OR: [{ markdownStepIndexApplied: null }, { markdownStepIndexApplied: 0 }],
          };

          if (newPrice >= currentPrice - 0.005) {
            // Already at (or below) this tier's price, e.g. the floor: stamp the tier, no price write, no
            // history row, no alert. Never raises a price.
            await prisma.item.updateMany({ where: lockWhere, data: { markdownTierApplied: targetTier } });
            continue;
          }

          const written = await prisma.item.updateMany({
            where: { ...lockWhere, price: currentPrice },
            data: {
              price: newPrice,
              // Set once (first tier); a later tier leaves the original in place.
              ...(item.priceBeforeMarkdown == null ? { priceBeforeMarkdown: originalPrice } : {}),
              // markdownTierApplied is this cron's own tier-progress counter (fixes the stuck-
              // at-one-tier bug above). markdownApplied is kept in lockstep (always true from
              // tier 1 onward) purely so markdownCycleCron.ts, itemController.ts's manual-edit
              // display hack, and the Physical Markdown Alert List queue -- none of which know
              // about tiers -- keep reading the exact same boolean they always have.
              markdownTierApplied: targetTier,
              markdownApplied: true,
              // Physical Markdown Alert List (2026-09-25): a system markdown just changed
              // this item's price, so the shelf sticker/tag is now stale -- (re)surface it
              // on the staff "needs physical re-tagging" list. Explicit null (not just
              // relying on the column default) so this stays correct on EVERY tier transition,
              // including Day-2 -> Day-3+, now that this cron can revisit an item a second time.
              markdownPhysicallyAppliedAt: null,
            },
          });
          if (written.count === 0) continue; // lost the race (cycle cron, organizer edit, status change)

          await recordItemPriceHistory(prisma, {
            itemId: item.id,
            price: newPrice,
            changedBy: 'markdown',
            note: `Day ${Math.floor(dayOffset) + 1} markdown (tier ${targetTier}, ${(discount * 100).toFixed(0)}% off original $${originalPrice.toFixed(2)})`,
          });

          // Tell anyone who favorited this item that its price just dropped —
          // reuses the same alert used for manual organizer price edits.
          notifyPriceDropAlerts(item.id, currentPrice, newPrice).catch(err =>
            console.warn(`[markdown-cron] price drop alert failed for item ${item.id}:`, err)
          );

          totalMarkdowns++;
        }
      }

    if (totalMarkdowns > 0) {
      console.log(`[markdown-cron] Applied markdown to ${totalMarkdowns} items`);
    }
  }));

  console.log('[markdown-cron] Registered auto-markdown cron (every 5 minutes)');
}
