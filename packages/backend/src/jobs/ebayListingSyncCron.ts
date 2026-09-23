/**
 * ebayListingSyncCron.ts — Pull eBay listing data back into FindA.Sale (two-way sync)
 * Feature #244 Phase 4: Bidirectional eBay Sync
 *
 * Runs every 4 hours. For each organizer with eBay connected and AVAILABLE items
 * with ebayListingId set:
 * 1. Call Inventory API GET /sell/inventory/v1/inventory_item/{sku} for title, description, condition
 * 2. Call Inventory API GET /sell/inventory/v1/offer/{offerId} for current price
 * 3. Compare each field to what's stored in FindA.Sale
 * 4. If anything changed (and eBay value is non-empty), update the FindA.Sale item
 *
 * Condition mapping (eBay Inventory API enum -> FindA.Sale condition string):
 *   NEW / NEW_OTHER / NEW_WITH_DEFECTS       -> NEW
 *   USED_EXCELLENT / USED_VERY_GOOD / USED_GOOD / USED_ACCEPTABLE -> USED
 *   SELLER_REFURBISHED                       -> REFURBISHED
 *   FOR_PARTS_OR_NOT_WORKING                 -> PARTS_OR_REPAIR
 *
 * ADR markdown-cycle-ebay-price-sync (2026-09-15) -- push-first-then-pull:
 * Before the pull-and-compare logic below runs for an item, this now checks
 * Item.priceUpdatedAt / Item.ebayPriceSyncedAt (stamped by markdownCycleCron.ts and by
 * the organizer manual price-edit path). If a local price change hasn't been confirmed
 * on eBay yet, PUSH it first via reviseEbayOfferPrice() and skip that item's pull
 * comparison this cycle -- otherwise this cron's own price pull would clobber the
 * pending local change right back to eBay's stale value (the live bug this ADR fixes).
 * On push failure, the pull is skipped for that item THIS cycle too (never immediately
 * followed by the old pull-and-clobber in the same run) -- guard flags stay untouched so
 * it retries again next cycle (4h later). Every other item (no pending local change, or
 * already synced) keeps the exact pull-and-compare behavior this file always had.
 *
 * Also per ebay-markdown-budget-warnings-ux-spec-2026-09-15.md Piece 2: an item still
 * unsynced ~8h / 2 cron cycles after Item.priceUpdatedAt fires one aggregate
 * "markdown_sync_failure" Notification per organizer per day (see bottom of
 * pullSyncForOrganizer). The sync-issues list endpoint + platforms.tsx mini-panel that
 * notification deep-links to (Dev Handoff Notes #4-5 in that spec) are NOT built here --
 * that's explicit frontend/dispatch-5 scope per next-session-prompt.md, not this dispatch.
 *
 * ADR-128 (2026-09-19) -- retry only what retrying can fix:
 * The push-first step above used to retry EVERY failure every 4h forever, which is why the
 * same handful of items failed on every single run and their organizer got the same
 * markdown_sync_failure notification day after day for a problem no retry can fix. Each push
 * failure is now classified (classifyPropagationFailure, markdownPricePropagationService.ts)
 * and persisted on the Item: FAILED_RETRYABLE keeps the 4h retry below unchanged, while
 * FAILED_TERMINAL is skipped outright at the top of the per-item loop -- zero further eBay
 * API calls, and no fallthrough to the pull (which would clobber Item.price back to eBay's
 * stale value, the one thing ADR-128 explicitly rejects). A terminal failure instead gets a
 * single, per-item notification carrying eBay's actual error message. A terminal item
 * re-enters the push-first path when its price is written again (next markdown, or the
 * organizer's manual price edit in itemController.ts), both of which set PENDING.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { refreshEbayAccessToken } from '../controllers/ebayController';
import { reviseEbayOfferPrice } from '../services/ebayPriceRevisionService';
import {
  classifyPropagationFailure,
  formatPropagationFailureReason,
} from '../services/markdownPricePropagationService';
import { fetchAndCacheEbayStoreSubscription, isEbayStoreSubscriptionStale } from '../services/ebayStoreSubscriptionService';
import { reconcileEbayInsertionsUsage, isEbayInsertionsReconciliationStale } from '../lib/ebayInsertionsQuotaTracker';
import { isEbayRateLimited } from '../lib/ebayRateLimiter';

// ADR markdown-cycle-ebay-price-sync (2026-09-15), UX spec Piece 2: an item counts as
// "sync-failed" (not just mid-retry) once this much time has passed since
// Item.priceUpdatedAt with no confirming ebayPriceSyncedAt -- two full 4h sync-cron
// cycles, giving the automatic push-first retry above two real chances first. This is
// the UX spec's own concrete RECOMMENDATION, not a confirmed Patrick decision (its own
// words: "flagged for Patrick/backend to confirm or adjust; do not silently ship a
// different number without it being visible in code comments referencing this spec") --
// visible here per that instruction.
export const SYNC_FAILURE_THRESHOLD_MS = 8 * 60 * 60 * 1000; // exported (dispatch 5, ebay-markdown-budget-warnings-ux-spec-2026-09-15 Dev Handoff Note #4) so platformStatsController.ts's getEbaySyncIssues can reuse the exact same threshold instead of redefining it.

// ADR-128 (2026-09-19): the aggregate markdown_sync_failure notification's deep link --
// /organizer/platforms auto-opens the sync-issues mini-panel on ?syncIssues=1
// (platforms.tsx). ADR-128 adds a second, per-item flavour of the same notification type
// whose link carries an extra &item=<id>; keying the aggregate's daily dedupe on this
// EXACT link (not just the type) is what stops the two flavours suppressing each other.
const SYNC_ISSUES_LINK = '/organizer/platforms?syncIssues=1';

// Map eBay Inventory API condition enum -> FindA.Sale condition string
function mapEbayConditionToFas(ebayCondition: string): string | null {
  switch (ebayCondition) {
    case 'NEW':
    case 'NEW_OTHER':
    case 'NEW_WITH_DEFECTS':
      return 'NEW';
    case 'USED_EXCELLENT':
    case 'USED_VERY_GOOD':
    case 'USED_GOOD':
    case 'USED_ACCEPTABLE':
      return 'USED';
    case 'SELLER_REFURBISHED':
      return 'REFURBISHED';
    case 'FOR_PARTS_OR_NOT_WORKING':
      return 'PARTS_OR_REPAIR';
    default:
      return null; // Unknown condition -- don't overwrite
  }
}

interface EbayInventoryItem {
  product?: {
    title?: string;
    description?: string;
  };
  condition?: string; // eBay Inventory API enum e.g. USED_GOOD
}

interface EbayOffer {
  pricingSummary?: {
    price?: {
      value?: string;
    };
  };
}

/**
 * Pull-sync eBay listings for a single organizer.
 */
