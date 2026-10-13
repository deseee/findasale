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
 *   5. (2026-10-13) MULTI-UNIT item (stock > 1): the order takes exactly ONE unit and nothing is withdrawn anywhere; only the unit that
 *      empties the stock runs the step 4 cascade. The item stays AVAILABLE and keeps its discogsListingId, so the same order matches again
 *      on every poll: the dedupe key `sold-unit:DISCOGS:<orderId>:<itemId>` (ProcessedWebhookEvent, see soldElsewhereUnitSale.ts) makes the
 *      repeat a no-op.
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
  commitSale?: (itemId: string, orderId: string) => Promise<{ alreadyCommitted: boolean; partial?: boolean }>;
  notify?: (organizerId: string, item: { id: string; title: string; saleId: string | null }, orderId: string, partial?: boolean) => Promise<void>;
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

/**
 * Pure: which listed items do these orders sell? Every distinct live order that contains a listed listing is returned (one entry per
 * order + item). There is deliberately NO per-listing dedupe: on a multi-unit listing a second order must take its own unit, and a
 * repeat of an order across polls is stopped downstream by the per-order dedupeKey ('sold-unit:DISCOGS:<orderId>:<itemId>', see
 * defaultCommitSale). A single-unit item sells once: the second commit returns alreadyCommitted.
 */
export function matchDiscogsOrdersToItems(
  orders: DiscogsOrder[],
  items: Array<{ id: string; discogsListingId: string }>,
): Array<{ itemId: string; orderId: string }> {
  const byListing = new Map<string, string>();
  for (const it of items) if (it.discogsListingId) byListing.set(String(it.discogsListingId), it.id);
  const out: Array<{ itemId: string; orderId: string }> = [];
  const seenPairs = new Set<string>(); // the SAME order listing the same item twice in one payload is one sale, never two units
  for (const o of orders) {
    if (isCancelledDiscogsOrderStatus(o.status)) continue;
    for (const li of o.items ?? []) {
      const itemId = byListing.get(String(li.id));
      if (!itemId) continue;
      const pair = `${o.id}:${itemId}`;
      if (seenPairs.has(pair)) continue;
      seenPairs.add(pair);
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

async function defaultCommitSale(itemId: string, orderId: string) {
  const r = await commitFacebookNativeSale(itemId, SOLD_VIA_DISCOGS, {
    skipWithdraw: ['DISCOGS'],
    dedupeKey: `sold-unit:${SOLD_VIA_DISCOGS}:${orderId}:${itemId}`, // multi-unit items only; one order takes one unit once
  });
  return { alreadyCommitted: r.alreadyCommitted, partial: r.partial === true };
}

async function defaultNotify(organizerId: string, item: { id: string; title: string; saleId: string | null }, orderId: string, partial = false) {
  const organizer = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { userId: true } });
  if (!organizer?.userId) return;
  await createNotification({
    userId: organizer.userId,
    type: 'SALE_UPDATE',
    title: 'Item sold on Discogs',
    body: partial
      ? `One unit of "${item.title}" sold on Discogs (order ${orderId}). Your stock count was reduced by one and your other listings stay up.`
      : `"${item.title}" sold on Discogs (order ${orderId}) and has been marked as sold. It is being removed from your other marketplaces.`,
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
    const { alreadyCommitted, partial = false } = await commitSale(m.itemId, m.orderId);
    if (alreadyCommitted) {
      result.alreadySold++;
      continue;
    }
    result.sold.push(m);
    const item = itemById.get(m.itemId)!;
    console.log(`[Discogs Sync] Item ${m.itemId} ("${item.title}") sold via Discogs order ${m.orderId} -- ${partial ? 'took one unit, item stays AVAILABLE' : 'marked SOLD'}`);
    await notify(organizerId, item, m.orderId, partial).catch((err: any) =>
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
