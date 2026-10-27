// Repost on single-quantity marketplaces (2026-10-27, Patrick: "can the auto queue auto repost items with multiple qty but
// only to the sites like vinted and the others where they don't have a qty available?").
//
// FindA.Sale keeps ONE stock number per item (Item.stockTotal - Item.stockSold). On a marketplace whose listing is always one
// unit (Mercari, Grailed, Facebook as the extension posts it), a sale there ends that listing; when the item still has stock,
// the auto queue (GET /extension/autolist-queue) offers a fresh listing of the same item on that marketplace, one live
// listing at a time. A unit sale writes a REMOVE/REMOVED row tagged "sold_on_<platform>" (facebookNativeSaleService.ts
// commitPlatformUnitSale), so the platform's latest MarketplaceListingJob row is what tells us the listing sold.
//
// Research (2026-10-27), per platform:
//  - MERCARI: one unit per listing ("Mercari only supports quantity of 1 per listing", Nifty docs). Sold listing closes.
//  - GRAILED: one item per listing; Grailed removes duplicate live listings of the same product, so one at a time only.
//  - FACEBOOK: the composer offers "List as single item" / "List as in stock"; the extension never sets "in stock" (no
//    code touches that control), so every FindA.Sale Facebook listing is a single item and a sale marks it Sold.
//  - POSHMARK: has Single Item / Multi Item with a quantity (live). A Multi Item listing stays up after one unit sells, so
//    it must NOT be reposted while it still has units (owner rule 2026-10-27: Poshmark and eBay keep their own quantity).
//  - CRAIGSLIST / GUMTREE_AU: classified ads with no sale signal (no sold_on_* row is ever written) and spam rules against
//    reposting the same ad; one ad covers every unit. Never reposted by this rule.
//  - VINTED: one item per listing ("The same items can't be listed twice on Vinted"), but Vinted has no auto queue (drafts
//    only, owner decision 1.0.63) and fas-vinted.js carries a legal ban on any relist/repost automation. Not included.
// Pure helpers only (no prisma), so they are unit-testable.

/** Auto queue platforms whose listing is always ONE unit and whose sale is detected, so a sold listing may be replaced. */
export const SINGLE_UNIT_REPOST_PLATFORMS: readonly string[] = ['MERCARI', 'GRAILED', 'FACEBOOK'];

/** Platforms whose listing carries its own quantity: a listing posted with more than one unit stays live after a sale. */
export const QUANTITY_LISTING_PLATFORMS: readonly string[] = ['POSHMARK'];

export interface ListingJobRow {
  action: string;
  status: string;
  createdAt: Date | string;
  lastErrorMessage?: string | null;
  syncedQuantity?: number | null;
}

export type ListingState =
  /** Latest row is a live POST/POSTED listing. */
  | 'listed'
  /** The organizer's Resync closed it; never auto-relisted (organizer decision 2026-09-30). */
  | 'resync_hold'
  /** The organizer deactivated it on Mercari to free listing slots (2026-10-21); held until they re-add it themselves. */
  | 'deactivated_hold'
  /** A Multi Item listing sold some units and still shows the rest on the platform. */
  | 'multi_unit_listing_live'
  /** The one-unit listing sold and stock remains: offer a fresh listing. */
  | 'repost_after_sale'
  /** The listing sold but no stock remains (the item is on its way to SOLD everywhere). */
  | 'sold_no_stock'
  /** The listing sold on a platform this rule does not repost on. */
  | 'sold_not_reposted'
  /** No live listing for another reason (never posted, removed by the organizer or the removal engine). */
  | 'not_listed';

const ts = (d: Date | string): number => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const isSkipped = (r: ListingJobRow) => r.action === 'REMOVE' && r.status === 'SKIPPED';
const isPosted = (r: ListingJobRow) => r.action === 'POST' && r.status === 'POSTED';
const isRemoved = (r: ListingJobRow) => r.action === 'REMOVE' && r.status === 'REMOVED';

/** True when this REMOVE/REMOVED row is a sale ON `platform` (unit sale or whole-item sale seen there). */
export function isSoldOnPlatformRow(row: ListingJobRow | null | undefined, platform: string): boolean {
  if (!row || !isRemoved(row)) return false;
  return String(row.lastErrorMessage ?? '').startsWith(`sold_on_${String(platform).toLowerCase()}`);
}

/**
 * Units still showing on a Multi Item listing after sales on it: the quantity of the newest POST/POSTED row (as posted or
 * last verified) minus the sold_on_<platform> rows written after it. 0 when the listing was a single unit or is sold out.
 */
export function unitsLeftOnQuantityListing(rows: ListingJobRow[], platform: string): number {
  const live = rows.filter((r) => !isSkipped(r)).slice().sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
  const post = live.find(isPosted);
  if (!post) return 0;
  const posted = typeof post.syncedQuantity === 'number' && Number.isFinite(post.syncedQuantity) ? Math.floor(post.syncedQuantity) : 1;
  if (posted <= 1) return 0;
  const soldSince = live.filter((r) => ts(r.createdAt) > ts(post.createdAt) && isSoldOnPlatformRow(r, platform)).length;
  return Math.max(posted - soldSince, 0);
}

/**
 * The auto queue's view of one item on one platform, from ALL of that item's MarketplaceListingJob rows for the platform
 * (any order). REMOVE/SKIPPED rows are failed removal attempts and never count (same rule as getExtensionItems).
 */
export function listingStateForAutoQueue(rows: ListingJobRow[], platform: string, stockRemaining: number): ListingState {
  const live = (rows || []).filter((r) => r && !isSkipped(r));
  if (live.length === 0) return 'not_listed';
  const latest = live.reduce((a, b) => (ts(b.createdAt) > ts(a.createdAt) ? b : a));
  if (isPosted(latest)) return 'listed';
  if (!isRemoved(latest)) return 'not_listed';
  if (String(latest.lastErrorMessage ?? '').startsWith('resync:')) return 'resync_hold';
  // 2026-10-27 (Patrick: "mercari has a 100 listing threshhold"): a listing deactivated "to free listing slots" still exists on
  // Mercari as inactive; offering it again would refill the slot the organizer just freed (and duplicate the inactive copy).
  if (String(latest.lastErrorMessage ?? '').startsWith('Deactivated on Mercari')) return 'deactivated_hold';
  if (!isSoldOnPlatformRow(latest, platform)) return 'not_listed';
  if (QUANTITY_LISTING_PLATFORMS.includes(platform) && unitsLeftOnQuantityListing(live, platform) > 0) return 'multi_unit_listing_live';
  if (!(stockRemaining >= 1)) return 'sold_no_stock';
  return SINGLE_UNIT_REPOST_PLATFORMS.includes(platform) || QUANTITY_LISTING_PLATFORMS.includes(platform)
    ? 'repost_after_sale'
    : 'sold_not_reposted';
}

/** States in which the auto queue must NOT offer a new listing (one live listing per platform, holds respected). */
export function blocksAutoQueue(state: ListingState): boolean {
  return state === 'listed' || state === 'resync_hold' || state === 'deactivated_hold' || state === 'multi_unit_listing_live' || state === 'sold_no_stock' || state === 'sold_not_reposted';
}
