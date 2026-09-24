/**
 * reverbSoldSyncCron.ts -- Poll Reverb for the organizer's own seller orders and mark the matching
 * FindA.Sale items SOLD (2026-09-23). Mirrors discogsSoldSyncCron.ts.
 *
 * Before this, nothing learned that an item sold ON Reverb: the item stayed AVAILABLE and kept its
 * live eBay / Shopify / Discogs / Facebook / Poshmark / Mercari / Craigslist / Vinted listings.
 *   1. every organizer with an ACTIVE REVERB MarketplaceAccount (the stored personal access token
 *      already used to create/end listings);
 *   2. skip cheaply (no API call) when none of their AVAILABLE items has a reverbListingId;
 *   3. GET /api/my/orders/selling/all?updated_start_date=<now - LOOKBACK_DAYS> (bounded window,
 *      at most a few pages) and match each order's listing id (product_id) to Item.reverbListingId,
 *      organizer-scoped. Cancelled and refunded orders are ignored;
 *   4. commit through commitFacebookNativeSale(itemId, 'REVERB', { skipWithdraw: ['REVERB'] }):
 *      SOLD via the ADR-098 guard, lastSoldVia 'REVERB', eBay + Shopify + Discogs withdrawn, the
 *      Reverb listing itself left alone (it is the one that sold). The extension's
 *      getPendingRemovals then pulls every still-POSTED platform. Idempotent: only AVAILABLE items
 *      are loaded, and a repeat commit is alreadyCommitted.
 *
 * Order shape is from reverb-api.com/docs/retrieve-orders (fetched 2026-09-23), not yet confirmed
 * against a live response. The token needs the read_orders scope; tokens generated with only
 * public/read_listings/write_listings get a 401/403, which is logged per organizer and skipped.
 *
 * Every 15 minutes, offset from the eBay and Discogs polls. Organizers are processed sequentially.
 *
 * Stale-listing sweep (2026-09-23): items that went SOLD before withdraw-on-SOLD existed kept a live
 * Reverb listing (e.g. item cmt3ak88q01lea4xvvj0zh0ax / listing 101889751). Each run, per organizer,
 * up to REVERB_STALE_SWEEP_LIMIT SOLD, non-deleted items that still carry a reverbListingId (oldest
 * first) go through withdrawReverbListingIfExists, which ends the listing and clears the id -- so a
 * handled item never re-enters the sweep. A 404/410 from Reverb (already gone) also clears the id.
 * Any other failure leaves the item alone for this run; it is retried on a later run. Items that
 * sold ON Reverb (lastSoldVia 'REVERB') keep their listing id on purpose and are excluded.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import {
  fetchRecentReverbSellerOrders,
  ReverbSellerOrder,
  withdrawReverbListingIfExists,
  ReverbWithdrawOutcome,
} from '../services/marketplace/reverbConnector';
import { commitFacebookNativeSale } from '../services/facebookNativeSaleService';
import { createNotification } from '../lib/notificationService';

export const SOLD_VIA_REVERB = 'REVERB';
/** Orders updated within this window are examined each run. */
export const REVERB_ORDER_LOOKBACK_DAYS = 14;
/** At most this many stale SOLD-but-still-listed items are withdrawn per organizer per run. */
export const REVERB_STALE_SWEEP_LIMIT = 10;

export interface ReverbSoldSyncDeps {
  loadListedItems?: (organizerId: string) => Promise<Array<{ id: string; title: string; saleId: string | null; reverbListingId: string }>>;
  fetchOrders?: (organizerId: string, since: Date) => Promise<ReverbSellerOrder[] | null>;
  commitSale?: (itemId: string) => Promise<{ alreadyCommitted: boolean }>;
  notify?: (organizerId: string, item: { id: string; title: string; saleId: string | null }, orderNumber: string) => Promise<void>;
  now?: () => Date;
}

export interface ReverbSoldSyncResult {
  checkedOrders: number;
  sold: Array<{ itemId: string; orderNumber: string }>;
  alreadySold: number;
}

