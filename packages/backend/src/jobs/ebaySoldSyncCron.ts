/**
 * ebaySoldSyncCron.ts — Poll eBay for sold items and mark them SOLD on FindA.Sale
 * Feature #244 Phase 3: eBay Fulfillment API polling
 *
 * Runs every 15 minutes. For each organizer with eBay connected:
 * 1. Refresh access token if needed
 * 2. Fetch recent orders from eBay Fulfillment API
 * 3. Match eBay line items to FindA.Sale items (by SKU or legacyItemId)
 * 4. Mark matched items SOLD
 * 5. Create notifications for organizer
 * 6. Update lastEbaySoldSyncAt timestamp for deduplication
 *
 * Relation path: Item -> Sale -> Organizer -> EbayConnection
 * (Organizer has no direct items[] relation — items belong to Sale)
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { refreshEbayAccessToken, endEbayListingIfExists } from '../controllers/ebayController';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { markShopifyItemSold } from '../services/shopifyService';
import { withdrawDiscogsListingIfExists } from '../services/marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../services/marketplace/reverbConnector'; // 2026-09-23: withdraw Reverb listing on SOLD, beside Discogs
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { createNotification } from '../lib/notificationService';
import { classifyEbayOrderLine, type EbayOrderShape } from '../services/ebayOrderState'; // 2026-10-01: cancel / payment / refund awareness
import { reopenEbayCancelledSale } from '../services/ebaySaleReopenService'; // 2026-10-01: explicit logged reopen (ledger rows kept)
import { fetchLiveEbayListings } from '../services/ebayLiveListingsService';
// ADR-136 Addendum C (#659): an eBay order line for a bulk lot bundle takes bundles x bundleSize cards from the lot.
import { isBulkLotsEnabled } from '../services/bulkLot/bulkLotConfig';
import { cardsForBundles, describeBundleSale } from '../services/bulkLot/bulkLotEbayBundle';
import { absorbBundleOrderLine, releaseCancelledBundleLines, shortfallMessage } from '../services/bulkLot/bulkLotEbaySoldService';
import { reconcileBulkLotEbayInBackgroundIfEnabled } from '../services/bulkLot/bulkLotEbayWiring';
import { releaseBulkLotUnits } from '../services/bulkLot/bulkLotService';
import { formatCardCount } from '../services/bulkLot/bulkLotPricing';

interface EbayItem {
  id: string;
  ebayListingId: string | null;
  ebayOfferId: string | null;
  title: string;
  saleId: string | null; // Feature #300: nullable — inventory items have no sale
  ebayQuantityAvailable: number | null; // ADR ebay-multiquantity: total units on the eBay listing (null/1 = single)
  ebayQuantitySold: number; // ADR ebay-multiquantity: units already sold via eBay
  /** ADR-136 Addendum C: cards per bundle when this item is a bulk lot listed as bundles; null for every other item. */
  bundleSize?: number | null;
}

interface SyncResult {
  synced: number;
  itemsMarkedSold: Array<{
    itemId: string;
    title: string;
    ebayOrderId: string;
  }>;
  /** 2026-10-01: items reopened because their eBay order was cancelled / refunded and the listing is live again. */
  itemsReopened?: string[];
}

/**
 * Reverse reconcile (2026-10-01): an item is SOLD (lastSoldVia 'EBAY') from an order that eBay now
 * reports CANCELED / FULLY_REFUNDED. Reopen it ONLY when its eBay listing (or a relisted live one under
 * the FAS-<itemId> SKU prefix) is live; otherwise leave it SOLD and log it. Uses only the orders already
 * fetched this run (no extra eBay calls unless a candidate exists). The ledger rows are never touched.
 */
