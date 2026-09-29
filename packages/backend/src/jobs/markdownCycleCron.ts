import cron from 'node-cron';
import { prisma } from '../index';
import { cronGuard } from '../utils/cronGuard';
import { notifyPriceDropAlerts } from '../services/priceDropService';
import {
  classifyPropagationFailure,
  resolveSyncStateAfterFailure,
  formatPropagationFailureReason,
  propagateMarkdownPriceToMarketplaces,
} from '../services/markdownPricePropagationService';

// Manual reschedule (2026-09-28): Patrick rejected the freshly-added 30%-at-90-days step for
// these specific items -- they're re-anchored to count their markdown age from TODAY instead of
// their real Item.createdAt, so the existing 10%/20%/30% step schedule naturally lands on 20%
// ~30 days from today and 30% ~60 days from today, through this SAME cron -- no separate
// mechanism, no scheduled task, no manual re-visit needed. Full rationale + item list:
// claude_docs/STATE.md, 2026-09-28 "Markdown cycle re-anchored to today" entry. Safe to delete
// this block (and the matching Item.excludeFromMarkdown=false flip already applied in prod) once
// these items have genuinely progressed through step 3 on their own.
const MANUAL_RESCHEDULE_2026_09_28_RESET_DATE = new Date('2026-09-28T00:00:00.000Z');
const MANUAL_RESCHEDULE_2026_09_28 = new Set<string>([
  'cmo3etpx2005hjqsuvzlkt8qz', 'cmqty043y000d10d709l1bvmh', 'cmo3eu1fs0071jqsuty6i4ylj',
  'cmrqqed8b000o65c9j2tc3zvm', 'cmrny4bx1001qzziuj4px4uge', 'cmrl2jchz0040toh5ueiwwe0x',
  'cmp5t9ti70011aez9qhibef89', 'cmraxz51l000j4oj3i4f2phda', 'cmrw8nhz5000fttrxfrdmph9n',
  'cmrxod7ke07tx964qb11j1g8k', 'cmo3et5xq002tjqsuysekqdgn', 'cmrxrtogd0040c635xs353n4t',
  'cmrw9y9y00057ttrx70bmy0yb', 'cmrqoo320003nl0suipskoaaq', 'cmo3et2pb002djqsuyta1cslc',
  'cmqquxqzt03lzvg73obk6zjl4', 'cmrw9x5cf004tttrxl5fcseek', 'cmo3esx0d001ljqsu04f1sqce',
  'cmrw99uuj001httrx6pq1x54y', 'cmnzf780a0009pf19ru5qppqn', 'cmrqomljh0036l0sun11zqpme',
  'cmrz4zcic00165u6ij51u9jw5', 'cmo3etg510045jqsuonjetsxy', 'cmrqpqatn005ul0sum3ij77kx',
  'cmrwfr4fx00cnttrxaoapddis', 'cmrw99p6k001bttrx748zp8gj', 'cmrpc4cmi000dp898frzfig5d',
  'cmpbizn7z000j3lq1rjrvn5js', 'cmrw9bgzt0029ttrx1var3b5l', 'cmrxoc33307tg964qy9z1svk7',
  'cmo3eu8nx0081jqsu6sllmvrz', 'cmrxva48p0018yfdtyiokw6by', 'cmo3espav000ljqsu3bnov2y1',
  'cmrquyyx1000dgf1d44docskn', 'cmqbb252i000i60qq7eilco9z', 'cmo3et6qm002xjqsuthjk52y1',
  'cmrayoh6l000p4oj3bqi8i7ml', 'cmp5s7yws000jaez9syc3uibr', 'cmrayp7vw000x4oj3qyycn0j3',
  'cmrw9af83001zttrxjzaj1gfx', 'cmo3eu4ku007hjqsun9d5whez', 'cmo3etk7l004pjqsuzxte6o6c',
  'cmo3etdqw003tjqsuafrmio8v', 'cmo3et3h3002hjqsunq585y4q', 'cmrquadyw001i1ai5knbo035l',
  'cmo3eths3004djqsuy581midm', 'cmrqv767s000ygf1dm4wsve8n', 'cmrxr9kjp001fc6356wrji9fi',
  'cmr10n7gn001q9s0og8f6qgv8', 'cmo3eu67c007pjqsu72da045s', 'cmrazyk1r001b4oj34vx5nvyk',
  'cmp5prjex000gaez9d5e9fjic', 'cmqquygw903m3vg730xi5sbov', 'cmr3xian9000da80uqhepuyad',
]);