export async function pullSyncForOrganizer(organizerId: string): Promise<void> {
  // Fetch organizer's AVAILABLE items that have been pushed to eBay
  const items = await prisma.item.findMany({
    where: {
      status: 'AVAILABLE',
      ebayListingId: { not: null },
      sale: { organizerId },
    },
    select: {
      id: true,
      title: true,
      description: true,
      price: true,
      condition: true,
      ebayListingId: true,
      ebayOfferId: true,
      priceUpdatedAt: true,
      ebayPriceSyncedAt: true,
      // ADR-128 (2026-09-19): the classified sync state decides whether this item is worth
      // another eBay call at all, and the stored reason is eBay's own error text -- what the
      // one-time terminal notification below actually shows the organizer.
      ebaySyncState: true,
      ebaySyncFailureReason: true,
    },
  });

  // Fetch template once for this organizer — skip description pull-sync when a template is active
  // (eBay stores the expanded template HTML; pulling it back would overwrite the clean item description)
  const policyMapping = await prisma.ebayPolicyMapping.findUnique({
    where: { organizerId },
    select: { defaultDescriptionHtml: true },
  });
  const hasDescriptionTemplate = !!(policyMapping?.defaultDescriptionHtml);

  if (!items.length) {
    return;
  }

  const accessToken = await refreshEbayAccessToken(organizerId);
  if (!accessToken) {
    console.error(`[eBay PullSync] Failed to get access token for organizer ${organizerId}`);
    return;
  }

  // Opportunistic store-tier refresh (2026-09-20, ADR ebay-store-tier-cap):
  // piggybacks on this already-scheduled, already-authenticated eBay call
  // rather than adding a new one to the (zero-eBay-call-constrained) forecast
  // path -- see ebayStoreSubscriptionService.ts's header comment. This is
  // also how already-connected organizers (from before this feature existed)
  // get backfilled, since it re-checks every 4h cycle until it succeeds once.
  const connectionForTierCheck = await prisma.ebayConnection.findUnique({
    where: { organizerId },
    select: { storeSubscriptionCheckedAt: true },
  });
  if (isEbayStoreSubscriptionStale(connectionForTierCheck?.storeSubscriptionCheckedAt ?? null)) {
    fetchAndCacheEbayStoreSubscription(organizerId, accessToken).catch((err) =>
      console.error(`[eBay PullSync] organizer ${organizerId}: store-tier refresh failed:`, err)
    );
  }

  // Opportunistic insertions-usage reconciliation (2026-09-21, adr-ebay-
  // renewal-forecasting-2026-09-15.md "ADR Update -- Flagged Question #1
  // Reopened"): same piggyback reasoning as the store-tier refresh directly
  // above -- reuses this already-scheduled, already-authenticated eBay call
  // instead of adding a new one to the forecast/dashboard path. Throttled to
  // 24h per organizer (isEbayInsertionsReconciliationStale) and guarded by
  // the platform-wide soft cap, same as this codebase's other opportunistic
  // eBay calls.
  const organizerForReconcileCheck = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { ebayInsertionsReconciledAt: true },
  });
  if (
    !isEbayRateLimited() &&
    isEbayInsertionsReconciliationStale(organizerForReconcileCheck?.ebayInsertionsReconciledAt ?? null)
  ) {
    reconcileEbayInsertionsUsage(organizerId, accessToken).catch((err) =>
      console.error(`[eBay PullSync] organizer ${organizerId}: insertions reconciliation failed:`, err)
    );
  }

  const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
  const proxySecret = process.env.EBAY_PROXY_SECRET;
  const proxyHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Accept-Language': 'en-US', // required by eBay Inventory API -- omitting it 400s every call (errorId 25709, same as Bug #506)
    'Content-Language': 'en-US',
    ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
  };

  // ADR markdown-cycle-ebay-price-sync (2026-09-15) / UX spec Piece 2: items still out of
  // sync after the push-first step below, long enough to clear the threshold, are
  // collected here for one aggregate end-of-run Notification (not one per item -- see
  // bottom of this function).
  const staleItems: { id: string; title: string }[] = [];

  // ADR-128 (2026-09-19), Decision #5: items whose last push failed terminally. These are
  // NOT part of the aggregate above -- retrying will never clear them, so an aggregate that
  // re-fires daily is precisely the behavior this ADR exists to stop. Each gets one
  // per-item notification carrying eBay's real message (see bottom of this function).
  const terminalItems: { id: string; title: string; reason: string }[] = [];

  for (const item of items) {
    try {
      // --- ADR-128 (2026-09-19): a terminal failure is never retried ---
      // FAILED_TERMINAL means the last push failed for a reason no retry can fix: eBay
      // evaluated the write and rejected the listing's content (bad aspect value, missing
      // item specific, price under eBay's floor, invalid shipping type) even after
      // reviseEbayOfferPrice()'s own auto-repair attempts, or there is no eBay offer to
      // revise at all. Skip the item entirely -- zero further eBay API calls, which is the
      // whole point, and no fallthrough to the pull-and-compare below either, because that
      // would clobber Item.price back to eBay's stale value and ADR-128 explicitly rejects
      // rolling the organizer's markdown back. The gap stays visible to the organizer in the
      // sync-issues panel (getEbaySyncIssues evaluates it live), and the one-time
      // notification is queued here rather than skipped with the item. Not a dead end: any
      // new price write (next markdown, or a manual price edit) resets the state to PENDING.
      if (item.ebaySyncState === 'FAILED_TERMINAL') {
        terminalItems.push({
          id: item.id,
          title: item.title,
          reason: item.ebaySyncFailureReason ?? 'eBay rejected the price update on this listing',
        });
        continue;
      }

      // --- Push-first: a locally-pending price change wins over eBay's pull value ---
      const pendingLocalPriceChange =
        !!item.priceUpdatedAt &&
        (!item.ebayPriceSyncedAt || item.priceUpdatedAt.getTime() > item.ebayPriceSyncedAt.getTime());

      if (pendingLocalPriceChange && item.price != null) {
        // itemId passed (2026-09-19) so a category-aspect repair retry inside
        // reviseEbayOfferPrice can call reanalyzeItem for this specific item.
        const pushResult = await reviseEbayOfferPrice(item.ebayOfferId, item.price, accessToken, item.ebayListingId, item.id);
        if (pushResult.ok) {
          const syncedAt = new Date();
          await prisma.item.update({
            where: { id: item.id },
            data: {
              ebayPriceSyncedAt: syncedAt,
              // ADR-128 (2026-09-19): eBay confirmed this price, so it is now also the
              // confirmed-live price a shopper would be charged on eBay. Clear the failure
              // reason and reset the attempt counter so a later failure starts from zero.
              ebayLivePrice: item.price,
              ebaySyncState: 'SYNCED',
              ebaySyncFailureReason: null,
              ebaySyncAttempts: 0,
            },
          });
          console.log(
            `[eBay PullSync] item ${item.id}: push-first sent pending FAS price $${item.price} to eBay, stamped ebayPriceSyncedAt`
          );
          // Nothing left to reconcile for this item this cycle -- skip the pull compare below.
          continue;
        }

        // ADR-128 (2026-09-19): classify before deciding whether this is worth another eBay
        // call in 4 hours. The price-provenance guard flags (priceUpdatedAt /
        // ebayPriceSyncedAt) are still deliberately left untouched -- the local price change
        // really is still unconfirmed, and the sync-issues panel reads exactly that.
        const failureClass = classifyPropagationFailure(pushResult.reason, pushResult.detail);
        const failureReason = formatPropagationFailureReason(pushResult.reason, pushResult.detail);
        await prisma.item.update({
          where: { id: item.id },
          data: {
            ebaySyncState: failureClass === 'terminal' ? 'FAILED_TERMINAL' : 'FAILED_RETRYABLE',
            ebaySyncFailureReason: failureReason,
            ebaySyncAttempts: { increment: 1 },
          },
        });

        console.warn(
          `[eBay PullSync] item ${item.id}: push-first failed, ${failureClass} (${pushResult.reason ?? 'unknown'}${pushResult.detail ? ` — ${pushResult.detail}` : ''}) — skipping pull this cycle too; guard flags untouched, ${failureClass === 'terminal' ? 'no further eBay calls for this item' : 'retries next cycle'}`
        );
        if (failureClass === 'terminal') {
          // ADR-128 Decision #5 -- alert once, actionably. This is the transition INTO
          // FAILED_TERMINAL; every later cycle skips this item at the top of the loop and
          // re-queues it from there, where the notification's own existence is the guard.
          terminalItems.push({ id: item.id, title: item.title, reason: failureReason });
        } else if (Date.now() - item.priceUpdatedAt!.getTime() >= SYNC_FAILURE_THRESHOLD_MS) {
          staleItems.push({ id: item.id, title: item.title });
        }
        // Per the ADR: a failed push must never be immediately followed by the old
        // pull-and-clobber in the same run -- skip this item's pull entirely this cycle.
        continue;
      }

      const updates: Record<string, string | number | null> = {};
      const changeLog: string[] = [];

      // ROOT CAUSE (2026-09-16, live Railway logs + prod DB check -- organizer
      // cmnxueoas0005tfv8brnc0kky, ~192/192 of this call 404ing every cron cycle):
      // this file used to guess `sku = FAS-${item.id}` for the inventory_item fetch
      // below. That guess 404s whenever the organizer has skuAppendDate/Cost/
      // Location enabled, because buildCustomLabel() (ebayController.ts) appends a
      // date/cost/roomTag suffix to the REAL SKU in that case (e.g.
      // "FAS-<id> 2026-09-10") -- confirmed live: that organizer has
      // skuAppendDate=true. Same root cause and same fix pattern itemController.ts's
      // push-sync path already uses ("Use the REAL SKU from the offer object
      // (carries a date suffix) — not `FAS-${id}`"): fetch the offer FIRST (this
      // call already existed and works fine, keyed on the stored ebayOfferId, not a
      // guess), read the real sku off the returned offer object, and use THAT for
      // the inventory_item fetch -- never reconstruct it from item.id.
      //
      // The remaining ~47/239 of that organizer's items have no ebayOfferId stored
      // at all (all from an April 2026 batch predating this organizer's
      // Inventory-API-based eBay push flow -- i.e. not Inventory API items at all).
      // There is no Inventory API offer/inventory_item resource to pull for those,
      // so both fetches below are skipped for them (this file already gated the
      // offer fetch on `item.ebayOfferId`; the inventory_item fetch below now is
      // too) instead of burning eBay API budget on a guaranteed 404 for zero benefit.
      let offerObject: Record<string, unknown> | null = null;

      // --- Fetch offer (price) -- also recovers the real Inventory API SKU ---
      if (item.ebayOfferId) {
        const offerPath = `/sell/inventory/v1/offer/${encodeURIComponent(item.ebayOfferId)}`;
        const offerRes = await fetch(
          `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(offerPath)}`,
          { method: 'GET', headers: proxyHeaders }
        );

        if (offerRes.ok) {
          offerObject = (await offerRes.json()) as Record<string, unknown>;
          const offerData = offerObject as EbayOffer;
          const priceStr = offerData.pricingSummary?.price?.value;
          if (priceStr) {
            const ebayPrice = parseFloat(priceStr);
            if (!isNaN(ebayPrice) && ebayPrice !== (item.price ?? null)) {
              updates.price = ebayPrice;
              changeLog.push(`price $${item.price ?? 'null'} -> $${ebayPrice}`);
            }
          }
        } else {
          console.warn(
            `[eBay PullSync] Offer fetch failed for offerId ${item.ebayOfferId}: HTTP ${offerRes.status}`
          );
        }
      } else {
        console.log(
          `[eBay PullSync] item ${item.id}: no ebayOfferId on file -- skipping inventory/offer pull (likely a pre-Inventory-API listing)`
        );
      }

      // --- Fetch inventory item (title, description, condition) using the REAL
      // SKU recovered from the offer object above. No offer fetched = no known real
      // SKU = skip (see root-cause note above; replaces the old `FAS-${item.id}`
      // guess entirely). ---
      const sku = offerObject ? (offerObject.sku as string | undefined) : undefined;
      if (sku) {
        const inventoryPath = `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
        const inventoryRes = await fetch(
          `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(inventoryPath)}`,
          { method: 'GET', headers: proxyHeaders }
        );

        if (inventoryRes.ok) {
          const inventoryData = (await inventoryRes.json()) as EbayInventoryItem;

          // Title
          const ebayTitle = inventoryData.product?.title?.trim();
          if (ebayTitle && ebayTitle !== item.title) {
            updates.title = ebayTitle;
            changeLog.push(`title "${item.title}" -> "${ebayTitle}"`);
          }

          // Description — skip if organizer has a template (eBay stores expanded HTML; pulling back would clobber the clean item description)
          if (!hasDescriptionTemplate) {
            const ebayDescription = inventoryData.product?.description?.trim();
            if (ebayDescription && ebayDescription !== (item.description ?? '')) {
              updates.description = ebayDescription;
              changeLog.push(`description updated`);
            }
          }

          // Condition
          if (inventoryData.condition) {
            const fasCond = mapEbayConditionToFas(inventoryData.condition);
            if (fasCond && fasCond !== item.condition) {
              updates.condition = fasCond;
              changeLog.push(`condition "${item.condition ?? 'null'}" -> "${fasCond}"`);
            }
          }
        } else {
          console.warn(
            `[eBay PullSync] Inventory item fetch failed for ${sku}: HTTP ${inventoryRes.status}`
          );
        }
      }

      // Apply updates if any fields changed
      if (Object.keys(updates).length > 0) {
        await prisma.item.update({
          where: { id: item.id },
          data: updates,
        });
        console.log(
          `[eBay PullSync] Item ${item.id} "${item.title}": ${changeLog.join(', ')}`
        );
      }
    } catch (err) {
      console.error(`[eBay PullSync ERROR] Item ${item.id}:`, err);
      // Continue -- one item failure shouldn't block the rest
    }
  }

  // ADR markdown-cycle-ebay-price-sync (2026-09-15) / UX spec Piece 2, Dev Handoff Note
  // #3: one aggregate Notification per organizer per day-with-new-failures (never one
  // per item). Dedupe approximation: skip if this organizer already has a
  // markdown_sync_failure Notification created today (UTC) -- there is no dedicated
  // "already notified for these items" flag in the schema (unlike Piece 3's separate,
  // out-of-scope ebayInsertionCapWarningNotifiedThisMonth column for a different
  // notification type), so a same-day re-check of a still-stale batch will not
  // re-notify, but a newly-stale batch later the same day also will not get its own
  // notification until the next UTC day. Flagged as a known simplification in this
  // dispatch's handoff report, not a silent guess.
  if (staleItems.length > 0) {
    try {
      const organizer = await prisma.organizer.findUnique({
        where: { id: organizerId },
        select: { userId: true },
      });

      if (organizer?.userId) {
        const now = new Date();
        const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const alreadyNotifiedToday = await prisma.notification.findFirst({
          where: {
            userId: organizer.userId,
            type: 'markdown_sync_failure',
            // ADR-128 (2026-09-19): scope the dedupe to THIS notification's own link. Without
            // it, one per-item terminal notification (same type, link + &item=<id>) would
            // suppress the whole day's aggregate, and vice versa.
            link: SYNC_ISSUES_LINK,
            createdAt: { gte: startOfTodayUtc },
          },
          select: { id: true },
        });

        if (!alreadyNotifiedToday) {
          const count = staleItems.length;
          await prisma.notification.create({
            data: {
              userId: organizer.userId,
              type: 'markdown_sync_failure',
              title: `${count} price cut${count === 1 ? '' : 's'} didn't reach eBay`,
              body:
                "These items still show your markdown price on FindA.Sale, but the change hasn't confirmed on the marketplace. Review and retry.",
              link: SYNC_ISSUES_LINK,
            },
          });
          console.log(
            `[eBay PullSync] organizer ${organizerId}: created markdown_sync_failure notification for ${count} stale item(s)`
          );
        }
      }
    } catch (notifyErr) {
      console.error(`[eBay PullSync] organizer ${organizerId}: failed to create sync-failure notification:`, notifyErr);
    }
  }

  // ADR-128 (2026-09-19), Decision #5 -- "alert once, actionably."
  // A terminal failure is not a stale-item aggregate. Retrying can never clear it, so the
  // daily "N price cuts didn't reach eBay" notification above would repeat for the same item
  // forever -- the exact complaint ADR-128 opens with. Instead: ONE notification per terminal
  // item, carrying eBay's actual message ("Size aspect value not supported"), deep-linked to
  // that item.
  //
  // Once-only guard, with no new schema (per ADR-128's four-column budget): the
  // notification's own `link` carries the item id, so an existing notification with that
  // exact link IS the "already told them" flag. Runs after the aggregate block above so a
  // terminal notification created in this same run can never pre-empt that day's aggregate.
  //
  // Known simplification, flagged not silent: if an item goes terminal, the organizer fixes
  // it, it re-syncs, and it later goes terminal again for a DIFFERENT reason, the second
  // failure reuses the same link and is not re-notified. Same class of approximation as the
  // aggregate's same-day dedupe above.
  if (terminalItems.length > 0) {
    try {
      const organizer = await prisma.organizer.findUnique({
        where: { id: organizerId },
        select: { userId: true },
      });

      if (organizer?.userId) {
        for (const terminal of terminalItems) {
          const link = `${SYNC_ISSUES_LINK}&item=${terminal.id}`;
          const alreadyNotified = await prisma.notification.findFirst({
            where: {
              userId: organizer.userId,
              type: 'markdown_sync_failure',
              link,
            },
            select: { id: true },
          });
          if (alreadyNotified) {
            continue;
          }

          await prisma.notification.create({
            data: {
              userId: organizer.userId,
              type: 'markdown_sync_failure',
              title: `eBay won't accept the new price on "${terminal.title}"`,
              body: `eBay rejected this price change and retrying won't fix it: ${terminal.reason.slice(0, 200)}. FindA.Sale is still showing your marked-down price — fix the listing on eBay, then re-save the item's price in FindA.Sale to push it through.`,
              link,
            },
          });
          console.log(
            `[eBay PullSync] organizer ${organizerId}: created one-time TERMINAL markdown_sync_failure notification for item ${terminal.id}`
          );
        }
      }
    } catch (notifyErr) {
      console.error(`[eBay PullSync] organizer ${organizerId}: failed to create terminal sync-failure notification:`, notifyErr);
    }
  }
}

