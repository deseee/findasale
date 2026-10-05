/**
 * Real eBay operations and shared Prisma binding for bulk lot bundles (ADR-136 Addendum C).
 *
 * bulkLotEbayService is pure of I/O (database and eBay operations are injected). This file is the one place that binds
 * them to the real Prisma client and the real eBay code, for the controller, the sweep cron and the hooks other code
 * calls (the sold sync, the stock sync, the register paths). Nothing here runs at import time.
 *
 * Every eBay write is guarded by the flags in the callers (bulkLotEbayConfig): with CARD_BULK_EBAY_ENABLED off the
 * public helpers below return without touching the database or eBay.
 */
import { prisma } from '../../lib/prisma';
import { isEbayRateLimited, trackEbayCall } from '../../lib/ebayRateLimiter';
import { ebayProxyHeaders, ebayProxyUrl, ebayUserHeaders, refreshEbayAccessToken } from '../ebayHttp';
import { buildCustomLabel, endEbayListingIfExists, pushItemsToEbayLive } from '../../controllers/ebayController';
import { isBulkEbayEnabled } from './bulkLotEbayConfig';
import { reconcileBulkLotEbay, reconcileBulkLotEbayInBackground, type BundleDb, type BundleEbayOps, type BundleOpResult, type ReconcileResult } from './bulkLotEbayService';

export const bundleDb = prisma as unknown as BundleDb;

function ebayMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const first = Array.isArray(parsed?.errors) ? parsed.errors[0] : null;
    const text = first?.longMessage || first?.message;
    if (typeof text === 'string' && text) return text.slice(0, 300);
  } catch {
    /* not JSON */
  }
  return raw.slice(0, 300);
}

/** Resolves the organizer, token and SKU for an item, from the item id only (never from a caller's input). */
async function ebayContextFor(itemId: string): Promise<
  | { ok: true; accessToken: string; sku: string; offerId: string }
  | { ok: false; code: string; message: string }
> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { ebayOfferId: true, saleId: true, organizerId: true, createdAt: true, costBasis: true, roomTag: true },
  });
  if (!item || !item.ebayOfferId) return { ok: false, code: 'NO_OFFER', message: 'This lot has no eBay offer yet.' };
  let organizerId: string | null = item.organizerId ?? null;
  if (item.saleId) {
    const sale = await prisma.sale.findUnique({ where: { id: item.saleId }, select: { organizerId: true } });
    organizerId = sale?.organizerId ?? organizerId;
  }
  if (!organizerId) return { ok: false, code: 'NO_ORGANIZER', message: 'The owner of this lot could not be found.' };
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { id: true, skuAppendDate: true, skuAppendCost: true, skuAppendLocation: true, ebayConnection: { select: { organizerId: true } } },
  });
  if (!organizer?.ebayConnection) return { ok: false, code: 'NOT_CONNECTED', message: 'Connect your eBay account first.' };
  const accessToken = await refreshEbayAccessToken(organizer.id);
  if (!accessToken) return { ok: false, code: 'NO_TOKEN', message: 'Could not sign in to eBay. Reconnect your eBay account.' };
  return { ok: true, accessToken, sku: buildCustomLabel(itemId, organizer, item), offerId: item.ebayOfferId };
}

/**
 * Revises quantity and price of a LIVE offer with bulkUpdatePriceQuantity (one request, one SKU, one offer). The offer
 * is read first: bulkUpdatePriceQuantity only works on a PUBLISHED offer, and a listing the organizer ended on eBay
 * must never be quietly brought back to life, so anything else answers NOT_LIVE.
 *
 * Source: developer.ebay.com/api-docs/sell/inventory/resources/inventory_item/methods/bulkUpdatePriceQuantity
 * Not yet exercised against live eBay (owed live check 1 in ADR-136 Addendum C).
 */
