// Live-listing state per (item, platform) from MarketplaceListingJob rows (2026-10-27).
//
// One answer to "is there a live listing of item I on platform P, which row holds it, its listing id, and how many units does
// it show", for every reader that used to treat "latest non-SKIPPED row is POST/POSTED" as "live".
//
// Why: Poshmark keeps a Multi Item listing up after one unit sells. commitPlatformUnitSale (facebookNativeSaleService.ts)
// records that unit sale as a REMOVE/REMOVED row tagged sold_on_poshmark, so that REMOVE row becomes the latest row while the
// listing is still for sale with the remaining units. A latest-row reader then stops seeing it: the sold-out removal fan-out,
// the POLICY_INELIGIBLE / UNPUBLISHED sweeps, price and quantity sync and item deletion all skipped a listing that was live.
// The unit-sale REMOVE row is left as it is (it is the idempotency key of the unit sale, the input of singleUnitRepost.ts and
// the sold-e-mail guards); the readers ask this module instead.
//
// Rules (REMOVE/SKIPPED rows are failed removal attempts and never count):
//  - latest row POST/POSTED: live, held by that row, showing syncedQuantity units (NULL = 1);
//  - latest row a sold_on_<platform> unit sale on a QUANTITY platform (Poshmark): live while the newest POST/POSTED row's
//    syncedQuantity minus the sold_on_<platform> rows after it is above 0 (singleUnitRepost.unitsLeftOnQuantityListing);
//  - anything else (removed, sold out, never posted): not live.
//
// syncedQuantity on a quantity platform's POST row is a BASELINE: the units the listing showed when it was posted or last
// confirmed, PLUS the unit sales on the platform since the POST (they were taken off the listing by the platform itself). A
// confirmation that the listing now shows N units therefore stores N + (sold_on rows after the POST): syncedQuantityToStore.
// eBay is not here: its listings and quantity live on Item (ebayListingId / Inventory API), not in MarketplaceListingJob.

import { prisma } from '../lib/prisma';
import { QUANTITY_LISTING_PLATFORMS, isSoldOnPlatformRow, unitsLeftOnQuantityListing, type ListingJobRow } from './singleUnitRepost';

export interface LiveListingRow extends ListingJobRow {
  id?: string;
  remoteListingId?: string | null;
  priceSyncedAt?: Date | null;
  renewDueAt?: Date | null;
}

export interface LiveListing<T extends LiveListingRow = LiveListingRow> {
  /** The POST/POSTED row that holds the live listing (its id, priceSyncedAt, renewDueAt, remoteListingId). */
  postRow: T;
  remoteListingId: string | null;
  /** Units the listing shows now (1 for a one-unit listing). */
  unitsShowing: number;
  /** True when the latest row is a unit sale on the platform and the Multi Item listing still shows units. */
  afterUnitSale: boolean;
}

const tsOf = (d: Date | string): number => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const isSkippedRow = (r: ListingJobRow) => r.action === 'REMOVE' && r.status === 'SKIPPED';
const isPostedRow = (r: ListingJobRow) => r.action === 'POST' && r.status === 'POSTED';
const newestOf = <T extends ListingJobRow>(rows: readonly T[]): T | null =>
  rows.reduce<T | null>((a, b) => (!a || tsOf(b.createdAt) > tsOf(a.createdAt) ? b : a), null);
const qtyOf = (q: number | null | undefined): number => (typeof q === 'number' && Number.isFinite(q) ? Math.max(Math.floor(q), 0) : 1);

/** True for platforms whose listing carries its own quantity (a unit sale there leaves the listing up). */
export function isQuantityListingPlatform(platform: string): boolean {
  return QUANTITY_LISTING_PLATFORMS.includes(String(platform));
}

