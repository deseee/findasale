/**
 * ebaySaleReopenService.ts -- eBay sync hardening (2026-10-01)
 *
 * Explicit, logged "reopen an item whose eBay sale was cancelled / refunded" path. Shared by
 *   - jobs/ebaySoldSyncCron.ts (automatic reverse reconcile), and
 *   - controllers/itemController.ts reopenEbayCancelledSale (organizer-facing endpoint).
 *
 * commitItemSale() deliberately blocks every transition away from SOLD (ADR-098) and is NOT loosened:
 * this service is a separate, narrow door that only opens when ALL of these hold:
 *   1. item.status = SOLD and item.lastSoldVia = 'EBAY'
 *   2. every EbaySoldEvent for the item belongs to an order eBay reports as CANCELED or FULLY_REFUNDED
 *      (so the item has no genuine eBay sale left)
 *   3. no PAID non-test Purchase exists for the item (it was not also sold on another FindA.Sale rail)
 *   4. single-unit item (stockTotal / ebayQuantityAvailable <= 1); multi-unit items are never auto-zeroed
 *   5. the item's eBay listing, or a relisted live listing whose SKU starts with FAS-<itemId>, is LIVE
 * The EbaySoldEvent ledger rows are KEPT (they are what stops the sold sync re-selling the same order).
 * No sold notification is fired. Returns a result object (never throws on a business-rule refusal).
 */

import { prisma } from '../lib/prisma';
import { createNotification } from '../lib/notificationService';
import { classifyEbayOrderLine, fetchEbayOrder, type EbayOrderShape } from './ebayOrderState';
import { fetchLiveEbayListings, itemIdFromFasSku, lookupOfferIdForSku, type LiveEbayListing } from './ebayLiveListingsService';

export type ReopenFailureCode =
  | 'NOT_FOUND'
  | 'NOT_EBAY_SOLD'
  | 'NO_LEDGER'
  | 'NOT_CANCELLED'
  | 'ORDER_UNVERIFIABLE'
  | 'OTHER_SALE'
  | 'MULTI_QUANTITY'
  | 'LISTING_NOT_LIVE'
  | 'RACE';

export type ReopenResult =
  | { ok: true; itemId: string; adoptedListingId: string | null; orderIds: string[] }
  | { ok: false; code: ReopenFailureCode; message: string };

export interface ReopenOptions {
  source: 'cron' | 'organizer';
  organizerId: string;
  actorUserId?: string | null;
  accessToken: string;
  /** Orders already fetched this run, keyed by orderId (avoids per-order GETs). */
  prefetchedOrders?: Map<string, EbayOrderShape>;
  /** Live listings already fetched this run. */
  prefetchedLive?: { listings: LiveEbayListing[]; complete: boolean };
}

const fail = (code: ReopenFailureCode, message: string): ReopenResult => ({ ok: false, code, message });

