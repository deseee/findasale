/**
 * saleReopenService.ts -- generic "the marketplace sale was cancelled, make the item available again" (2026-10-10).
 *
 * Before this, an item marked SOLD by a marketplace sale that later fell through (a Facebook Marketplace buyer
 * who never showed, a cancelled Mercari transaction) was stuck SOLD: commitItemSale blocks every transition away
 * from SOLD (ADR-098, NOT loosened), bulk status refuses SOLD, and the only narrow doors were eBay (verified against
 * eBay live) and off-platform manual sales. This service is the door for the other marketplaces.
 *
 * Only the organizer-attested channels are handled HERE (eBay and off-platform manual are delegated by the
 * controller to their own verified paths). There is no cancellation API for these channels in the codebase, so
 * the organizer must pass an explicit confirm flag. Etsy's receipts reader only lists paid, not-cancelled receipts
 * and has no per-receipt cancellation check, so Etsy is attested too.
 *
 * REFUSED outright (money moved on FindA.Sale rails, those need the refund flow): lastSoldVia STRIPE or POS, any
 * PAID non-test Purchase, multi-quantity items, bulk-lot items, and any lastSoldVia value this file does not know.
 *
 * Re-sell protection (no schema change):
 *   - a MarketplaceListingJob marker row (REMOVE / REMOVED, lastErrorMessage REOPEN_MARKER) is written in the SAME
 *     transaction, BEFORE the item flips, for channels whose sold signal comes from the extension or sold emails;
 *     saleReopenGuard.ts makes commitFacebookNativeSale ignore a sold report that names the cancelled listing;
 *   - EbaySoldEvent / EtsySoldEvent ledger rows are never touched (that is what stops those syncs re-selling);
 *   - the Reverb / Discogs order polls ignore cancelled and refunded orders.
 * Only Item.status / stockSold / ebayQuantitySold / lastSoldVia change here (stockSold and ebayQuantitySold go DOWN by the cancelled units, floored at 0, never reset); afterwards the stock sync (inventoryStockSync) relists an ended eBay listing. No sold notification is fired.
 */

import { prisma } from '../lib/prisma';
import { createNotification } from '../lib/notificationService';
import { lotChannelRefusal } from './bulkLot/bulkLotInvariants';
import { isBulkLotsEnabled } from './bulkLot/bulkLotConfig';
import { organizerEditStampAlways } from '../utils/organizerEdit';
import { REOPEN_MARKER, SOLD_VIA_TO_JOB_PLATFORM } from './saleReopenGuard';

/** Channels whose cancellation the organizer attests to. Label is shown to the organizer. */
export const ATTESTED_SOLD_VIA: Record<string, string> = {
  FB_NATIVE: 'Facebook Marketplace',
  FB_EMAIL_ORDER: 'Facebook Marketplace',
  MERCARI: 'Mercari',
  VINTED: 'Vinted',
  ETSY: 'Etsy',
  POSHMARK: 'Poshmark',
  GRAILED: 'Grailed',
  REVERB: 'Reverb',
  DISCOGS: 'Discogs',
};

/** Sold on FindA.Sale's own payment rails: never reopened here, refund instead. */
export const RAILS_SOLD_VIA = ['STRIPE', 'POS'];

export type SoldChannelKind = 'EBAY' | 'OFF_PLATFORM' | 'ATTESTED' | 'UNTAGGED' | 'RAILS' | 'UNKNOWN';

export function classifySoldChannel(lastSoldVia: string | null | undefined): { kind: SoldChannelKind; label: string } {
  const via = (lastSoldVia ?? '').trim();
  if (!via) return { kind: 'UNTAGGED', label: 'the marketplace where it sold' };
  if (via === 'EBAY') return { kind: 'EBAY', label: 'eBay' };
  if (via === 'OFF_PLATFORM_MANUAL') return { kind: 'OFF_PLATFORM', label: 'outside FindA.Sale' };
  if (RAILS_SOLD_VIA.includes(via)) return { kind: 'RAILS', label: via === 'POS' ? 'the register' : 'FindA.Sale checkout' };
  if (ATTESTED_SOLD_VIA[via]) return { kind: 'ATTESTED', label: ATTESTED_SOLD_VIA[via] };
  return { kind: 'UNKNOWN', label: via };
}

