/**
 * Push adapter for bulk lot bundles (ADR-136 Addendum C).
 *
 * pushSaleToEbay builds an eBay inventory item and offer from an Item row: title, description, price in dollars,
 * quantity from stockTotal - stockSold, condition, tags (item specifics), package weight and size, category, shipping
 * override. For a lot those fields mean something else (a count of cards, a price per 1,000), so just before the pipeline
 * reads the row this adapter overwrites THE IN-MEMORY COPY with the bundle values (buildBundleOverlay). The database row
 * is never given those values: the lot keeps its per-1,000 price, its card counts and its DONT_LIST override (which keeps
 * it away from the browser extension and Google Merchant). The only thing written back is the eBay category, once.
 *
 * The pipeline persists exactly ebayOfferId, ebayQuantityAvailable (computed from the overlaid stockTotal and stockSold,
 * so it is the number of bundles), ebayListingId and the listing timestamps. Nothing else of the overlay can reach the row.
 */
import { buildBundleOverlay, type BundleRefusalCode, type BundleRow } from './bulkLotEbayBundle';
import { pricePerThousandCentsFromDollars } from './bulkLotPricing';

export interface PushAdapterDb {
  itemBulkLotEbayBundle: { findUnique(args: any): Promise<any> };
  itemBulkLot: { findUnique(args: any): Promise<any> };
  item: { update(args: any): Promise<any> };
}

export type PushAdapterResult =
  | { ok: true; bundles: number; priceCents: number }
  | { ok: false; code: BundleRefusalCode | 'BUNDLE_LOOKUP_FAILED'; message: string };

const BUNDLE_COLUMNS = {
  enabled: true,
  bundleSize: true,
  adjustmentBps: true,
  ebayTitle: true,
  condition: true,
  language: true,
  weightOz: true,
  lengthIn: true,
  widthIn: true,
  heightIn: true,
  dimsConfirmed: true,
} as const;

/** The fields of a pushSaleToEbay item row this adapter reads and replaces. */
export interface PushItemRow {
  id: string;
  price?: unknown;
  stockTotal?: number | null;
  stockSold?: number | null;
  ebayCategoryId?: string | null;
  ebayCategoryName?: string | null;
  [key: string]: any;
}

/** Applies the bundle overlay to `item` in place. On a refusal `item` is left exactly as it was. */
/**
 * `persistCategory: false` is for the read-only fee check, which must never write an Item.
 */
export async function applyBulkBundleOverlay(db: PushAdapterDb, item: PushItemRow, opts: { persistCategory?: boolean } = {}): Promise<PushAdapterResult> {
  let row: BundleRow | null;
  let lot: { game?: string | null; lotKind?: string | null } | null;
  try {
    row = await db.itemBulkLotEbayBundle.findUnique({ where: { itemId: item.id }, select: BUNDLE_COLUMNS });
    lot = await db.itemBulkLot.findUnique({ where: { itemId: item.id }, select: { game: true, lotKind: true } });
  } catch (err) {
    console.error(`[bulkLotEbay] bundle lookup failed for item ${item.id}:`, err);
    return { ok: false, code: 'BUNDLE_LOOKUP_FAILED', message: 'Could not read the bundle settings for this lot. Try again in a moment.' };
  }
  const priceNumber = item.price === null || item.price === undefined ? null : Number(item.price);
  const result = buildBundleOverlay({
    stockTotal: item.stockTotal,
    stockSold: item.stockSold,
    pricePerThousandCents: pricePerThousandCentsFromDollars(priceNumber),
    lot: { game: lot?.game, lotKind: lot?.lotKind },
    bundle: row,
  });
  if (!result.ok) return result;

  const previousCategoryId = item.ebayCategoryId ?? null;
  Object.assign(item, result.overlay);
  if (opts.persistCategory !== false && previousCategoryId !== result.overlay.ebayCategoryId) {
    try {
      await db.item.update({
        where: { id: item.id },
        data: { ebayCategoryId: result.overlay.ebayCategoryId, ebayCategoryName: result.overlay.ebayCategoryName },
      });
    } catch (err) {
      console.warn(`[bulkLotEbay] could not save eBay category on item ${item.id} (non-fatal):`, err instanceof Error ? err.message : err);
    }
  }
  return { ok: true, bundles: result.bundles, priceCents: result.priceCents };
}