/**
 * Feature: Automatic Markdown Cycles (PRO Tier)
 * Apply time-based automatic price reductions based on organizer-defined markdown cycles.
 *
 * ADR-markdown-cycle-n-steps (2026-09-28): a cycle now has 1-6 ordered MarkdownCycleStep rows
 * (dayThreshold, pctOff) instead of the old hardcoded first/second pair. For each active
 * MarkdownCycle:
 * 1. Find items where organizerId matches (or saleId matches if cycle is sale-scoped).
 * 2. For each item, find the LAST step (highest stepOrder) whose dayThreshold has been reached
 *    by item.createdAt. This is what makes the job catch-up safe: an item that aged past two
 *    thresholds between runs (a skipped night, or a cycle just turned on for already-old items)
 *    lands on the correct final step in one pass, never double-applying, never skipping one.
 * 3. Skip if no step's threshold is met yet, or if that step is <= the step already applied
 *    (Item.markdownStepIndexApplied -- null treated as 0). Every markdown percentage is off the
 *    ORIGINAL price (Item.priceBeforeMarkdown, captured once at the first-ever step applied),
 *    never cumulative -- unchanged from before.
 * 4. Per-item update (never updateMany -- each item needs its own current price and its own
 *    computed new price).
 * 5. Log counts.
 *
 * Runs nightly at 3:00 AM UTC (after shopAutoRenewJob at 1:00 AM UTC, before reverseAuctionJob at 6:00 AM UTC)
 */
