import cron from 'node-cron';
import { prisma } from '../index';
import { cronGuard } from '../utils/cronGuard';
import { notifyPriceDropAlerts } from '../services/priceDropService';

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
            listingType: { not: 'AUCTION' },
            markdownTierApplied: { lt: targetTier },
            price: { gt: 0 }, // Only items with a price
            excludeFromMarkdown: false, // ADR item-exclude-from-markdown (2026-09-28): organizer opt-out
          },
          select: {
            id: true,
            price: true,
          },
        });

        for (const item of itemsToMarkdown) {
          const originalPrice = item.price!;
          // ADR-128 follow-up (2026-09-19): add eBay's own $0.99 minimum-price floor alongside
          // the organizer's own markdownFloor -- an organizer-set floor of $0 (or none) used to
          // let this cron compute a sub-$0.99 price that eBay silently rejects forever after.
          const newPrice = Math.max(
            originalPrice * (1 - discount),
            sale.markdownFloor ?? 0,
            0.99
          );

          // Update item
          await prisma.item.update({
            where: { id: item.id },
            data: {
              price: newPrice,
              priceBeforeMarkdown: originalPrice,
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

          // Record price history
          await prisma.itemPriceHistory.create({
            data: {
              itemId: item.id,
              price: newPrice,
              changedBy: 'markdown',
              note: `Day ${Math.floor(dayOffset) + 1} markdown (tier ${targetTier}, ${(discount * 100).toFixed(0)}% off)`,
            },
          });

          // Tell anyone who favorited this item that its price just dropped —
          // reuses the same alert used for manual organizer price edits.
          notifyPriceDropAlerts(item.id, originalPrice, newPrice).catch(err =>
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
