/**
 * Item price audit trail and markdown-state rules shared by every Item.price writer (2026-10-29).
 *
 * Owner report: "BCW Penny Tubes are marked down when the No markdowns box is checked." Root cause: a manual
 * organizer price edit on an item a markdown cron had already cut left markdownApplied=true and the old
 * priceBeforeMarkdown in place (so every was/now display and the staff re-tag list still treated the item as
 * marked down), ticking "Keep out of automatic markdowns" only stopped FUTURE cron runs, and manual price edits
 * wrote no ItemPriceHistory row at all.
 *
 * Rules:
 *  - A manual organizer price is the true price (Patrick, 2026-09-29). Any manual price change on a marked-down
 *    item clears the markdown display state (MANUAL_PRICE_MARKDOWN_CLEAR). The cron progress pointers
 *    (markdownTierApplied / markdownStepIndexApplied) are kept so the same cron step does not immediately cut the
 *    organizer's new price again; a LATER step anchors on the new price (priceBeforeMarkdown ?? price).
 *  - Turning "Keep out of automatic markdowns" on resets the whole markdown state (EXCLUDE_MARKDOWN_RESET). The
 *    caller restores priceBeforeMarkdown as the price unless the same save sets a manual price.
 *  - Every price write records one ItemPriceHistory row (recordItemPriceHistory). The write never throws: a
 *    history failure must never fail the price change it describes.
 */

export const MANUAL_PRICE_MARKDOWN_CLEAR = {
  markdownApplied: false,
  priceBeforeMarkdown: null,
} as const;

export const EXCLUDE_MARKDOWN_RESET = {
  markdownApplied: false,
  priceBeforeMarkdown: null,
  markdownTierApplied: 0,
  markdownStepIndexApplied: null,
  markdownPhysicallyAppliedAt: null,
} as const;

export interface PriceHistoryRow {
  itemId: string;
  price: number | null | undefined;
  /** "organizer" | "markdown" | "reverseAuction" | "ebaySync" | "sync" | ... */
  changedBy: string;
  note?: string | null;
}

interface PriceHistoryClient {
  itemPriceHistory: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts PrismaClient and transaction clients alike
    create(args: any): Promise<unknown>;
  };
}

/**
 * The price a "Keep out of automatic markdowns" save restores, or null when nothing should be restored: the item
 * must be marked down right now, live (AVAILABLE), carry a positive pre-markdown price that differs from the
 * current one, and the same save must not already set a manual price (the organizer's price wins).
 */
export function markdownRestorePrice(
  item: { markdownApplied: boolean | null; status: string | null; price: number | null; priceBeforeMarkdown: number | null },
  manualPriceChanged: boolean,
): number | null {
  if (manualPriceChanged || !item.markdownApplied || item.status !== 'AVAILABLE') return null;
  const before = item.priceBeforeMarkdown;
  if (typeof before !== 'number' || !Number.isFinite(before) || before <= 0) return null;
  if (typeof item.price === 'number' && Math.abs(before - item.price) < 0.005) return null;
  return before;
}

export async function recordItemPriceHistory(
  client: PriceHistoryClient,
  rows: PriceHistoryRow | PriceHistoryRow[],
): Promise<void> {
  const list = (Array.isArray(rows) ? rows : [rows]).filter(
    (r) => typeof r.price === 'number' && Number.isFinite(r.price),
  );
  for (const r of list) {
    try {
      await client.itemPriceHistory.create({
        data: { itemId: r.itemId, price: r.price as number, changedBy: r.changedBy, note: r.note ?? null },
      });
    } catch (err) {
      console.warn(`[priceHistory] could not record price history for item ${r.itemId}:`, err instanceof Error ? err.message : err);
    }
  }
}