async function reverseReconcileCancelledSales(
  organizerId: string,
  accessToken: string,
  ordersById: Map<string, EbayOrderShape>
): Promise<{ reopened: string[]; leftSold: Array<{ itemId: string; code: string }> }> {
  const out = { reopened: [] as string[], leftSold: [] as Array<{ itemId: string; code: string }> };
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const recent = await prisma.ebaySoldEvent.findMany({
    where: {
      createdAt: { gte: since },
      item: { status: 'SOLD', lastSoldVia: 'EBAY', OR: [{ sale: { organizerId } }, { organizerId }] },
    },
    select: { itemId: true },
  });
  const candidateIds = [...new Set(recent.map((e) => e.itemId))];
  if (!candidateIds.length) return out;

  const allEvents = await prisma.ebaySoldEvent.findMany({
    where: { itemId: { in: candidateIds } },
    select: { itemId: true, ebayOrderId: true, ebayLineItemId: true },
  });

  // An item is a reopen candidate only if EVERY one of its eBay orders is visible in this run's order
  // list and is cancelled / fully refunded (an unseen or still-valid order means a real sale may stand).
  const reopenable: string[] = [];
  for (const itemId of candidateIds) {
    const evs = allEvents.filter((e) => e.itemId === itemId);
    const allDead = evs.length > 0 && evs.every((e) => {
      const order = ordersById.get(e.ebayOrderId);
      if (!order) return false;
      const line = (order.lineItems || []).find((l) => l.lineItemId === e.ebayLineItemId);
      const v = classifyEbayOrderLine(order, line);
      return !v.counts && (v.kind === 'CANCELLED' || v.kind === 'REFUNDED');
    });
    if (allDead) reopenable.push(itemId);
  }
  if (!reopenable.length) return out;

  console.log(`[eBay Sync] Organizer ${organizerId}: ${reopenable.length} SOLD item(s) whose eBay order was cancelled/refunded: ${reopenable.join(', ')}`);
  const live = await fetchLiveEbayListings(accessToken);
  for (const itemId of reopenable) {
    const r = await reopenEbayCancelledSale(itemId, {
      source: 'cron',
      organizerId,
      accessToken,
      prefetchedOrders: ordersById,
      prefetchedLive: live,
    });
    if (r.ok) {
      out.reopened.push(itemId);
    } else {
      out.leftSold.push({ itemId, code: r.code });
      console.warn(`[eBay Sync] Item ${itemId} left SOLD after cancelled eBay order: ${r.code} -- ${r.message}`);
    }
  }
  return out;
}

/**
 * ADR-136 Addendum C: gives the cards of a cancelled or refunded eBay bundle order back to the lot, once per order line
 * (the ledger row's bulkReleasedAt is the claim). Only lines this run can see in eBay's order list are judged; an order
 * eBay did not return keeps its cards counted as sold. A line that was short when recorded gives back only what was taken.
 */
async function releaseCancelledBundleOrders(organizerId: string, organizerUserId: string, ordersById: Map<string, EbayOrderShape>): Promise<void> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await prisma.ebaySoldEvent.findMany({
    where: {
      bulkQuantity: { not: null },
      bulkReleasedAt: null,
      createdAt: { gte: since },
      item: { OR: [{ sale: { organizerId } }, { organizerId }] },
    },
    select: { id: true, itemId: true, ebayOrderId: true, ebayLineItemId: true, bulkQuantity: true, bulkShortfall: true, item: { select: { title: true } } },
  });
  const dead = rows.filter((e) => {
    const order = ordersById.get(e.ebayOrderId);
    if (!order) return false;
    const line = (order.lineItems || []).find((l) => l.lineItemId === e.ebayLineItemId);
    const v = classifyEbayOrderLine(order, line);
    return !v.counts && (v.kind === 'CANCELLED' || v.kind === 'REFUNDED');
  });
  if (!dead.length) return;
  const titles = new Map(dead.map((e) => [e.itemId, e.item?.title ?? 'Bulk lot']));
  const res = await releaseCancelledBundleLines(
    {
      claim: async (eventId) => (await prisma.ebaySoldEvent.updateMany({ where: { id: eventId, bulkReleasedAt: null }, data: { bulkReleasedAt: new Date() } })).count === 1,
      releaseCards: (itemId, cards) => releaseBulkLotUnits(prisma as any, itemId, cards),
    },
    dead.map((e) => ({ eventId: e.id, itemId: e.itemId, bulkQuantity: e.bulkQuantity as number, bulkShortfall: e.bulkShortfall ?? null }))
  );
  for (const itemId of res.itemIds) {
    reconcileBulkLotEbayInBackgroundIfEnabled(itemId, 'ebay cancelled bundle order');
    await createNotification({
      userId: organizerUserId,
      type: 'SALE_UPDATE',
      title: 'eBay bundle order cancelled, cards returned',
      body: `An eBay order for "${titles.get(itemId)}" was cancelled or refunded. Its cards are back in the lot (${formatCardCount(res.cards)} in this check).`,
      link: '/organizer/inventory',
    }).catch(() => undefined);
  }
  console.log(`[eBay Sync] Organizer ${organizerId}: returned ${res.cards} cards from ${res.lines} cancelled bundle order line(s)`);
}

