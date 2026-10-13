/**
 * soldElsewhereUnitSale.ts -- the one shared "a sale was seen on another market: take exactly ONE unit" step
 * (2026-10-13, S-SINGLE-INVENTORY-NUMBER).
 *
 * The platform owns ONE in-stock number: inStock = COALESCE(Item.stockTotal, 1) - Item.stockSold. A sale detected on a
 * market with no quantity API (Discogs, Reverb, a Facebook card, an operator correction ...) used to mark a MULTI-unit item
 * fully SOLD and withdraw it everywhere. Every sold-elsewhere path now goes through facebookNativeSaleService's
 * commitFacebookNativeSale, which calls takeSoldElsewhereUnit() below for any item holding more than one unit:
 *
 *  - ONE transaction holding the Item row lock: status check, idempotency marker, guarded sellItemUnits(itemId, 1, tx);
 *  - idempotency (no new table): an optional `dedupeKey` is written as a ProcessedWebhookEvent row (the existing
 *    idempotency table, eventId is its primary key) INSIDE the same transaction, so a repeated poll / duplicate event hits
 *    the key (createMany skipDuplicates -> count 0) and takes no second unit, and a rolled-back sale leaves no marker.
 *    Key shape: `sold-unit:<SOURCE>:<externalEventId>:<itemId>` (kept 1 year by webhookEventPruneJob, see there);
 *  - single-unit items (stockTotal null/1), CONSIGNOR_TAG items and anything unreadable return `{ kind: 'single' }` so the
 *    caller runs its legacy whole-item SOLD path unchanged. Bulk lots are refused earlier by the caller (lotChannelRefusal).
 *
 * Per-listing platforms that have a MarketplaceListingJob row (Vinted, Mercari, Poshmark, Grailed, Facebook) keep their own
 * live-row idempotency inside commitPlatformUnitSale; this module serves the markets that have no such row
 * (Discogs, Reverb, operator route) and any caller that has no platform at all.
 *
 * Never touches listings: it only moves the stock number. Whether a listing is withdrawn stays with the caller, and only the
 * last unit (fullySoldOut) lets the caller run the full sold fan-out.
 */

import { prisma } from '../lib/prisma';
import { sellItemUnits } from './itemStockService';
import { InsufficientStockError } from './itemStockErrors';

export type SoldElsewhereUnitOutcome =
  | { kind: 'single' }
  | { kind: 'noop'; reason: string; counted?: boolean }
  | { kind: 'sold'; fullySoldOut: boolean; remainingStock: number };

/** Item kinds that keep their own sale path and are never unit-sold from here. */
const OWN_PATH_LISTING_TYPES = new Set(['CONSIGNOR_TAG']);

/**
 * Takes one unit of a multi-unit item for a sale seen on another market. See the file header.
 * `dedupeKey` omitted = no event identity is available (the caller accepts that a repeat takes another unit).
 */
export async function takeSoldElsewhereUnit(itemId: string, dedupeKey?: string | null): Promise<SoldElsewhereUnitOutcome> {
  try {
    return await prisma.$transaction(async (txRaw) => {
      const tx = txRaw as any;
      const rows: Array<{ status: string; stockTotal: number | null; listingType?: string | null }> | undefined = await tx.$queryRaw`
        SELECT "status"::text AS "status", "stockTotal", "listingType" FROM "Item" WHERE "id" = ${itemId} FOR UPDATE
      `;
      const row = rows?.[0];
      if (!row || (row.stockTotal ?? 1) <= 1 || OWN_PATH_LISTING_TYPES.has(String(row.listingType ?? ''))) {
        return { kind: 'single' } as SoldElsewhereUnitOutcome;
      }
      if (!['AVAILABLE', 'RESERVED', 'INVOICE_ISSUED'].includes(row.status)) {
        return { kind: 'noop', reason: `item_status_${row.status}` } as SoldElsewhereUnitOutcome;
      }
      if (dedupeKey) {
        const claimed = await tx.processedWebhookEvent.createMany({
          data: [{ eventId: dedupeKey, status: 'COMPLETED' }],
          skipDuplicates: true,
        });
        if (!claimed || claimed.count === 0) {
          return { kind: 'noop', reason: 'event_already_counted', counted: true } as SoldElsewhereUnitOutcome;
        }
      }
      const r = await sellItemUnits(itemId, 1, tx);
      return { kind: 'sold', fullySoldOut: r.fullySoldOut, remainingStock: r.remainingStock } as SoldElsewhereUnitOutcome;
    });
  } catch (err: any) {
    // The transaction rolled back (marker included). An oversell race means stock was already gone: nothing to take.
    if (err instanceof InsufficientStockError) return { kind: 'noop', reason: 'insufficient_stock' };
    throw err;
  }
}

/**
 * Fire-and-forget: re-push the item's in-stock number to every market (services/inventoryStockSync.syncItemStock never
 * throws). Loaded lazily so a unit sale never fails, and module load stays light, if that module is unavailable.
 */
export function fireItemStockSync(itemId: string, reason: string): void {
  (async () => {
    const mod = await import('./inventoryStockSync');
    await mod.syncItemStock(itemId, reason);
  })().catch((err: any) => console.warn(`[StockSync] syncItemStock (${reason}) failed for item ${itemId}:`, err?.message));
}
