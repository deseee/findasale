/**
 * Bulk lots in exports and platform sends (ADR-136 Addendum C, roadmap #659). Pure of I/O: the database is injected.
 *
 * A bulk lot is a count of cards sold by the thousand (Item.price is dollars per 1,000 cards, Item.stockTotal is cards).
 * Every outside platform and every feed reads one Item as one thing with one price, so a lot sent to them would be a
 * listing priced at "$8.00" that is really $8.00 per 1,000 cards, with a card count read as a unit quantity. So every
 * export, feed and platform send LEAVES LOTS OUT and says so. The only platform that can sell a lot is eBay, as
 * fixed-size bundles (bulkLotEbayService), which is not an export.
 *
 * The lot lookup (findBulkLotItemIds) runs whatever the flags say, fails open when CARD_BULK_LOTS_ENABLED is off (a
 * missing table before the migration cannot break an existing export) and fails closed when it is on.
 */
import { findBulkLotItemIds, type BulkLotDb } from './bulkLotService';

/** The reason shown next to a lot that was left out. */
export const BULK_LOT_EXPORT_REASON = 'Bulk lot: sold by the card at your counter and on your storefront, so it is not included in this export.';

export interface SkippedBulkLot {
  itemId: string;
  title: string;
  reason: string;
}

export interface BulkLotPartition<T> {
  kept: T[];
  skipped: SkippedBulkLot[];
}

/** Splits `items` into the ones an export may include and the bulk lots it must leave out. */
export async function partitionBulkLots<T extends { id: string; title?: string | null }>(
  db: Pick<BulkLotDb, 'itemBulkLot'>,
  items: readonly T[],
  flagOn: boolean
): Promise<BulkLotPartition<T>> {
  const lotIds = await findBulkLotItemIds(db, items.map((i) => i.id), flagOn);
  if (lotIds.size === 0) return { kept: [...items], skipped: [] };
  const kept: T[] = [];
  const skipped: SkippedBulkLot[] = [];
  for (const item of items) {
    if (lotIds.has(item.id)) skipped.push({ itemId: item.id, title: item.title ?? 'Bulk lot', reason: BULK_LOT_EXPORT_REASON });
    else kept.push(item);
  }
  return { kept, skipped };
}

/** "2 bulk lots were left out of this export: ..." (null when nothing was skipped). */
export function skippedLotsSummary(skipped: ReadonlyArray<SkippedBulkLot>): string | null {
  if (skipped.length === 0) return null;
  const noun = skipped.length === 1 ? 'bulk lot was' : 'bulk lots were';
  return `${skipped.length} ${noun} left out of this export. Bulk lots are sold by the card at your counter and on your storefront.`;
}

/** The message when an export has nothing left because every item was a bulk lot. */
export function allLotsMessage(skipped: ReadonlyArray<SkippedBulkLot>): string {
  return skipped.length === 1
    ? 'The only item here is a bulk lot. Bulk lots are sold by the card at your counter and on your storefront, so there is nothing to export.'
    : 'Every item here is a bulk lot. Bulk lots are sold by the card at your counter and on your storefront, so there is nothing to export.';
}

/** Response headers a download can carry (the body of a CSV, XLSX or text file has no room for a note). Plain ASCII, no commas in the text. */
export function skippedLotsHeaders(skipped: ReadonlyArray<SkippedBulkLot>): Record<string, string> {
  if (skipped.length === 0) return {};
  return {
    'X-Skipped-Bulk-Lots': String(skipped.length),
    'X-Skipped-Bulk-Lots-Reason': 'Bulk lots are sold by the card at your counter and on your storefront and are not included in this export.',
    'Access-Control-Expose-Headers': 'X-Skipped-Bulk-Lots, X-Skipped-Bulk-Lots-Reason, Content-Disposition',
  };
}

export interface MarketplaceLotRefusal {
  status: number;
  code: 'BULK_LOT_NOT_SUPPORTED' | 'BULK_CHECK_FAILED';
  message: string;
}

/**
 * Gate for a marketplace that cannot sell a lot (Etsy, Shopify, Discogs, Reverb, the poster): null when none of `itemIds`
 * is a bulk lot, otherwise the plain-language refusal to send back. A failed lookup refuses (503) when the flag is on and
 * lets the request through when it is off (findBulkLotItemIds fails open then). Never throws.
 */
export async function lotRefusalForPlatform(
  db: Pick<BulkLotDb, 'itemBulkLot'>,
  platformName: string,
  itemIds: ReadonlyArray<string | null | undefined>,
  flagOn: boolean
): Promise<MarketplaceLotRefusal | null> {
  try {
    const lots = await findBulkLotItemIds(db, itemIds, flagOn);
    if (lots.size === 0) return null;
    return {
      status: 409,
      code: 'BULK_LOT_NOT_SUPPORTED',
      message: `Bulk lots cannot be listed on ${platformName}. They are sold by the card at your counter and on your storefront, and by the bundle on eBay.`,
    };
  } catch {
    return { status: 503, code: 'BULK_CHECK_FAILED', message: 'Could not check whether this item is a bulk lot. Try again in a moment.' };
  }
}