export type SaleReopenCode =
  | 'NOT_FOUND'
  | 'NOT_SOLD'
  | 'PAID_ON_PLATFORM'
  | 'PAID_PURCHASE'
  | 'MULTI_QUANTITY'
  | 'BULK_LOT'
  | 'BULK_CHECK_FAILED'
  | 'EBAY_LEDGER'
  | 'UNKNOWN_CHANNEL'
  | 'CONFIRMATION_REQUIRED'
  | 'RACE';

export type SaleReopenResult =
  | { ok: true; itemId: string; marketplace: string }
  | { ok: false; status: number; code: SaleReopenCode; message: string; requiresConfirmation?: boolean; marketplace?: string };

const fail = (
  status: number,
  code: SaleReopenCode,
  message: string,
  extra: { requiresConfirmation?: boolean; marketplace?: string } = {}
): SaleReopenResult => ({ ok: false, status, code, message, ...extra });

/** Units given back by one attested cancellation: a sold-elsewhere report always takes exactly one unit. */
const REOPEN_UNITS = 1;

export interface SaleReopenOptions {
  organizerId: string;
  actorUserId: string;
  /** Explicit organizer attestation that the sale was cancelled on the marketplace. */
  confirm: boolean;
}

export async function reopenAttestedSale(itemId: string, opts: SaleReopenOptions): Promise<SaleReopenResult> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { id: true, title: true, status: true, lastSoldVia: true, saleId: true, stockTotal: true },
  });
  if (!item) return fail(404, 'NOT_FOUND', 'Item not found');
  if (item.status !== 'SOLD') {
    return fail(409, 'NOT_SOLD', 'This item is not marked sold, so there is nothing to reopen.');
  }

  const channel = classifySoldChannel(item.lastSoldVia);
  if (channel.kind === 'RAILS') {
    return fail(
      409,
      'PAID_ON_PLATFORM',
      `This item sold through ${channel.label}, so money moved through FindA.Sale. It cannot be reopened here. Refund the sale instead and the item returns to available.`
    );
  }
  if (channel.kind === 'UNKNOWN') {
    return fail(409, 'UNKNOWN_CHANNEL', 'FindA.Sale does not recognize where this sale was recorded, so it cannot be reopened here. Contact support.');
  }
  if (channel.kind !== 'ATTESTED' && channel.kind !== 'UNTAGGED') {
    // EBAY / OFF_PLATFORM are delegated by the controller to their own verified paths; reaching here is a caller bug.
    return fail(409, 'UNKNOWN_CHANNEL', 'This sale must be reopened through its own path.');
  }

  if ((item.stockTotal ?? 1) > 1) {
    return fail(409, 'MULTI_QUANTITY', 'Multi-quantity items cannot be reopened automatically. Adjust stock on the item instead.');
  }

  const lot = await lotChannelRefusal(prisma as any, itemId, 'FACEBOOK_NATIVE', isBulkLotsEnabled());
  if (lot) {
    return lot.code === 'BULK_CHECK_FAILED'
      ? fail(503, 'BULK_CHECK_FAILED', lot.message)
      : fail(409, 'BULK_LOT', 'A bulk lot sells by the card at the register and cannot be reopened here.');
  }

  const paid = await prisma.purchase.findFirst({
    where: { itemId, status: 'PAID', isTestTransaction: false },
    select: { id: true },
  });
  if (paid) {
    return fail(409, 'PAID_PURCHASE', 'This item has a completed FindA.Sale purchase, so it stays sold. Refund the sale instead and the item returns to available.');
  }

  if (channel.kind === 'UNTAGGED') {
    // No marketplace tag: an eBay sale recorded before tagging existed has ledger rows and must go through the eBay path.
    const ebayEvents = await prisma.ebaySoldEvent.count({ where: { itemId } });
    if (ebayEvents > 0) {
      return fail(409, 'EBAY_LEDGER', 'This item has an eBay sale on record. Reopen it from eBay instead, where the cancellation is verified.');
    }
  }

  if (opts.confirm !== true) {
    return fail(
      409,
      'CONFIRMATION_REQUIRED',
      `FindA.Sale cannot check ${channel.label} for you. Confirm the sale was cancelled there to mark this item available again.`,
      { requiresConfirmation: true, marketplace: channel.label }
    );
  }

  const via = (item.lastSoldVia ?? '').trim();
  const markerPlatform = SOLD_VIA_TO_JOB_PLATFORM[via];

  const flipped = await prisma.$transaction(async (tx: any) => {
    // Marker first, in the same transaction: no moment exists where the item is AVAILABLE without it.
    if (markerPlatform) {
      await tx.marketplaceListingJob.create({
        data: {
          itemId,
          action: 'REMOVE',
          status: 'REMOVED',
          platform: markerPlatform,
          lastAttemptAt: new Date(),
          lastErrorMessage: REOPEN_MARKER,
        },
      });
    }
    // Single inventory number (2026-10-13): give back ONLY the units of the cancelled sale (never "stockSold = 0", which would restore the
    // whole stock of a multi-unit item sold out over several orders). One attested cancellation is one unit (every sold-elsewhere report
    // takes exactly one), and multi-quantity items are refused above, so the guard on stockTotal here only closes the race where the
    // total was raised between the read and this write. The item returns to AVAILABLE because the freed unit leaves inStock at 1.
    const updated = await tx.item.updateMany({
      where: {
        id: itemId,
        status: 'SOLD',
        lastSoldVia: via ? via : null,
        OR: [{ stockTotal: null }, { stockTotal: { lte: 1 } }],
      },
      data: {
        status: 'AVAILABLE',
        stockSold: { decrement: REOPEN_UNITS },
        ebayQuantitySold: { decrement: REOPEN_UNITS }, // the same units off the eBay counter (floored below), not a reset
        lastSoldVia: null,
        ...organizerEditStampAlways(),
      },
    });
    if (updated.count === 0) throw new Error('REOPEN_RACE');
    // Floor both counters at zero (a legacy SOLD item whose ledger was never incremented would otherwise go to -1).
    await tx.$executeRaw`UPDATE "Item" SET "stockSold" = GREATEST("stockSold", 0), "ebayQuantitySold" = GREATEST("ebayQuantitySold", 0) WHERE "id" = ${itemId} AND ("stockSold" < 0 OR "ebayQuantitySold" < 0)`;
    return true;
  }).catch((err: any) => {
    if (err?.message === 'REOPEN_RACE') return false;
    throw err;
  });
  if (!flipped) {
    return fail(409, 'RACE', 'The item changed while it was being reopened. Refresh and try again.');
  }

  // Single inventory number (2026-10-13): the unit is back in stock, so kits that contain it are recomputed and every market follows
  // the one in-stock number (an eBay listing that was ended when the item sold is relisted with the right quantity). Fire-and-forget.
  import('./inventoryStockSync')
    .then((m) => m.syncItemStock(itemId, 'reopen'))
    .catch((err: unknown) => console.warn(`[Sale Reopen] stock sync failed for item ${itemId}:`, (err as Error)?.message));

  console.log(
    `[Sale Reopen] REOPENED item ${itemId} ("${item.title}") channel=${via || 'UNTAGGED'} actor=${opts.actorUserId} ` +
      `organizer=${opts.organizerId} attested=true -- ledger rows kept, eBay relisted by the stock sync when it was ended`
  );

  // Informational only (NOT a sold notification). Best-effort.
  try {
    const organizer = await prisma.organizer.findUnique({ where: { id: opts.organizerId }, select: { userId: true } });
    if (organizer) {
      await createNotification({
        userId: organizer.userId,
        type: 'SALE_UPDATE',
        title: 'Sale cancelled, item available again',
        body: `"${item.title}" is marked available again after the ${channel.label} sale was cancelled. An eBay listing that was ended when it sold is relisted automatically; relist it yourself on any other marketplace where you want it.`,
        link: item.saleId ? `/organizer/sales/${item.saleId}` : '/organizer/inventory',
      });
    }
  } catch (err: any) {
    console.warn(`[Sale Reopen] notification failed for item ${itemId}:`, err?.message);
  }

  return { ok: true, itemId, marketplace: channel.label };
}