export function scheduleMarkdownCycleCron(): void {
  // 0 3 * * * = 3:00 AM UTC every day
  cron.schedule('8 3 * * *', cronGuard({ jobName: 'markdownCycleCron' }, async () => { // staggered off huntPassExpiryCron's 0 3 * * * 2026-08-04 cost-optimization batch
    const now = new Date();

    // Find all active markdown cycles, with their steps ordered ascending
    const cycles = await prisma.markdownCycle.findMany({
      where: { isActive: true },
      include: {
        sale: { select: { id: true, organizerId: true, saleType: true, moveOutDate: true } },
        steps: { orderBy: { stepOrder: 'asc' } },
      },
    });

    if (cycles.length === 0) {
      // Silent — nothing to do
      return;
      }

      console.log(`[markdown-cycle-cron] Found ${cycles.length} active markdown cycles to process`);

      let totalMarkdownsApplied = 0;

      for (const cycle of cycles) {
        try {
          if (cycle.steps.length === 0) {
            // No steps configured (e.g. a cycle created before this migration's backfill
            // somehow ended up empty) -- nothing to apply, and nothing to log as an error.
            continue;
          }

          // Determine item query filter based on whether cycle is sale-scoped or organizer-wide
          const itemFilter: any = {
            status: 'AVAILABLE',
            price: { gt: 0 }, // Only items with a price
            excludeFromMarkdown: false, // ADR item-exclude-from-markdown (2026-09-28): organizer opt-out
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

          const finalStepOrder = cycle.steps[cycle.steps.length - 1].stepOrder;

          // Cheap SQL-side filter: only items that haven't reached the cycle's final step yet.
          // The precise "which step is this item eligible for right now" decision happens in
          // JS below, per item, since it depends on comparing item age against N thresholds.
          const candidateItems = await prisma.item.findMany({
            where: {
              ...itemFilter,
              OR: [
                { markdownStepIndexApplied: null },
                { markdownStepIndexApplied: { lt: finalStepOrder } },
              ],
            },
            select: {
              id: true,
              price: true,
              createdAt: true,
              priceBeforeMarkdown: true,
              markdownStepIndexApplied: true,
              ebayOfferId: true,
              ebayListingId: true,
              discogsListingId: true,
              reverbListingId: true,
              ebaySyncAttempts: true,
            },
          });

          for (const item of candidateItems) {
            // See MANUAL_RESCHEDULE_2026_09_28 above -- everything else about this loop is unchanged.
            const effectiveStartDate = MANUAL_RESCHEDULE_2026_09_28.has(item.id)
              ? MANUAL_RESCHEDULE_2026_09_28_RESET_DATE
              : new Date(item.createdAt);
            const daysSinceCreated = (now.getTime() - effectiveStartDate.getTime()) / (24 * 60 * 60 * 1000);

            // Find the LAST (highest stepOrder) step whose threshold has been reached.
            let targetStep: (typeof cycle.steps)[number] | null = null;
            for (const step of cycle.steps) {
              if (daysSinceCreated >= step.dayThreshold) {
                targetStep = step;
              } else {
                break; // steps are ordered ascending by dayThreshold -- no later step qualifies either
              }
            }

            if (!targetStep) {
              continue; // item hasn't reached even the first step's threshold yet
            }

            const alreadyAppliedStepOrder = item.markdownStepIndexApplied ?? 0;
            if (targetStep.stepOrder <= alreadyAppliedStepOrder) {
              continue; // already at or past this step
            }

            // priceBeforeMarkdown is captured once, at the first-ever step applied to this
            // item (by ANY markdown mechanism) -- exactly as before. Every step's price is
            // computed off this original price, never cumulative.
            const originalPrice = item.priceBeforeMarkdown ?? item.price!;
            const effectivePct = Math.min(100, targetStep.pctOff * dormDashMultiplier);
            // ADR-128 follow-up (2026-09-19): eBay rejects any listing price below $0.99
            // (errorId 25016) -- never push the organizer's price below eBay's own minimum.
            const newPrice = Math.max(0.99, originalPrice * (1 - effectivePct / 100));

            const currentPrice = item.price!;
            const isNoopPriceMatch = Math.abs(currentPrice - newPrice) < 0.005;

            if (isNoopPriceMatch) {
              // Self-healing path for the migration to this N-step model: an item already
              // marked down under the OLD 2-step logic (or a previous run of this same loop)
              // is already sitting at this step's target price. Just stamp the pointer --
              // no price write, no history row, no alert, no marketplace push.
              await prisma.item.update({
                where: { id: item.id },
                data: { markdownStepIndexApplied: targetStep.stepOrder },
              });
              continue;
            }

            await prisma.item.update({
              where: { id: item.id },
              data: {
                priceBeforeMarkdown: originalPrice,
                price: newPrice,
                markdownApplied: true,
                markdownStepIndexApplied: targetStep.stepOrder,
                // Physical Markdown Alert List (2026-09-25): this step just changed the
                // price -- (re)surface this item on the staff "needs physical re-tagging"
                // list, even if staff already re-tagged it for an earlier step.
                markdownPhysicallyAppliedAt: null,
                // ADR markdown-cycle-ebay-price-sync (2026-09-15): stamp so the
                // ebayListingSyncCron.ts pull-sync guard knows this price change
                // hasn't reached eBay yet and won't clobber it back on the next pull.
                priceUpdatedAt: new Date(),
                // ADR-128 (2026-09-19): the desired price just moved and eBay has not
                // confirmed it yet. Resolved to SYNCED or FAILED_* by the propagation
                // block below, inside this same iteration.
                ...(item.ebayOfferId || item.ebayListingId
                  ? { ebaySyncState: 'PENDING' as const, ebaySyncAttempts: 0 }
                  : {}),
              },
            });

            // Audit trail: every markdown step writes an ItemPriceHistory row. Wrapped so a
            // history-write failure can never break the markdown loop itself.
            try {
              await prisma.itemPriceHistory.create({
                data: {
                  itemId: item.id,
                  price: newPrice,
                  changedBy: 'markdown',
                  note: `Markdown step ${targetStep.stepOrder} (${effectivePct}% off, cycle ${cycle.id})`,
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
            // propagate the new price to eBay (Discogs/Reverb are wired too, see
            // markdownPricePropagationService.ts). Awaited so a confirmed eBay push can
            // stamp ebayPriceSyncedAt before moving to the next item, but wrapped in
            // try/catch so a propagation failure never blocks the loop.
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
                    ebayLivePrice: newPrice,
                    ebaySyncState: 'SYNCED',
                    ebaySyncFailureReason: null,
                    ebaySyncAttempts: 0,
                  },
                });
              } else if (ebayResult) {
                const failureClass = classifyPropagationFailure(ebayResult.reason, ebayResult.detail);
                const nextSyncState = resolveSyncStateAfterFailure(failureClass, (item.ebaySyncAttempts ?? 0) + 1, ebayResult.reason);
                await prisma.item.update({
                  where: { id: item.id },
                  data: {
                    ebaySyncState: nextSyncState,
                    ebaySyncFailureReason: formatPropagationFailureReason(ebayResult.reason, ebayResult.detail),
                    ebaySyncAttempts: { increment: 1 },
                  },
                });
                console.warn(
                  `[markdown-cycle-cron] item ${item.id} eBay propagation did not confirm (${failureClass} -> ${nextSyncState}): ${ebayResult.reason ?? 'unknown'}`
                );
              }
            } catch (propErr) {
              console.error(`[markdown-cycle-cron] propagation threw for item ${item.id}:`, propErr);
            }

            totalMarkdownsApplied += 1;
          }

          if (candidateItems.length > 0) {
            console.log(
              `[markdown-cycle-cron] Processed ${candidateItems.length} candidate items for cycle ${cycle.id}${isDormDashUrgent ? ' (2x DORM_DASH rate)' : ''}`
            );
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