/**
 * Sync sold items for a specific organizer.
 * Called by both the cron job and the manual trigger endpoint (GET /api/ebay/sync-sold).
 */
export async function syncSoldItemsForOrganizer(organizerId: string): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, itemsMarkedSold: [], itemsReopened: [] };
  // 2026-10-01: structured per-run diagnostics (logged as one SUMMARY line at the end of the run).
  const diag = {
    ordersSeen: 0,
    linesSeen: 0,
    matched: 0,
    unmatched: 0,
    alreadyRecorded: 0,
    noLineItemId: 0,
    skipped: { CANCELLED: [] as string[], CANCEL_PENDING: [] as string[], REFUNDED: [] as string[], UNPAID: [] as string[] },
    soldApplied: 0,
  };

  // ADR-136 Addendum C: read once per run. The ORDER side of bundles follows the lot flag, not CARD_BULK_EBAY_ENABLED: a
  // bundle listing that is already live on eBay outlives the bundle flag being turned off, and an order for it must still
  // take bundles x bundleSize cards (read as a single unit it would take one card per bundle). With the lot flag off
  // (default) nothing below touches the bundle table or columns.
  const isBundleSync = isBulkLotsEnabled();

  try {
    // Get the organizer's eBay connection
    const connection = await prisma.ebayConnection.findUnique({
      where: { organizerId },
    });

    if (!connection) {
      console.log(`[eBay Sync] Organizer ${organizerId}: no eBay connection found`);
      return result;
    }

    // Get organizer's userId for notifications
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { userId: true },
    });

    if (!organizer) {
      console.log(`[eBay Sync] Organizer ${organizerId}: not found`);
      return result;
    }

    // Get ALL AVAILABLE items for this organizer (via Sale relation).
    // Includes items with null ebayListingId — title-based fallback handles those
    // when eBay orders come in for items listed directly on eBay (not via FindA.Sale push).
    const availableRows = await prisma.item.findMany({
      where: {
        AND: [
          // AVAILABLE single-unit items, PLUS multi-quantity items even once flipped to SOLD
          // (so the idempotent ledger can still absorb re-runs of an already-counted order).
          // ADR-136 Addendum C: PLUS bulk lot bundles whatever their status (a lot the counter sold out can still have a
          // bundle order in flight; its shortfall must be recorded, not lost).
          { OR: [ { status: 'AVAILABLE' }, { ebayQuantityAvailable: { gt: 1 } }, ...(isBundleSync ? [{ ebayBundle: { isNot: null } }] : []) ] },
          // Both sale items and inventory items (saleId=null) imported from eBay.
          { OR: [ { sale: { organizerId } }, { organizerId, saleId: null } ] },
        ],
      },
      select: {
        id: true,
        ebayListingId: true,
        ebayOfferId: true,
        title: true,
        saleId: true,
        ebayQuantityAvailable: true,
        ebayQuantitySold: true,
        ...(isBundleSync ? { ebayBundle: { select: { bundleSize: true } } } : {}),
      },
    });
    const availableItems: EbayItem[] = (availableRows as any[]).map((r) => ({
      id: r.id,
      ebayListingId: r.ebayListingId,
      ebayOfferId: r.ebayOfferId,
      title: r.title,
      saleId: r.saleId,
      ebayQuantityAvailable: r.ebayQuantityAvailable,
      ebayQuantitySold: r.ebayQuantitySold,
      bundleSize: typeof r.ebayBundle?.bundleSize === 'number' ? r.ebayBundle.bundleSize : null,
    }));

    if (!availableItems.length) {
      console.log(`[eBay Sync] Organizer ${organizerId}: no AVAILABLE items`);
      return result;
    }

    // Refresh access token if needed
    const accessToken = await refreshEbayAccessToken(organizerId);
    if (!accessToken) {
      console.error(`[eBay Sync] Failed to get access token for organizer ${organizerId}`);
      return result;
    }

    // Build filter for eBay Fulfillment API
    // 90-day creationdate window — catches all orders placed in the last 90 days.
    // Idempotent: items already SOLD are skipped by the availableItems query above.
    // Using creationdate (not lastmodifieddate) because a settled order that was paid
    // and shipped quickly falls out of a short lastmodifieddate window permanently.
    // creationdate is fixed at order creation — an order placed 60 days ago will always
    // be in a 90-day window until day 91, regardless of whether it has been modified.
    // 90 days covers all normal eBay order timelines including late payments and disputes.
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date().toISOString();
    const filter = `creationdate:[${startDate}..${endDate}]`;

    // Call eBay Fulfillment API
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
    const proxySecret = process.env.EBAY_PROXY_SECRET;
    const ebayResponse = await fetch(
      `${frontendUrl}/api/proxy/ebay?path=${encodeURIComponent(`/sell/fulfillment/v1/order?filter=${encodeURIComponent(filter)}&limit=50`)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Language': 'en-US',
          ...(proxySecret ? { 'X-Proxy-Secret': proxySecret } : {}),
        },
      }
    );

    if (!ebayResponse.ok) {
      const errorMsg = `eBay Fulfillment API error: ${ebayResponse.status}`;
      console.error(`[eBay Sync] ${errorMsg} for organizer ${organizerId}`);
      await prisma.ebayConnection.update({
        where: { organizerId },
        data: { lastErrorAt: new Date(), lastErrorMessage: errorMsg },
      });
      return result;
    }

    const ebayData = (await ebayResponse.json()) as { orders?: EbayOrderShape[] };
    const orders = ebayData.orders || [];
    const ordersById = new Map<string, EbayOrderShape>(orders.map((o) => [o.orderId, o]));
    diag.ordersSeen = orders.length;

    console.log(
      `[eBay Sync] Organizer ${organizerId}: ${orders.length} orders (90-day window) from eBay, ${availableItems.length} local items to check`
    );

    // Process each order's line items
    for (const order of orders) {
      const lineItems = order.lineItems || [];

      for (const lineItem of lineItems) {
        const sku = lineItem.sku || '';
        const legacyItemId = lineItem.legacyItemId || '';
        diag.linesSeen++;

        // Cancel / payment / refund awareness (2026-10-01). A cancelled, unpaid or fully refunded order
        // is not a sale: marking the item SOLD ended the live listing and stranded a relisted item.
        // Checked BEFORE matching so the title-match backfill below can never link a listing id from an
        // order we are not going to count. No ledger row is written for a skipped line, so a pending /
        // unpaid order is picked up on a later run once it becomes PAID.
        const verdict = classifyEbayOrderLine(order, lineItem);
        if (!verdict.counts) {
          const bucket = diag.skipped[verdict.kind];
          if (!bucket.includes(order.orderId)) {
            bucket.push(order.orderId);
            console.log(`[eBay Sync] SKIP order ${order.orderId}: ${verdict.kind} (${verdict.reason}) -- not treated as a sale`);
          }
          continue;
        }

        // Match by SKU first (format: FAS-{itemId})
        let matchedItem: EbayItem | undefined;

        if (sku.startsWith('FAS-')) {
          // Re-listed items carry a date-appended SKU (e.g. "FAS-<id> 2026-05-21").
          // Take only the cuid before the first whitespace so the match still works.
          const itemId = sku.substring(4).split(/\s+/)[0];
          matchedItem = availableItems.find((item) => item.id === itemId);
        }

        // Fall back to matching by legacyItemId (eBay listing ID)
        if (!matchedItem && legacyItemId) {
          matchedItem = availableItems.find((item) => item.ebayListingId === legacyItemId);
        }

        // Final fallback: title-based match for items without an ebayListingId.
        // Handles items the organizer listed directly on eBay (not via FindA.Sale push flow).
        // Only matches if exactly one local item shares the same title — ambiguous matches are skipped.
        if (!matchedItem && lineItem.title) {
          const normalizedTitle = lineItem.title.toLowerCase().trim();
          const titleMatches = availableItems.filter(
            (item) => item.ebayListingId === null && item.title.toLowerCase().trim() === normalizedTitle
          );
          if (titleMatches.length === 1) {
            matchedItem = titleMatches[0];
            // Backfill ebayListingId so future cron runs use the faster ID-based match
            if (legacyItemId) {
              await prisma.item.update({
                where: { id: matchedItem.id },
                data: { ebayListingId: legacyItemId },
              });
              console.log(
                `[eBay Sync] Title-matched item ${matchedItem.id} ("${matchedItem.title}") to eBay listing ${legacyItemId} — ebayListingId backfilled`
              );
              matchedItem = { ...matchedItem, ebayListingId: legacyItemId };
            }
          } else if (titleMatches.length > 1) {
            console.warn(
              `[eBay Sync] Ambiguous title match for "${lineItem.title}" — ${titleMatches.length} candidates, skipping`
            );
          }
        }

        if (!matchedItem) {
          diag.unmatched++;
          continue; // Not our item — belongs to a different organizer or untracked listing
        }
        diag.matched++;

        // --- Idempotent ledger (ADR ebay-multiquantity) ---
        // One EbaySoldEvent per (ebayOrderId, ebayLineItemId). The unique constraint is the
        // reprocessing guard: multi-quantity listings sell multiple units over time, and the
        // old "status=SOLD stops reprocessing" guard missed every unit after the first.
        const lineItemId = lineItem.lineItemId || '';
        const unitQty =
          typeof lineItem.quantity === 'number' && lineItem.quantity > 0 ? lineItem.quantity : 1;
        // ADR-136 Addendum C: a bulk lot bundle line is N bundles = N x bundleSize cards.
        const bundleSize = isBundleSync && typeof matchedItem.bundleSize === 'number' ? matchedItem.bundleSize : null;
        const bundleCards = bundleSize !== null ? cardsForBundles(unitQty, bundleSize) : null;
        if (!lineItemId) {
          diag.noLineItemId++;
          console.warn(
            `[eBay Sync] Order ${order.orderId} line for item ${matchedItem.id} has no lineItemId — skipping (cannot dedupe)`
          );
          continue;
        }

        try {
          await prisma.ebaySoldEvent.create({
            data: {
              itemId: matchedItem.id,
              ebayListingId: matchedItem.ebayListingId || legacyItemId || '',
              ebayOrderId: order.orderId,
              ebayLineItemId: lineItemId,
              quantitySold: unitQty,
              ...(bundleCards !== null ? { bulkQuantity: bundleCards } : {}),
            },
          });
        } catch (err: any) {
          // P2002 = unique (orderId+lineItemId) already processed → idempotent no-op
          if (err?.code === 'P2002') {
            diag.alreadyRecorded++;
            continue;
          }
          throw err;
        }

        // Atomic increment on the eBay-specific idempotency ledger (unchanged --
        // this stays the source of truth for "X of Y sold on eBay" copy below).
        const updated = await prisma.item.update({
          where: { id: matchedItem.id },
          data: { ebayQuantitySold: { increment: unitQty } },
          select: { ebayQuantitySold: true, ebayQuantityAvailable: true, status: true },
        });
        const avail = updated.ebayQuantityAvailable ?? 1;
        const soldCount = updated.ebayQuantitySold;

        // ADR-085 Track B: draw the SAME units down from the general cross-channel
        // stock pool -- this is what makes an eBay sale and a POS/Stripe/etc. sale
        // correctly share one inventory count instead of two disconnected counters.
        // Its fullySoldOut (not the eBay-specific avail/soldCount above) is the
        // authoritative signal for the status flip + "remove everywhere" hooks.
        let fullySold = false;
        let bundleAbsorb: Awaited<ReturnType<typeof absorbBundleOrderLine>> | null = null;
        if (bundleSize !== null) {
          // Bulk lot bundle: take bundles x bundleSize cards through the same guarded decrement. A shortfall (the counter
          // sold the cards first) never drops the sale: it takes what is left, records the gap and tells the organizer.
          const lotId = matchedItem.id;
          bundleAbsorb = await absorbBundleOrderLine(
            {
              sellUnits: (id, units) => sellItemUnits(id, units),
              remainingCards: async (id) => {
                const row = await prisma.item.findUnique({ where: { id }, select: { stockTotal: true, stockSold: true } });
                return Math.max((row?.stockTotal ?? 1) - (row?.stockSold ?? 0), 0);
              },
              isInsufficientStock: (e) => e instanceof InsufficientStockError,
            },
            { itemId: lotId, bundleSize, bundles: unitQty }
          );
          fullySold = bundleAbsorb.fullySoldOut;
          if (bundleAbsorb.shortfall > 0) {
            console.error(
              `[eBay Sync] BUNDLE SHORTFALL item ${lotId} order ${order.orderId}: owed ${bundleAbsorb.cards} cards, supplied ${bundleAbsorb.taken}`
            );
            await prisma.ebaySoldEvent
              .update({
                where: { ebayOrderId_ebayLineItemId: { ebayOrderId: order.orderId, ebayLineItemId: lineItemId } },
                data: { bulkShortfall: bundleAbsorb.shortfall },
              })
              .catch((e: any) => console.error(`[eBay Sync] could not record bundle shortfall for order ${order.orderId}:`, e?.message));
            await createNotification({
              userId: organizer.userId,
              type: 'SALE_UPDATE',
              title: 'eBay bundle order is short on cards',
              body: shortfallMessage(matchedItem.title, order.orderId, bundleAbsorb.cards, bundleAbsorb.shortfall),
              link: matchedItem.saleId ? `/organizer/sales/${matchedItem.saleId}` : `/organizer/inventory`,
              sendEmail: true,
            }).catch((e: any) => console.error(`[eBay Sync] shortfall notification failed for item ${lotId}:`, e));
          }
        } else try {
          const stockResult = await sellItemUnits(matchedItem.id, unitQty);
          fullySold = stockResult.fullySoldOut;
        } catch (err) {
          if (err instanceof InsufficientStockError) {
            // Real money already changed hands on eBay -- the general pool
            // disagreeing means it's stale/desynced (e.g. stockTotal was never
            // set for this item), not that the sale didn't happen. Don't lose
            // the sale: fall back to the eBay-specific ledger's own fullySold
            // check so the listing doesn't stay phantom-available, but log
            // loudly so the desync gets investigated.
            console.error(
              `[eBay Sync] STOCK POOL DESYNC for item ${matchedItem.id} ("${matchedItem.title}"): ` +
              `eBay confirmed a real sale but the general stock pool shows no remaining units. ` +
              `Falling back to eBay-ledger-only fullySold check. ${err.message}`
            );
            fullySold = soldCount >= avail;
          } else {
            throw err;
          }
        }

        if (fullySold && updated.status !== 'SOLD') {
          // lastSoldVia 'EBAY' (2026-09-23): every eBay-detected sale was landing with a NULL
          // tag (15 EbaySoldEvent items in prod, all lastSoldVia NULL), indistinguishable from a
          // manual status edit. Same free-form column the other detectors write.
          await prisma.item.update({
            where: { id: matchedItem.id },
            data: { status: 'SOLD', lastSoldVia: 'EBAY' },
          });
          // Withdraw the eBay listing only once it's fully sold out (fire-and-forget)
          endEbayListingIfExists(matchedItem.id).catch((err) =>
            console.warn(`[eBay Sync] withdraw failed for item ${matchedItem!.id}:`, err.message)
          );
          markShopifyItemSold(matchedItem.id).catch((err) =>
            console.warn(`[Shopify] mark-sold failed for item ${matchedItem!.id}:`, err.message)
          );
          withdrawDiscogsListingIfExists(matchedItem.id).catch((err) =>
            console.warn(`[Discogs] withdraw failed for item ${matchedItem!.id}:`, err.message)
          );
          withdrawReverbListingIfExists(matchedItem.id).catch((err) =>
            console.warn(`[Reverb] withdraw failed for item ${matchedItem!.id}:`, err.message)
          );
          notifyFacebookExportedItemSold(matchedItem.id).catch((err) =>
            console.warn(`[FB Nudge] failed for item ${matchedItem!.id}:`, err.message)
          );
        }

        // Notify organizer — one alert per unit sale (idempotent: only on a NEW ledger row).
        // Fixed 2026-08-04: this previously wrote a raw in-app-only Notification row
        // (no email) via prisma.notification.create -- "an item sold" is arguably the
        // single most important event an organizer needs to know about promptly (they
        // may still have it out at a physical sale/register -- see the double-sale
        // Blocked Queue history), so it's switched to the shared createNotification()
        // helper with sendEmail: true, matching every other sale/payment notification
        // fixed this session. Same in-app row shape either way (channel still defaults
        // to 'OPERATIONAL', notificationChannel still defaults to 'IN_APP' at the schema
        // level even though this call no longer sets it explicitly).
        await createNotification({
          userId: organizer.userId,
          type: 'SALE_UPDATE',
          title: 'Item sold on eBay',
          body:
            bundleAbsorb !== null && bundleSize !== null
              ? `"${matchedItem.title}": ${describeBundleSale(unitQty, bundleSize)} ${formatCardCount(bundleAbsorb.remainingCards)} cards left in the lot.`
              : avail > 1
              ? `"${matchedItem.title}" sold a unit on eBay (${soldCount} of ${avail}).`
              : `"${matchedItem.title}" was purchased on eBay and has been marked as sold.`,
          link: matchedItem.saleId ? `/organizer/sales/${matchedItem.saleId}` : `/organizer/inventory`,
          sendEmail: true,
        }).catch((err) =>
          console.error(`[eBay Sync] Failed to create sold notification for item ${matchedItem!.id}:`, err)
        );

        console.log(
          `[eBay Sync] Item ${matchedItem.id} ("${matchedItem.title}") — unit sold via eBay order ${order.orderId} (${soldCount}/${avail}${fullySold ? ', now SOLD' : ''})`
        );

        // ADR-136 Addendum C: line the eBay quantity up with the cards that are left (END below one bundle). Fire and forget.
        if (bundleAbsorb !== null) reconcileBulkLotEbayInBackgroundIfEnabled(matchedItem.id, 'ebay sold sync');

        result.synced++;
        diag.soldApplied++;
        result.itemsMarkedSold.push({
          itemId: matchedItem.id,
          title: matchedItem.title,
          ebayOrderId: order.orderId,
        });
      }
    }

    // Reverse reconcile (2026-10-01): reopen SOLD-via-eBay items whose order was later cancelled / refunded
    // while their listing is live again. Never fails the sync cycle.
    try {
      const rev = await reverseReconcileCancelledSales(organizerId, accessToken, ordersById);
      result.itemsReopened = rev.reopened;
    } catch (revErr: any) {
      console.error(`[eBay Sync] Reverse reconcile failed for organizer ${organizerId}:`, revErr?.message ?? revErr);
    }

    // ADR-136 Addendum C: cards of cancelled or refunded bundle orders go back to the lot. Never fails the sync cycle.
    if (isBundleSync) {
      try {
        await releaseCancelledBundleOrders(organizerId, organizer.userId, ordersById);
      } catch (relErr: any) {
        console.error(`[eBay Sync] Bundle cancel release failed for organizer ${organizerId}:`, relErr?.message ?? relErr);
      }
    }

    console.log(
      `[eBay Sync] SUMMARY ${JSON.stringify({
        organizerId,
        ordersSeen: diag.ordersSeen,
        linesSeen: diag.linesSeen,
        matched: diag.matched,
        unmatched: diag.unmatched,
        alreadyRecorded: diag.alreadyRecorded,
        noLineItemId: diag.noLineItemId,
        skippedCounts: {
          CANCELLED: diag.skipped.CANCELLED.length,
          CANCEL_PENDING: diag.skipped.CANCEL_PENDING.length,
          REFUNDED: diag.skipped.REFUNDED.length,
          UNPAID: diag.skipped.UNPAID.length,
        },
        skippedOrderIds: diag.skipped,
        soldApplied: diag.soldApplied,
        reopened: result.itemsReopened,
      })}`
    );

    // Update lastEbaySoldSyncAt for deduplication on next run
    await prisma.ebayConnection.update({
      where: { organizerId },
      data: { lastEbaySoldSyncAt: new Date(), lastErrorAt: null, lastErrorMessage: null },
    });

    console.log(
      `[eBay Sync] Organizer ${organizerId}: sync complete — ${result.synced} items marked SOLD`
    );
  } catch (error) {
    console.error(`[eBay Sync ERROR] organizerId ${organizerId}:`, error);
    throw error;
  }

  return result;
}

/**
 * Main cron function: sync sold items for all organizers with eBay connections.
 */
async function syncEbaySoldItems(): Promise<void> {
  try {
    // Find all organizers that have both an eBay connection AND AVAILABLE items.
    // Items live under Sale, so the path is: EbayConnection -> Organizer -> Sales -> Items
    // Note: we no longer require ebayListingId IS NOT NULL here — title-based matching
    // inside syncSoldItemsForOrganizer handles items that were listed directly on eBay.
    // Fetch all connected organizers. We intentionally do NOT filter on "has AVAILABLE
    // items under a sale": inventory items (saleId=null) can also sell on eBay and must be
    // reconciled, and there is no Organizer->Item relation to express "has available
    // inventory items". syncSoldItemsForOrganizer early-returns cheaply (before any token
    // refresh) when an organizer has no AVAILABLE items, so processing every connection is safe.
    const connections = await prisma.ebayConnection.findMany({
      select: { organizerId: true },
    });

    console.log(
      `[eBay Sync] Starting sync cycle for ${connections.length} organizers with eBay connections`
    );

    // Process sequentially to avoid eBay rate limits
    for (const { organizerId } of connections) {
      try {
        await syncSoldItemsForOrganizer(organizerId);
      } catch (error) {
        console.error(
          `[eBay Sync ERROR] Failed to process organizer ${organizerId}:`,
          error
        );
        // Continue — one failure shouldn't block other organizers
      }
    }

    console.log('[eBay Sync] Sync cycle complete');
  } catch (error) {
    console.error('[eBay Sync] Fatal error in syncEbaySoldItems:', error);
    throw error;
  }
}

// Register the cron job to run every 15 minutes
// Cron expression: */15 * * * *
export function startEbaySoldSyncCron(): void {
  cron.schedule('*/15 * * * *', cronGuard({ jobName: 'ebaySoldSyncCron' }, async () => {
    console.log('[eBay Sync] Starting 15-minute sync cycle...');
    await syncEbaySoldItems();
  }));
  console.log('[eBay Sync] Cron registered — runs every 15 minutes');
}