/** Reverb order statuses that mean the sale did not happen (or was reversed). */
export function isVoidReverbOrderStatus(status: string): boolean {
  // Also not-yet-sales: an unpaid / pending / blocked order can still be abandoned, so the item
  // stays AVAILABLE until Reverb reports it paid (the 14-day lookback catches it on a later poll).
  return /^(cancel|refund|unpaid|payment_pending|pending_review|blocked)/i.test(String(status ?? '').trim());
}

/** Pure: which listed items do these orders sell? First live order per listing wins. */
export function matchReverbOrdersToItems(
  orders: ReverbSellerOrder[],
  items: Array<{ id: string; reverbListingId: string }>,
): Array<{ itemId: string; orderNumber: string }> {
  const byListing = new Map<string, string>();
  for (const it of items) if (it.reverbListingId) byListing.set(String(it.reverbListingId), it.id);
  const out: Array<{ itemId: string; orderNumber: string }> = [];
  const seen = new Set<string>();
  for (const o of orders) {
    if (isVoidReverbOrderStatus(o.status)) continue;
    const itemId = o.listingId ? byListing.get(String(o.listingId)) : undefined;
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    out.push({ itemId, orderNumber: o.orderNumber });
  }
  return out;
}

async function defaultLoadListedItems(organizerId: string) {
  const rows = await prisma.item.findMany({
    where: {
      status: 'AVAILABLE',
      deletedAt: null,
      reverbListingId: { not: null },
      OR: [{ sale: { organizerId, deletedAt: null } }, { saleId: null, organizerId }],
    },
    select: { id: true, title: true, saleId: true, reverbListingId: true },
  });
  return rows.map((r: any) => ({ id: r.id, title: r.title, saleId: r.saleId, reverbListingId: String(r.reverbListingId) }));
}

async function defaultCommitSale(itemId: string) {
  const r = await commitFacebookNativeSale(itemId, SOLD_VIA_REVERB, { skipWithdraw: ['REVERB'] });
  return { alreadyCommitted: r.alreadyCommitted };
}

async function defaultNotify(organizerId: string, item: { id: string; title: string; saleId: string | null }, orderNumber: string) {
  const organizer = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { userId: true } });
  if (!organizer?.userId) return;
  await createNotification({
    userId: organizer.userId,
    type: 'SALE_UPDATE',
    title: 'Item sold on Reverb',
    body: `"${item.title}" sold on Reverb (order ${orderNumber}) and has been marked as sold. It is being removed from your other marketplaces.`,
    link: item.saleId ? `/organizer/sales/${item.saleId}` : `/organizer/inventory`,
    sendEmail: true,
  });
}