/**
 * Main cron function: pull-sync all organizers with eBay connections.
 */
async function ebayListingSync(): Promise<void> {
  try {
    const connections = await prisma.ebayConnection.findMany({
      where: {
        organizer: {
          sales: {
            some: {
              items: {
                some: {
                  ebayListingId: { not: null },
                  status: 'AVAILABLE',
                },
              },
            },
          },
        },
      },
      select: { organizerId: true },
    });

    console.log(
      `[eBay PullSync] Starting sync cycle for ${connections.length} organizers with eBay connections`
    );

    // Process sequentially to avoid eBay rate limits
    for (const { organizerId } of connections) {
      try {
        await pullSyncForOrganizer(organizerId);
      } catch (error) {
        console.error(
          `[eBay PullSync ERROR] Failed to process organizer ${organizerId}:`,
          error
        );
        // Continue -- one organizer failure shouldn't block others
      }
    }

    console.log('[eBay PullSync] Sync cycle complete');
  } catch (error) {
    console.error('[eBay PullSync] Fatal error in ebayListingSync:', error);
  }
}

// Register the cron job to run every 4 hours (offset by 2 hours from ended-listings cron at :00)
export function startEbayListingSyncCron(): void {
  cron.schedule('0 2,6,10,14,18,22 * * *', cronGuard({ jobName: 'ebayListingSyncCron' }, async () => {
    console.log('[eBay PullSync] Starting 4-hour sync cycle...');
    await ebayListingSync();
  }));
  console.log('[eBay PullSync] Cron registered -- runs every 4 hours (2,6,10,14,18,22 UTC)');
}