export async function reopenEbayCancelledSale(itemId: string, opts: ReopenOptions): Promise<ReopenResult> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      title: true,
      status: true,
      lastSoldVia: true,
      saleId: true,
      ebayListingId: true,
      ebayOfferId: true,
      stockTotal: true,
      ebayQuantityAvailable: true,
    },
  });
  if (!item) return fail('NOT_FOUND', 'Item not found');
  if (item.status !== 'SOLD' || item.lastSoldVia !== 'EBAY') {
    return fail('NOT_EBAY_SOLD', 'This item is not marked sold via eBay, so there is no eBay sale to reopen.');
  }
  if ((item.stockTotal ?? 1) > 1 || (item.ebayQuantityAvailable ?? 1) > 1) {
    return fail('MULTI_QUANTITY', 'Multi-quantity items cannot be reopened automatically. Adjust stock manually.');
  }

  const events = await prisma.ebaySoldEvent.findMany({
    where: { itemId },
    select: { ebayOrderId: true, ebayLineItemId: true },
  });
  if (events.length === 0) {
    return fail('NO_LEDGER', 'No eBay sale record exists for this item, so a cancelled eBay sale cannot be verified.');
  }

  // 2. every recorded eBay order must be verifiably cancelled / fully refunded per eBay
  const orderIds = [...new Set(events.map((e) => e.ebayOrderId))];
  const cache = opts.prefetchedOrders ?? new Map<string, EbayOrderShape>();
  for (const ev of events) {
    let order: EbayOrderShape | null | undefined = cache.get(ev.ebayOrderId);
    if (!order) {
      order = await fetchEbayOrder(opts.accessToken, ev.ebayOrderId);
      if (order) cache.set(ev.ebayOrderId, order);
    }
    if (!order) {
      return fail('ORDER_UNVERIFIABLE', `eBay order ${ev.ebayOrderId} could not be read from eBay right now. Try again shortly.`);
    }
    const line = (order.lineItems || []).find((l) => l.lineItemId === ev.ebayLineItemId);
    const verdict = classifyEbayOrderLine(order, line);
    if (verdict.counts || (verdict.kind !== 'CANCELLED' && verdict.kind !== 'REFUNDED')) {
      return fail(
        'NOT_CANCELLED',
        `eBay order ${ev.ebayOrderId} is not cancelled or refunded${verdict.counts ? '' : ` (${verdict.reason})`}. The sale stands.`
      );
    }
  }

  // 3. not also sold on another FindA.Sale rail
  const otherPaid = await prisma.purchase.findFirst({
    where: { itemId, status: 'PAID', isTestTransaction: false },
    select: { id: true },
  });
  if (otherPaid) {
    return fail('OTHER_SALE', 'This item also has a completed FindA.Sale purchase, so it stays sold.');
  }

  // 5. its eBay listing (or a relisted one under the FAS-<itemId> SKU) must be live
  const live = opts.prefetchedLive ?? (await fetchLiveEbayListings(opts.accessToken));
  const liveMatch =
    live.listings.find((l) => !!item.ebayListingId && l.itemId === item.ebayListingId) ??
    live.listings.find((l) => itemIdFromFasSku(l.sku) === item.id);
  if (!liveMatch) {
    return fail(
      'LISTING_NOT_LIVE',
      live.complete
        ? 'The eBay sale was cancelled, but no live eBay listing exists for this item, so it was left as sold. Relist it on eBay first.'
        : 'The eBay sale was cancelled, but live eBay listings could not be read completely. Try again shortly.'
    );
  }

  const adoptedListingId = liveMatch.itemId !== item.ebayListingId ? liveMatch.itemId : null;
  let adoptedOfferId: string | null | undefined;
  if (adoptedListingId && liveMatch.sku) {
    adoptedOfferId = await lookupOfferIdForSku(opts.accessToken, liveMatch.sku, adoptedListingId);
  }

  // Atomic, guarded reopen. EbaySoldEvent rows are intentionally untouched.
  const updated = await prisma.item.updateMany({
    where: { id: itemId, status: 'SOLD', lastSoldVia: 'EBAY' },
    data: {
      status: 'AVAILABLE',
      stockSold: 0,
      ebayQuantitySold: 0,
      lastSoldVia: null,
      ...(adoptedListingId ? { ebayListingId: adoptedListingId, ebayOfferId: adoptedOfferId ?? null } : {}),
    },
  });
  if (updated.count === 0) {
    return fail('RACE', 'The item changed while it was being reopened. Refresh and try again.');
  }

  console.log(
    `[eBay Reopen] REOPENED item ${itemId} ("${item.title}") source=${opts.source} actor=${opts.actorUserId ?? 'system'} ` +
      `orders=${orderIds.join(',')} liveListing=${liveMatch.itemId}${adoptedListingId ? ' (adopted relist)' : ''} ` +
      `-- EbaySoldEvent ledger rows kept`
  );

  // Informational only (NOT a sold notification). Best-effort.
  try {
    const organizer = await prisma.organizer.findUnique({ where: { id: opts.organizerId }, select: { userId: true } });
    if (organizer) {
      await createNotification({
        userId: organizer.userId,
        type: 'SALE_UPDATE',
        title: 'eBay sale cancelled, item available again',
        body: `The eBay order for "${item.title}" was cancelled or refunded and the item is live on eBay again, so it is marked available.`,
        link: item.saleId ? `/organizer/sales/${item.saleId}` : '/organizer/inventory',
      });
    }
  } catch (err: any) {
    console.warn(`[eBay Reopen] notification failed for item ${itemId}:`, err?.message);
  }

  return { ok: true, itemId, adoptedListingId, orderIds };
}
