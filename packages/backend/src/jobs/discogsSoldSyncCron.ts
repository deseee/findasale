/**
 * discogsSoldSyncCron.ts -- Poll Discogs for the organizer's own seller orders and mark the
 * matching FindA.Sale items SOLD (2026-09-23).
 *
 * Before this, nothing learned that an item sold ON Discogs: the item stayed AVAILABLE and kept
 * its live eBay / Shopify / Facebook / Poshmark / Mercari / Craigslist / Vinted listings (42 items
 * carried a live discogsListingId in prod, zero SOLD ones ever had one). Mirrors ebaySoldSyncCron:
 *   1. every organizer with an ACTIVE DISCOGS MarketplaceAccount (the stored personal access token
 *      already used to create/delete listings);
 *   2. skip cheaply (no API call) when none of their AVAILABLE items has a discogsListingId;
 *   3. GET /marketplace/orders (newest 50) and match each order item's LISTING id to
 *      Item.discogsListingId, organizer-scoped. Cancelled orders are ignored;
 *   4. commit through commitFacebookNativeSale(itemId, 'DISCOGS', { skipWithdraw: ['DISCOGS'] }):
 *      SOLD via the ADR-098 guard, lastSoldVia 'DISCOGS', eBay + Shopify withdrawn, the Discogs
 *      listing itself left alone (it is the one that sold). The extension's getPendingRemovals
 *      then pulls every still-POSTED platform. Idempotent: a repeat is alreadyCommitted.
 *
 * Every 15 minutes, offset from the eBay poll. Organizers are processed sequentially.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { fetchRecentDiscogsSellerOrders } from '../services/marketplace/discogsListingConnector';
import { commitFacebookNativeSale } from '../services/facebookNativeSaleService';
import { createNotification } from '../lib/notificationService';

export const SOLD_VIA_DISCOGS = 'DISCOGS';

type DiscogsOrder = { id: string; status: string; items: Array<{ id: string }> };

export interface DiscogsSoldSyncDeps {
  loadListedItems?: (organizerId: string) => Promise<Array<{ id: string; title: string; saleId: string | null; discogsListingId: string }>>;
  fetchOrders?: (organizerId: string) => Promise<DiscogsOrder[] | null>;
  commitSale?: (itemId: string) => Promise<{ alreadyCommitted: boolean }>;
  notify?: (organizerId: string, item: { id: string; title: string; saleId: string | null }, orderId: string) => Promise<void>;
}

export interface DiscogsSoldSyncResult {
  checkedOrders: number;
  sold: Array<{ itemId: string; orderId: string }>;
  alreadySold: number;
}

/** Discogs order statuses that mean the sale did not happen. */
export function isCancelledDiscogsOrderStatus(status: string): boolean {
  return /^cancel/i.test(String(status ?? '').trim());
}

/** Pure: which listed items do these orders sell? First live order per listing wins. */
export function matchDiscogsOrdersToItems(
  orders: DiscogsOrder[],
  items: Array<{ id: string; discogsListingId: string }>,
): Array<{ itemId: string; orderId: string }> {
  const byListing = new Map<string, string>();
  for (const it of items) if (it.discogsListingId) byListing.set(String(it.discogsListingId), it.id);
  const out: Array<{ itemId: string; orderId: string }> = [];
  const seen = new Set<string>();
  for (const o of orders) {
    if (isCancelledDiscogsOrderStatus(o.status)) continue;
    for (const li of o.items ?? []) {
      const itemId = byListing.get(String(li.id));
      if (!itemId || seen.has(itemId)) continue;
      seen.add(itemId);
      out.push({ itemId, orderId: o.id });
    }
  }
  return out;
}