async function reviseOnEbay(ctx: { itemId: string; quantity: number; priceCents: number }): Promise<BundleOpResult> {
  if (isEbayRateLimited()) return { ok: false, code: 'RATE_LIMITED', message: 'eBay daily limit reached. It will be tried again later.' };
  const e = await ebayContextFor(ctx.itemId);
  if (!e.ok) return e;
  const headers = { ...ebayUserHeaders(e.accessToken), ...ebayProxyHeaders() };

  const offerRes = await fetch(ebayProxyUrl(encodeURIComponent(`/sell/inventory/v1/offer/${e.offerId}`)), { method: 'GET', headers });
  if (!offerRes.ok) {
    const text = await offerRes.text();
    if (offerRes.status === 404) return { ok: false, code: 'NOT_LIVE', message: 'The eBay offer was not found.' };
    return { ok: false, code: 'OFFER_READ_FAILED', message: ebayMessage(text) };
  }
  trackEbayCall();
  const offer = (await offerRes.json()) as { status?: string };
  if (String(offer.status ?? '').toUpperCase() !== 'PUBLISHED') {
    return { ok: false, code: 'NOT_LIVE', message: 'The eBay offer is not published.' };
  }

  const body = {
    requests: [
      {
        sku: e.sku,
        shipToLocationAvailability: { quantity: ctx.quantity },
        offers: [
          {
            offerId: e.offerId,
            availableQuantity: ctx.quantity,
            price: { currency: 'USD', value: (ctx.priceCents / 100).toFixed(2) },
          },
        ],
      },
    ],
  };
  const res = await fetch(ebayProxyUrl(encodeURIComponent('/sell/inventory/v1/bulk_update_price_quantity')), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, code: `HTTP_${res.status}`, message: ebayMessage(text) };
  trackEbayCall();

  // The call answers 200 with one entry per SKU and one per offer; each carries its own statusCode.
  try {
    const parsed = JSON.parse(text) as { responses?: Array<{ statusCode?: number; errors?: Array<{ message?: string }>; offers?: Array<{ statusCode?: number; errors?: Array<{ message?: string }> }> }> };
    for (const r of parsed.responses ?? []) {
      const codes = [r.statusCode, ...(r.offers ?? []).map((o) => o.statusCode)];
      const bad = codes.find((c) => typeof c === 'number' && (c < 200 || c > 299));
      if (bad !== undefined) {
        const msg = r.errors?.[0]?.message || r.offers?.find((o) => o.errors?.length)?.errors?.[0]?.message || `eBay answered ${bad}`;
        return { ok: false, code: `ITEM_${bad}`, message: String(msg).slice(0, 300) };
      }
    }
  } catch {
    /* an unreadable but successful answer is treated as success */
  }
  try {
    await prisma.item.update({ where: { id: ctx.itemId }, data: { ebayQuantityAvailable: ctx.quantity } });
  } catch (err) {
    console.warn(`[bulkLotEbay] could not mirror quantity on item ${ctx.itemId}:`, err instanceof Error ? err.message : err);
  }
  return { ok: true };
}

/** The normal push pipeline for one lot (the bundle overlay is applied inside pushSaleToEbay). */
async function publishOnEbay(ctx: { itemId: string }): Promise<BundleOpResult> {
  const item = await prisma.item.findUnique({ where: { id: ctx.itemId }, select: { saleId: true } });
  if (!item?.saleId) return { ok: false, code: 'NO_SALE', message: 'This lot is not part of a sale, so it cannot be listed on eBay from here.' };
  const sale = await prisma.sale.findUnique({ where: { id: item.saleId }, select: { organizerId: true } });
  if (!sale) return { ok: false, code: 'NO_SALE', message: 'The sale for this lot was not found.' };
  const organizer = await prisma.organizer.findUnique({ where: { id: sale.organizerId }, select: { userId: true } });
  if (!organizer) return { ok: false, code: 'NO_ORGANIZER', message: 'The owner of this lot could not be found.' };

  const { statusCode, body } = await pushItemsToEbayLive(organizer.userId, item.saleId, [ctx.itemId]);
  const first = body?.results?.[0];
  if (statusCode < 400 && first?.status === 'success') return { ok: true, listingId: first.ebayListingId ?? null };
  const message: string =
    (typeof first?.message === 'string' && first.message) ||
    (typeof body?.message === 'string' && body.message) ||
    'eBay did not accept the listing.';
  return { ok: false, code: String(first?.code || first?.error || body?.code || `HTTP_${statusCode}`), message: message.slice(0, 300) };
}

export const realBundleOps: BundleEbayOps = {
  revise: reviseOnEbay,
  end: (itemId) => endEbayListingIfExists(itemId, 'sold'),
  publish: publishOnEbay,
};

/** Awaitable reconcile for one lot (controllers, the cron). Returns without doing anything when the flags are off. */
export async function reconcileBulkLotEbayNow(itemId: string, opts: { forceRepublish?: boolean } = {}): Promise<ReconcileResult | null> {
  if (!isBulkEbayEnabled()) return null;
  return reconcileBulkLotEbay(bundleDb, realBundleOps, itemId, opts);
}

/**
 * Fire-and-forget reconcile for sale and restock paths: call it after any change to a lot's cards (a sale, a refund
 * that returns cards, a restock, a hold that is taken or released, a price change). Never throws, never blocks, and does
 * nothing at all while the flags are off.
 */
export function reconcileBulkLotEbayInBackgroundIfEnabled(itemId: string, why: string): void {
  if (!isBulkEbayEnabled()) return;
  reconcileBulkLotEbayInBackground(bundleDb, realBundleOps, itemId, why);
}