export async function syncReverbSoldItemsForOrganizer(
  organizerId: string,
  deps: ReverbSoldSyncDeps = {},
): Promise<ReverbSoldSyncResult> {
  const loadListedItems = deps.loadListedItems ?? defaultLoadListedItems;
  const fetchOrders = deps.fetchOrders ?? ((id: string, since: Date) => fetchRecentReverbSellerOrders(id, since));
  const commitSale = deps.commitSale ?? defaultCommitSale;
  const notify = deps.notify ?? defaultNotify;
  const now = deps.now ?? (() => new Date());

  const result: ReverbSoldSyncResult = { checkedOrders: 0, sold: [], alreadySold: 0 };
  const items = await loadListedItems(organizerId);
  if (!items.length) return result; // nothing live on Reverb -- no API call

  const since = new Date(now().getTime() - REVERB_ORDER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const orders = await fetchOrders(organizerId, since);
  if (!orders) return result; // no ACTIVE Reverb connection
  result.checkedOrders = orders.length;

  const itemById = new Map(items.map((i) => [i.id, i]));
  for (const m of matchReverbOrdersToItems(orders, items)) {
    const { alreadyCommitted } = await commitSale(m.itemId);
    if (alreadyCommitted) {
      result.alreadySold++;
      continue;
    }
    result.sold.push(m);
    const item = itemById.get(m.itemId)!;
    console.log(`[Reverb Sync] Item ${m.itemId} ("${item.title}") sold via Reverb order ${m.orderNumber} -- marked SOLD`);
    await notify(organizerId, item, m.orderNumber).catch((err: any) =>
      console.error(`[Reverb Sync] Failed to notify organizer ${organizerId} for item ${m.itemId}:`, err?.message)
    );
  }
  return result;
}

export interface ReverbStaleSweepDeps {
  loadStaleSoldItems?: (organizerId: string, limit: number) => Promise<Array<{ id: string }>>;
  withdraw?: (itemId: string) => Promise<ReverbWithdrawOutcome>;
}

export interface ReverbStaleSweepResult {
  checked: number;
  withdrawn: string[];
  gone: string[];
  failed: string[];
}

async function defaultLoadStaleSoldItems(organizerId: string, limit: number) {
  return prisma.item.findMany({
    where: {
      status: 'SOLD',
      deletedAt: null,
      reverbListingId: { not: null },
      AND: [
        { OR: [{ organizerId }, { sale: { organizerId } }] },
        // Sold ON Reverb: that listing is the one that sold -- never withdraw it. (An explicit null
        // branch because SQL `<> 'REVERB'` alone would drop the NULL rows this sweep exists for.)
        { OR: [{ lastSoldVia: null }, { lastSoldVia: { not: SOLD_VIA_REVERB } }] },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { id: true },
  });
}

/**
 * Withdraw live Reverb listings left on items that are already SOLD (see the header). Bounded by
 * REVERB_STALE_SWEEP_LIMIT; one attempt per item per run; never throws per item.
 */
export async function sweepStaleSoldReverbListingsForOrganizer(
  organizerId: string,
  deps: ReverbStaleSweepDeps = {},
): Promise<ReverbStaleSweepResult> {
  const loadStaleSoldItems = deps.loadStaleSoldItems ?? defaultLoadStaleSoldItems;
  const withdraw = deps.withdraw ?? withdrawReverbListingIfExists;
  const result: ReverbStaleSweepResult = { checked: 0, withdrawn: [], gone: [], failed: [] };
  const items = (await loadStaleSoldItems(organizerId, REVERB_STALE_SWEEP_LIMIT)).slice(0, REVERB_STALE_SWEEP_LIMIT);
  for (const { id } of items) {
    result.checked++;
    let outcome: ReverbWithdrawOutcome;
    try {
      outcome = await withdraw(id);
    } catch (err: any) {
      outcome = 'failed';
      console.error(`[Reverb Sync] Stale-listing withdraw threw for item ${id}:`, err?.message || err);
    }
    if (outcome === 'withdrawn') result.withdrawn.push(id);
    else if (outcome === 'gone') result.gone.push(id);
    else if (outcome === 'failed') result.failed.push(id);
  }
  return result;
}

async function syncReverbSoldItems(): Promise<void> {
  const accounts = await prisma.marketplaceAccount.findMany({
    where: { platform: 'REVERB', status: 'ACTIVE' },
    select: { organizerId: true },
  });
  for (const { organizerId } of accounts) {
    try {
      const r = await syncReverbSoldItemsForOrganizer(organizerId);
      if (r.sold.length) console.log(`[Reverb Sync] Organizer ${organizerId}: ${r.sold.length} item(s) marked SOLD from ${r.checkedOrders} order(s)`);
    } catch (err: any) {
      // One organizer's failure (revoked token, missing read_orders scope, rate limit) never blocks the others.
      console.error(`[Reverb Sync ERROR] organizer ${organizerId}:`, err?.message || err);
    }
    try {
      const s = await sweepStaleSoldReverbListingsForOrganizer(organizerId);
      if (s.checked) {
        console.log(
          `[Reverb Sync] Organizer ${organizerId}: stale SOLD listings -- ${s.withdrawn.length} withdrawn, ${s.gone.length} already gone, ${s.failed.length} failed (of ${s.checked})`
        );
      }
    } catch (err: any) {
      console.error(`[Reverb Sync ERROR] stale-listing sweep, organizer ${organizerId}:`, err?.message || err);
    }
  }
}

export function startReverbSoldSyncCron(): void {
  cron.schedule('11,26,41,56 * * * *', cronGuard({ jobName: 'reverbSoldSyncCron' }, async () => {
    await syncReverbSoldItems();
  }));
  console.log('[Reverb Sync] Cron registered -- runs every 15 minutes');
}