/** The live listing of one item on one platform, from that item+platform's rows (any order), or null. Pure. */
export function liveListingFromRows<T extends LiveListingRow>(rows: readonly T[], platform: string): LiveListing<T> | null {
  const live = (rows || []).filter((r) => r && !isSkippedRow(r));
  const latest = newestOf(live);
  if (!latest) return null;
  if (isPostedRow(latest)) {
    return { postRow: latest, remoteListingId: latest.remoteListingId ?? null, unitsShowing: qtyOf(latest.syncedQuantity), afterUnitSale: false };
  }
  if (!isQuantityListingPlatform(platform) || !isSoldOnPlatformRow(latest, platform)) return null;
  const units = unitsLeftOnQuantityListing(live, platform);
  if (units <= 0) return null;
  const post = newestOf(live.filter(isPostedRow));
  if (!post) return null;
  return { postRow: post, remoteListingId: post.remoteListingId ?? null, unitsShowing: units, afterUnitSale: true };
}

/** liveListingFromRows for many items/platforms at once, keyed `${itemId}:${platform}` (only live ones are present). Pure. */
export function liveListingsByItemPlatform<T extends LiveListingRow & { itemId: string; platform: string }>(rows: readonly T[]): Map<string, LiveListing<T>> {
  const grouped = new Map<string, T[]>();
  for (const r of rows || []) {
    if (!r) continue;
    const key = `${r.itemId}:${r.platform}`;
    const list = grouped.get(key);
    if (list) list.push(r); else grouped.set(key, [r]);
  }
  const out = new Map<string, LiveListing<T>>();
  for (const [key, list] of grouped) {
    const platform = key.slice(key.lastIndexOf(':') + 1);
    const l = liveListingFromRows(list, platform);
    if (l) out.set(key, l);
  }
  return out;
}

/** Live platforms per item id, from a liveListingsByItemPlatform map. */
export function livePlatformsByItem(live: Map<string, LiveListing<any>>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const key of live.keys()) {
    const sep = key.lastIndexOf(':');
    const itemId = key.slice(0, sep);
    const arr = out.get(itemId) || [];
    arr.push(key.slice(sep + 1));
    out.set(itemId, arr);
  }
  return out;
}

/** sold_on_<platform> unit-sale rows written after the newest POST/POSTED row. 0 on a one-unit platform. Pure. */
export function unitSalesSinceNewestPost(rows: readonly ListingJobRow[], platform: string): number {
  if (!isQuantityListingPlatform(platform)) return 0;
  const live = (rows || []).filter((r) => r && !isSkippedRow(r));
  const post = newestOf(live.filter(isPostedRow));
  if (!post) return 0;
  return live.filter((r) => tsOf(r.createdAt) > tsOf(post.createdAt) && isSoldOnPlatformRow(r, platform)).length;
}

/** The syncedQuantity to store on the newest POST row when the listing is confirmed to show `shownQuantity` units. Pure. */
export function syncedQuantityToStore(rows: readonly ListingJobRow[], platform: string, shownQuantity: number): number {
  return Math.max(Math.floor(shownQuantity), 0) + unitSalesSinceNewestPost(rows, platform);
}

export const LIVE_LISTING_ROW_SELECT = {
  id: true, action: true, status: true, createdAt: true, lastErrorMessage: true, syncedQuantity: true, remoteListingId: true, priceSyncedAt: true,
} as const;

type LoadedRow = LiveListingRow & { id: string };

/** Loads every row of one item+platform (for liveListingFromRows / syncedQuantityToStore). Throws on a DB error. */
export async function loadListingRows(itemId: string, platform: string, db: any = prisma): Promise<LoadedRow[]> {
  return db.marketplaceListingJob.findMany({ where: { itemId, platform }, select: LIVE_LISTING_ROW_SELECT });
}

/**
 * For callers that already read the latest non-SKIPPED row with findFirst: when that row is a unit sale on a quantity
 * platform, returns the still-live Multi Item listing (loads the item+platform rows), else null. No extra query otherwise.
 */
export async function liveListingAfterUnitSale(
  itemId: string,
  platform: string,
  latest: { action: string; status: string; lastErrorMessage?: string | null } | null | undefined,
  db: any = prisma,
): Promise<LiveListing<LoadedRow> | null> {
  if (!latest || !isQuantityListingPlatform(platform)) return null;
  if (!isSoldOnPlatformRow({ action: latest.action, status: latest.status, createdAt: new Date(0), lastErrorMessage: latest.lastErrorMessage ?? null }, platform)) return null;
  const rows = await loadListingRows(itemId, platform, db);
  const live = liveListingFromRows(rows, platform);
  return live && live.afterUnitSale ? live : null;
}