async function defaultLoadListedItems(organizerId: string) {
  const rows = await prisma.item.findMany({
    where: {
      status: 'AVAILABLE',
      deletedAt: null,
      discogsListingId: { not: null },
      OR: [{ sale: { organizerId, deletedAt: null } }, { saleId: null, organizerId }],
    },
    select: { id: true, title: true, saleId: true, discogsListingId: true },
  });
  return rows.map((r: any) => ({ id: r.id, title: r.title, saleId: r.saleId, discogsListingId: String(r.discogsListingId) }));
}

async function defaultCommitSale(itemId: string) {
  const r = await commitFacebookNativeSale(itemId, SOLD_VIA_DISCOGS, { skipWithdraw: ['DISCOGS'] });
  return { alreadyCommitted: r.alreadyCommitted };
}

async function defaultNotify(organizerId: string, item: { id: string; title: string; saleId: string | null }, orderId: string) {
  const organizer = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { userId: true } });
  if (!organizer?.userId) return;
  await createNotification({
    userId: organizer.userId,
    type: 'SALE_UPDATE',
    title: 'Item sold on Discogs',
    body: `"${item.title}" sold on Discogs (order ${orderId}) and has been marked as sold. It is being removed from your other marketplaces.`,
    link: item.saleId ? `/organizer/sales/${item.saleId}` : `/organizer/inventory`,
    sendEmail: true,
  });
}

export async function syncDiscogsSoldItemsForOrganizer(
  organizerId: string,
  deps: DiscogsSoldSyncDeps = {},
): Promise<DiscogsSoldSyncResult> {
  const loadListedItems = deps.loadListedItems ?? defaultLoadListedItems;
  const fetchOrders = deps.fetchOrders ?? ((id: string) => fetchRecentDiscogsSellerOrders(id));
  const commitSale = deps.commitSale ?? defaultCommitSale;
  const notify = deps.notify ?? defaultNotify;

  const result: DiscogsSoldSyncResult = { checkedOrders: 0, sold: [], alreadySold: 0 };
  const items = await loadListedItems(organizerId);
  if (!items.length) return result; // nothing live on Discogs -- no API call

  const orders = await fetchOrders(organizerId);
  if (!orders) return result; // no ACTIVE Discogs connection
  result.checkedOrders = orders.length;

  const itemById = new Map(items.map((i) => [i.id, i]));
  for (const m of matchDiscogsOrdersToItems(orders, items)) {
    const { alreadyCommitted } = await commitSale(m.itemId);
    if (alreadyCommitted) {
      result.alreadySold++;
      continue;
    }
    result.sold.push(m);
    const item = itemById.get(m.itemId)!;
    console.log(`[Discogs Sync] Item ${m.itemId} ("${item.title}") sold via Discogs order ${m.orderId} -- marked SOLD`);
    await notify(organizerId, item, m.orderId).catch((err: any) =>
      console.error(`[Discogs Sync] Failed to notify organizer ${organizerId} for item ${m.itemId}:`, err?.message)
    );
  }
  return result;
}

async function syncDiscogsSoldItems(): Promise<void> {
  const accounts = await prisma.marketplaceAccount.findMany({
    where: { platform: 'DISCOGS', status: 'ACTIVE' },
    select: { organizerId: true },
  });
  for (const { organizerId } of accounts) {
    try {
      const r = await syncDiscogsSoldItemsForOrganizer(organizerId);
      if (r.sold.length) console.log(`[Discogs Sync] Organizer ${organizerId}: ${r.sold.length} item(s) marked SOLD from ${r.checkedOrders} order(s)`);
    } catch (err: any) {
      // One organizer's failure (expired token, rate limit) never blocks the others.
      console.error(`[Discogs Sync ERROR] organizer ${organizerId}:`, err?.message || err);
    }
  }
}

export function startDiscogsSoldSyncCron(): void {
  cron.schedule('7,22,37,52 * * * *', cronGuard({ jobName: 'discogsSoldSyncCron' }, async () => {
    await syncDiscogsSoldItems();
  }));
  console.log('[Discogs Sync] Cron registered -- runs every 15 minutes');
}
