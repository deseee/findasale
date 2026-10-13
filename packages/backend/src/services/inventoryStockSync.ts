/**
 * inventoryStockSync.ts -- ONE number for "in stock", owned by the platform and synced to every market (2026-10-13).
 *
 *   in stock = max(COALESCE(Item.stockTotal, 1) - Item.stockSold, 0)          (inStockOf, services/inventoryStockMath.ts)
 *
 * Nobody edits a market's count by hand. stockTotal / stockSold stay the PRIVATE internal ledger; Item.ebayQuantityAvailable
 * is a pure MIRROR of "the last quantity confirmed on eBay"; Item.ebayQuantitySold stays the eBay idempotency ledger
 * (jobs/ebaySoldSyncCron.ts). Bulk lots (cards, not units) and CONSIGNOR_TAG items are out of scope: their card counts are
 * never sent as unit quantities and their own paths are untouched.
 *
 * syncItemStock(itemId, reason, opts):
 *   - never throws, re-reads the item from the database (never trusts a caller-supplied number), safe to fire and forget;
 *   - one run per item at a time inside this process (a second call while one is running queues exactly one re-run, which
 *     reads the latest state), so two sales landing together cannot double push;
 *   - checkOnly: compares against the live market value, reports 'drift', changes NOTHING (no write, no market call that
 *     changes anything, no status flip, no kit recompute);
 *   - kits: a kit is never listed as a unit quantity anywhere (DONT_LIST on eBay); only the kits that CONTAIN this item are
 *     recomputed (recomputeKitsForComponents), on every non-checkOnly call;
 *   - eBay (items with an offer id; sale items and inventory items alike, tenant isolation by item id only):
 *       in stock >= 1  PUT the inventory item quantity (GET, merge, PUT; the real SKU comes from the offer GET, the SKU
 *                      guess is only a fallback). Skipped while the item is on hold (the field is added to ebayHeldFields so
 *                      "Update eBay now" sends it), while it is not for sale, or while eBay is rate limited. If eBay shows
 *                      LESS than we do, an eBay sale may not be absorbed yet: the eBay sold sync runs first (once per
 *                      organizer per minute), the item is re-read, and only then is the quantity decided.
 *       in stock == 0  the listing is ENDED (endEbayListingIfExists), never pushed as quantity 0, and the item becomes SOLD
 *                      when it was AVAILABLE. An already ended offer is detected first so a sweep does not end it again.
 *       restock        an AVAILABLE, published-on-FindA.Sale item whose offer is ended (we ended it at 0) is republished
 *                      with the new quantity. If that is impossible a persistent flag is left on the item
 *                      (ebaySyncState / ebaySyncFailureReason, text starts with "Stock sync:") and the outcome is 'skipped'
 *                      or 'failed', so a sweep always reports it.
 *   - Etsy: updateEtsyListingInventory (qty 0 withdraws). Shopify: the inventory level. Markets without a quantity API
 *     (Reverb, Discogs, Facebook, Craigslist, Vinted, Poshmark, Mercari, Grailed, TCGplayer): 'manual' while more than one
 *     unit is in stock, withdrawn / queued for removal at zero.
 */

import { prisma } from '../lib/prisma';
import { inStockOf } from './inventoryStockMath';
import { ebayFetch } from './ebayPublishService';
import { refreshEbayAccessToken } from './ebayHttp';
import { isEbayRateLimited, trackEbayCall } from '../lib/ebayRateLimiter';
import { buildCustomLabel, endEbayListingIfExists } from '../controllers/ebayController';
import { recomputeKitsForComponents } from './itemKitStock';
import { findBulkLotItemIds } from './bulkLot/bulkLotService';
import { isBulkLotsEnabled } from './bulkLot/bulkLotConfig';
import { isBulkEbayEnabled } from './bulkLot/bulkLotEbayConfig';
import { reconcileBulkLotEbayInBackgroundIfEnabled } from './bulkLot/bulkLotEbayWiring';
import { markShopifyItemSold, updateShopifyProductFields, getShopifyClient } from './shopifyService';
import { updateEtsyListingInventory, withdrawEtsyListingIfExists } from './marketplace/etsyConnector';
import { isEtsyConnectorEnabled } from './marketplace/etsyHttp';
import { computeEtsyQuantity } from './marketplace/etsyMapping';
import { withdrawDiscogsListingIfExists } from './marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from './marketplace/reverbConnector';
import { notifyFacebookExportedItemSold } from './facebookNudgeService';

export { inStockOf };

// ---------------------------------------------------------------------------------------------
// Contract (other agents code against these exact names and shapes)
// ---------------------------------------------------------------------------------------------

export type MarketName =
  | 'ebay'
  | 'etsy'
  | 'shopify'
  | 'kits'
  | 'reverb'
  | 'discogs'
  | 'facebook'
  | 'craigslist'
  | 'vinted'
  | 'poshmark'
  | 'mercari'
  | 'grailed'
  | 'tcgplayer';
export type MarketSyncStatus = 'synced' | 'unchanged' | 'drift' | 'ended' | 'relisted' | 'skipped' | 'failed' | 'manual';
export interface MarketSyncOutcome {
  market: MarketName;
  status: MarketSyncStatus;
  expected: number;
  live?: number | null;
  detail?: string;
}
export interface StockSyncResult {
  itemId: string;
  /** -1 only when the item could not be read at all (missing, deleted, or an unexpected failure). */
  inStock: number;
  outcomes: MarketSyncOutcome[];
}
export interface StockSyncOptions {
  /** checkOnly: compare against the live market value, report 'drift', change NOTHING. */
  checkOnly?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

/** Statuses at which an item is no longer for sale, so a market quantity is never pushed for it. */
const NOT_FOR_SALE_STATUSES: ReadonlySet<string> = new Set(['SOLD', 'DONATED', 'AUCTION_ENDED']);

/** One eBay sold sync per organizer per window, so a burst of syncs cannot hammer the Fulfillment API. */
const ABSORB_COOLDOWN_MS = 60 * 1000;
const lastAbsorb = new Map<string, { at: number; run: Promise<'ran' | 'failed'> }>();

/** How stale EbayConnection.lastEbaySoldSyncAt can be before a potential-stale-overwrite warning is logged (log only). */
const STALE_SYNC_THRESHOLD_MS = 15 * 60 * 1000;

const STOCK_FLAG_PREFIX = 'Stock sync:';

function safeText(raw: unknown, max = 300): string {
  const s = String(raw ?? '')
    .replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/[A-Za-z0-9+/_=-]{32,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function outcome(market: MarketName, status: MarketSyncStatus, expected: number, extra: { live?: number | null; detail?: string } = {}): MarketSyncOutcome {
  const o: MarketSyncOutcome = { market, status, expected };
  if (extra.live !== undefined) o.live = extra.live;
  if (extra.detail) o.detail = extra.detail;
  return o;
}

function failedOutcome(market: MarketName, expected: number, err: unknown): MarketSyncOutcome {
  return outcome(market, 'failed', expected, { detail: safeText((err as Error)?.message ?? err) });
}

const SYNC_SELECT = {
  id: true,
  status: true,
  listingType: true,
  stockTotal: true,
  stockSold: true,
  saleId: true,
  organizerId: true,
  createdAt: true,
  costBasis: true,
  roomTag: true,
  deletedAt: true,
  draftStatus: true,
  isKitComponent: true,
  ebayOfferId: true,
  ebayListingId: true,
  ebayQueuedAt: true,
  ebaySyncHeldAt: true,
  ebayHeldFields: true,
  ebaySyncState: true,
  ebaySyncFailureReason: true,
  discogsListingId: true,
  reverbListingId: true,
  fbExportedAt: true,
  card: { select: { tcgplayerQty: true } },
} as const;

async function loadItem(itemId: string) {
  return prisma.item.findUnique({ where: { id: itemId }, select: SYNC_SELECT });
}
type SyncItem = NonNullable<Awaited<ReturnType<typeof loadItem>>>;

interface SyncCtx {
  item: SyncItem;
  reason: string;
  inStock: number;
  checkOnly: boolean;
  ignoreHold: boolean;
  /** True when this call flipped the item AVAILABLE -> SOLD because stock reached zero. */
  transitioned: boolean;
  /** Organizers whose eBay sales were already absorbed during this run. */
  absorbed: Set<string>;
  isLot: () => Promise<boolean>;
}

// ---------------------------------------------------------------------------------------------
// Per-item lock (in process). One run at a time; at most one queued re-run, which re-reads the database.
// ---------------------------------------------------------------------------------------------

const queuedRuns = new Map<string, Promise<StockSyncResult>>();
const lockTails = new Map<string, Promise<unknown>>();

function runExclusive(itemId: string, fn: () => Promise<StockSyncResult>): Promise<StockSyncResult> {
  const queued = queuedRuns.get(itemId);
  if (queued) return queued; // not started yet: it will read the latest state anyway
  const tail = lockTails.get(itemId) ?? Promise.resolve();
  const run: Promise<StockSyncResult> = tail.then(() => {
    queuedRuns.delete(itemId);
    return fn();
  });
  queuedRuns.set(itemId, run);
  const settled = run.then(
    () => undefined,
    () => undefined
  );
  lockTails.set(itemId, settled);
  settled.then(() => {
    if (lockTails.get(itemId) === settled) lockTails.delete(itemId);
  });
  return run;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/**
 * Bring every market in line with the item's one in-stock number. Never throws. See the file header.
 * `reason` is free text for logs ('edit', 'sale', 'refund', 'sweep', ...).
 */
export async function syncItemStock(itemId: string, reason: string, opts: StockSyncOptions = {}): Promise<StockSyncResult> {
  return syncInternal(itemId, reason, { checkOnly: opts.checkOnly === true, ignoreHold: false });
}

/**
 * Same as syncItemStock but ignores the "Save without updating marketplaces" hold. Used only by an explicit organizer push
 * ("Update eBay now" / retry, services/ebayItemPushService.ts), where the hold is released after the push succeeds.
 */
export async function syncItemStockForPush(itemId: string, reason: string): Promise<StockSyncResult> {
  return syncInternal(itemId, reason, { checkOnly: false, ignoreHold: true });
}

async function syncInternal(itemId: string, reason: string, o: { checkOnly: boolean; ignoreHold: boolean }): Promise<StockSyncResult> {
  try {
    if (typeof itemId !== 'string' || itemId.length === 0) return { itemId: String(itemId), inStock: -1, outcomes: [] };
    // checkOnly writes nothing, so it does not need the lock.
    if (o.checkOnly) return await runSync(itemId, reason, o);
    return await runExclusive(itemId, () => runSync(itemId, reason, o).catch((err) => unexpected(itemId, reason, err)));
  } catch (err) {
    return unexpected(itemId, reason, err);
  }
}

function unexpected(itemId: string, reason: string, err: unknown): StockSyncResult {
  console.error(`[StockSync] unexpected error for item ${itemId} (${reason}):`, err);
  return { itemId, inStock: -1, outcomes: [] };
}

// ---------------------------------------------------------------------------------------------
// One run
// ---------------------------------------------------------------------------------------------

async function runSync(itemId: string, reason: string, o: { checkOnly: boolean; ignoreHold: boolean }): Promise<StockSyncResult> {
  const absorbed = new Set<string>();

  for (let pass = 0; pass < 2; pass++) {
    const item = await loadItem(itemId);
    if (!item || item.deletedAt) return { itemId, inStock: -1, outcomes: [] };
    const inStock = inStockOf(item);
    // A consignor price tag item has no unit to count anywhere.
    if (item.listingType === 'CONSIGNOR_TAG') return { itemId, inStock, outcomes: [] };

    let lotAnswer: boolean | null = null;
    const ctx: SyncCtx = {
      item,
      reason,
      inStock,
      checkOnly: o.checkOnly,
      ignoreHold: o.ignoreHold,
      transitioned: false,
      absorbed,
      isLot: async () => {
        if (lotAnswer !== null) return lotAnswer;
        try {
          lotAnswer = (await findBulkLotItemIds(prisma as any, [itemId], isBulkLotsEnabled())).has(itemId);
        } catch (lotErr) {
          // Fail closed: with the lot flag on a failed lookup throws; nothing may be sent for a possible lot.
          console.error(`[StockSync] bulk lot check failed for item ${itemId}, not syncing:`, lotErr);
          lotAnswer = true;
        }
        return lotAnswer;
      },
    };

    const outcomes: MarketSyncOutcome[] = [];

    // Kits that CONTAIN this item are recomputed on every real run (never on checkOnly).
    if (!o.checkOnly && item.isKitComponent && pass === 0) {
      try {
        await recomputeKitsForComponents(prisma as any, [itemId]);
        outcomes.push(outcome('kits', 'synced', inStock, { detail: 'kits that contain this item were recomputed' }));
      } catch (kitErr) {
        console.error(`[StockSync] kit recompute failed for item ${itemId}:`, kitErr);
        outcomes.push(failedOutcome('kits', inStock, kitErr));
      }
    }

    // A kit is never a unit listing on any market.
    if (item.listingType === 'KIT') return { itemId, inStock, outcomes };

    // Zero transition: an AVAILABLE item with nothing left is SOLD (same semantics as sellItemUnits).
    if (inStock === 0 && !o.checkOnly && item.status === 'AVAILABLE') {
      try {
        if (!(await ctx.isLot())) {
          const flipped = await prisma.item.updateMany({ where: { id: itemId, status: 'AVAILABLE' }, data: { status: 'SOLD' } });
          ctx.transitioned = flipped.count === 1;
        }
      } catch (flipErr) {
        console.error(`[StockSync] could not mark item ${itemId} SOLD at zero stock:`, flipErr);
      }
    }

    let restart = false;

    // eBay
    try {
      const step = await syncEbay(ctx);
      if (step && 'restart' in step) restart = true;
      else if (step) outcomes.push(step);
    } catch (err) {
      console.error(`[StockSync] eBay sync failed for item ${itemId}:`, err);
      outcomes.push(failedOutcome('ebay', inStock, err));
    }
    if (restart && pass === 0) continue; // eBay sales were just absorbed: decide again from fresh numbers

    // Etsy
    try {
      const e = await syncEtsy(ctx);
      if (e) outcomes.push(e);
    } catch (err) {
      outcomes.push(failedOutcome('etsy', inStock, err));
    }

    // Shopify
    try {
      const s = await syncShopify(ctx);
      if (s) outcomes.push(s);
    } catch (err) {
      outcomes.push(failedOutcome('shopify', inStock, err));
    }

    // Markets with no quantity API
    try {
      outcomes.push(...(await syncCountlessMarkets(ctx)));
    } catch (err) {
      console.error(`[StockSync] countless-market pass failed for item ${itemId}:`, err);
    }

    if (outcomes.some((x) => x.status === 'failed' || x.status === 'drift')) {
      console.warn(`[StockSync] item ${itemId} (${reason}) in stock ${inStock}: ${outcomes.map((x) => `${x.market}=${x.status}`).join(', ')}`);
    }
    return { itemId, inStock, outcomes };
  }

  // Unreachable in practice (pass 1 never restarts), kept so the function always returns.
  return { itemId, inStock: -1, outcomes: [] };
}

// ---------------------------------------------------------------------------------------------
// eBay
// ---------------------------------------------------------------------------------------------

async function resolveOrganizerId(item: SyncItem): Promise<string | null> {
  if (item.saleId) {
    const sale = await prisma.sale.findUnique({ where: { id: item.saleId }, select: { organizerId: true } });
    if (sale?.organizerId) return sale.organizerId;
  }
  return item.organizerId ?? null;
}

interface EbayLive {
  organizerId: string;
  token: string;
  sku: string;
  published: boolean;
  /** eBay's own availableQuantity on the offer (used at zero stock, where the inventory item is not read). */
  offerQty: number | null;
  lastSoldSyncAt: Date | null;
}

async function ebayOpenOffer(ctx: SyncCtx): Promise<{ ok: true; live: EbayLive } | { ok: false; out: MarketSyncOutcome }> {
  const { item, inStock } = ctx;
  const skip = (detail: string): { ok: false; out: MarketSyncOutcome } => ({ ok: false, out: outcome('ebay', 'skipped', inStock, { detail }) });
  if (isEbayRateLimited()) return skip('eBay daily call limit reached, will retry on the next sync');
  const organizerId = await resolveOrganizerId(item);
  if (!organizerId) return skip('no seller account found for this item');
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: {
      id: true,
      skuAppendDate: true,
      skuAppendCost: true,
      skuAppendLocation: true,
      ebayConnection: { select: { lastEbaySoldSyncAt: true } },
    },
  });
  if (!organizer?.ebayConnection) return skip('no eBay account connected');
  const token = await refreshEbayAccessToken(organizer.id);
  if (!token) return { ok: false, out: outcome('ebay', 'failed', inStock, { detail: 'could not refresh the eBay token, reconnect eBay' }) };

  const offerRes = await ebayFetch(`/sell/inventory/v1/offer/${encodeURIComponent(item.ebayOfferId as string)}`, token);
  trackEbayCall();
  if (!offerRes.ok) {
    const body = await offerRes.text().catch(() => '');
    if (offerRes.status === 404) return skip('the eBay offer no longer exists');
    return { ok: false, out: outcome('ebay', 'failed', inStock, { detail: `eBay did not return the offer (HTTP ${offerRes.status}) ${safeText(body, 160)}`.trim() }) };
  }
  const offer = ((await offerRes.json().catch(() => ({}))) ?? {}) as any;
  const published = String(offer?.status ?? '').toUpperCase() === 'PUBLISHED' || (!offer?.status && !!offer?.listing?.listingId);
  const sku: string = typeof offer?.sku === 'string' && offer.sku ? offer.sku : buildCustomLabel(item.id, organizer, item);
  const offerQty = typeof offer?.availableQuantity === 'number' && Number.isFinite(offer.availableQuantity) ? offer.availableQuantity : null;
  return { ok: true, live: { organizerId, token, sku, published, offerQty, lastSoldSyncAt: organizer.ebayConnection.lastEbaySoldSyncAt ?? null } };
}

async function writeEbayMirror(itemId: string, qty: number, clearStockFlag: boolean): Promise<void> {
  const data: Record<string, unknown> = { ebayQuantityAvailable: qty };
  if (clearStockFlag) {
    data.ebaySyncState = 'SYNCED';
    data.ebaySyncFailureReason = null;
  }
  try {
    await prisma.item.updateMany({ where: { id: itemId }, data: data as any });
  } catch (err) {
    console.warn(`[StockSync] could not record the eBay quantity mirror for item ${itemId}:`, (err as Error).message);
  }
}

/** Leave a persistent, visible flag: the item has stock but eBay cannot show it. */
async function flagStockProblem(itemId: string, message: string): Promise<void> {
  try {
    await prisma.item.updateMany({
      where: { id: itemId },
      data: { ebaySyncState: 'FAILED_RETRYABLE', ebaySyncFailureReason: `${STOCK_FLAG_PREFIX} ${message}`.slice(0, 500) } as any,
    });
  } catch (err) {
    console.warn(`[StockSync] could not flag item ${itemId}:`, (err as Error).message);
  }
}

async function markQuantityHeld(item: SyncItem): Promise<void> {
  if ((item.ebayHeldFields ?? []).includes('quantity')) return;
  try {
    await prisma.item.updateMany({
      where: { id: item.id, NOT: { ebayHeldFields: { has: 'quantity' } } },
      data: { ebayHeldFields: { push: 'quantity' } },
    });
  } catch (err) {
    console.warn(`[StockSync] could not record the held quantity for item ${item.id}:`, (err as Error).message);
  }
}

/**
 * Run the eBay sold sync for one organizer (once per cooldown window). 'cooldown' means a run just finished OK. A run that is
 * still in flight, or that failed inside the window, is shared with later callers (so they wait for it, and a failure is reported as
 * 'failed' again instead of being mistaken for "sales already absorbed", which would let a stale higher number overwrite eBay).
 */
async function absorbEbaySales(organizerId: string): Promise<'ran' | 'cooldown' | 'failed'> {
  const last = lastAbsorb.get(organizerId);
  if (last !== undefined && Date.now() - last.at < ABSORB_COOLDOWN_MS) {
    const earlier = await last.run;
    return earlier === 'ran' ? 'cooldown' : 'failed';
  }
  const run: Promise<'ran' | 'failed'> = (async () => {
    try {
      const mod = await import('../jobs/ebaySoldSyncCron');
      await mod.syncSoldItemsForOrganizer(organizerId);
      return 'ran' as const;
    } catch (err) {
      console.error(`[StockSync] eBay sold sync before a quantity push failed for organizer ${organizerId}:`, err);
      return 'failed' as const;
    }
  })();
  lastAbsorb.set(organizerId, { at: Date.now(), run });
  return run;
}

async function syncEbay(ctx: SyncCtx): Promise<MarketSyncOutcome | { restart: true } | null> {
  const { item, inStock } = ctx;
  if (!item.ebayOfferId && !item.ebayListingId) return null; // never listed on eBay

  // Bulk lots: a lot's number is a CARD count, never a unit quantity. A lot with an eBay bundle is reconciled by the bundle
  // service (whole bundles, ends below one bundle); with the bundle flag off nothing is sent.
  if (await ctx.isLot()) {
    if (!ctx.checkOnly && item.ebayOfferId) {
      if (isBulkEbayEnabled()) reconcileBulkLotEbayInBackgroundIfEnabled(item.id, ctx.reason);
      else console.warn(`[StockSync] Item ${item.id} is a bulk lot and eBay bundles are off: not revising eBay quantity`);
    }
    return outcome('ebay', 'skipped', inStock, { detail: 'bulk lot: its eBay bundle quantity is managed by the lot' });
  }

  // ---- zero stock: END the listing, never send quantity 0 ----
  if (inStock === 0) return ebayZero(ctx);

  // ---- stock >= 1 ----
  if (NOT_FOR_SALE_STATUSES.has(item.status)) {
    return outcome('ebay', 'skipped', inStock, { detail: 'the item is no longer for sale, so its eBay listing was not changed' });
  }
  if (!item.ebayOfferId) {
    return outcome('ebay', 'manual', inStock, { detail: 'this eBay listing was not created through FindA.Sale, so its quantity can only be changed on eBay' });
  }
  if (!ctx.checkOnly && item.ebaySyncHeldAt && !ctx.ignoreHold) {
    await markQuantityHeld(item);
    return outcome('ebay', 'skipped', inStock, { detail: 'eBay sync is paused for this item; the quantity is held until you update eBay' });
  }

  const opened = await ebayOpenOffer(ctx);
  if (!opened.ok) return opened.out;
  const live = opened.live;

  // Ended offer (we ended it at zero stock, or it was ended some other way).
  if (!live.published) return ebayEndedOffer(ctx, live);

  // Read eBay's live quantity from the inventory item.
  const invPath = `/sell/inventory/v1/inventory_item/${encodeURIComponent(live.sku)}`;
  const invGet = await ebayFetch(invPath, live.token);
  trackEbayCall();
  if (!invGet.ok) {
    const body = await invGet.text().catch(() => '');
    return outcome('ebay', 'failed', inStock, { detail: `eBay did not return the inventory item (HTTP ${invGet.status}) ${safeText(body, 160)}`.trim() });
  }
  const invObject = ((await invGet.json().catch(() => ({}))) ?? {}) as Record<string, any>;
  const rawLive = Number(invObject?.availability?.shipToLocationAvailability?.quantity);
  const liveQty = Number.isFinite(rawLive) ? rawLive : null;

  if (liveQty !== null && liveQty === inStock) {
    if (!ctx.checkOnly) {
      await writeEbayMirror(item.id, inStock, (item.ebaySyncFailureReason ?? '').startsWith(STOCK_FLAG_PREFIX));
    }
    return outcome('ebay', 'unchanged', inStock, { live: liveQty });
  }
  if (ctx.checkOnly) return outcome('ebay', 'drift', inStock, { live: liveQty });

  // Stale-overwrite guard: eBay shows LESS than we do, so an eBay sale may not be absorbed into the pool yet. Absorb first,
  // re-read, then decide. When the sold sync cannot run, nothing is pushed and the next sweep repeats.
  if (liveQty !== null && liveQty < inStock && !ctx.absorbed.has(live.organizerId)) {
    const staleMs = live.lastSoldSyncAt ? Date.now() - live.lastSoldSyncAt.getTime() : Infinity;
    if (staleMs > STALE_SYNC_THRESHOLD_MS) {
      console.warn(`[StockSync] potential-stale-overwrite: item ${item.id} organizer ${live.organizerId} lastEbaySoldSyncAt=${live.lastSoldSyncAt ? live.lastSoldSyncAt.toISOString() : 'never'}`);
    }
    const result = await absorbEbaySales(live.organizerId);
    if (result === 'failed') {
      return outcome('ebay', 'skipped', inStock, { live: liveQty, detail: 'eBay shows fewer than FindA.Sale and the eBay sales check could not run, so nothing was overwritten' });
    }
    ctx.absorbed.add(live.organizerId);
    return { restart: true };
  }

  // Push the platform number to eBay (GET, merge, PUT: the PUT replaces the whole inventory item).
  const existingAvailability = (invObject.availability as Record<string, unknown> | undefined) ?? {};
  const existingShipTo = (existingAvailability.shipToLocationAvailability as Record<string, unknown> | undefined) ?? {};
  invObject.availability = { ...existingAvailability, shipToLocationAvailability: { ...existingShipTo, quantity: inStock } };
  const put = await ebayFetch(invPath, live.token, { method: 'PUT', body: invObject });
  trackEbayCall();
  if (!put.ok && put.status !== 204) {
    const body = await put.text().catch(() => '');
    return outcome('ebay', 'failed', inStock, { live: liveQty, detail: `eBay did not accept the quantity (HTTP ${put.status}) ${safeText(body, 200)}`.trim() });
  }
  await writeEbayMirror(item.id, inStock, (item.ebaySyncFailureReason ?? '').startsWith(STOCK_FLAG_PREFIX));
  console.log(`[StockSync] eBay quantity ${liveQty ?? 'unknown'} -> ${inStock} for item ${item.id} sku=${live.sku} (${ctx.reason})`);
  return outcome('ebay', 'synced', inStock, { live: inStock });
}

/** Stock is zero: end the eBay listing (never push quantity 0). */
async function ebayZero(ctx: SyncCtx): Promise<MarketSyncOutcome> {
  const { item } = ctx;
  const expected = 0;

  // An offer that is already ended needs nothing (a sweep must not end it again).
  let precheckPublished: boolean | null = null;
  let offerQty: number | null = null;
  if (item.ebayOfferId) {
    try {
      const opened = await ebayOpenOffer(ctx);
      if (opened.ok) {
        precheckPublished = opened.live.published;
        offerQty = opened.live.offerQty;
      } else if (isEbayRateLimited()) {
        return opened.out; // rate limited: nothing is sent, the next sync repeats
      }
    } catch (err) {
      console.warn(`[StockSync] could not read the eBay offer for item ${item.id} before ending it:`, (err as Error).message);
    }
  }

  if (ctx.checkOnly) {
    if (precheckPublished === null) return outcome('ebay', 'skipped', expected, { detail: 'could not read the live eBay listing' });
    return precheckPublished
      ? outcome('ebay', 'drift', expected, { live: offerQty, detail: 'the eBay listing is still live but nothing is in stock' })
      : outcome('ebay', 'unchanged', expected, { live: 0 });
  }

  if (precheckPublished === false) {
    await writeEbayMirror(item.id, 0, false);
    return outcome('ebay', 'unchanged', expected, { live: 0, detail: 'the eBay listing was already ended' });
  }
  if (precheckPublished === null && !item.ebayOfferId && !ctx.transitioned && item.status === 'SOLD') {
    // Legacy listing with no offer: ending it uses the Trading API. Only attempted on the sell-out itself.
    return outcome('ebay', 'unchanged', expected, { detail: 'legacy eBay listing, ended when the item sold out' });
  }

  const ended = await endEbayListingIfExists(item.id);
  if (ended === true) {
    await writeEbayMirror(item.id, 0, false);
    return outcome('ebay', 'ended', expected, { live: 0 });
  }
  if (ended === null) return outcome('ebay', 'unchanged', expected, { detail: 'no live eBay listing to end' });
  return outcome('ebay', 'failed', expected, { detail: 'eBay did not end the listing, will retry on the next sync' });
}

/** Stock >= 1 but the eBay offer is not published. Relist it when that is clearly what the organizer wants. */
async function ebayEndedOffer(ctx: SyncCtx, live: EbayLive): Promise<MarketSyncOutcome> {
  const { item, inStock } = ctx;
  if (item.status !== 'AVAILABLE') {
    return outcome('ebay', 'skipped', inStock, { live: 0, detail: 'the eBay listing is ended and the item is not available' });
  }
  const relistable = !!item.ebayListingId && item.draftStatus === 'PUBLISHED' && !item.ebayQueuedAt;
  if (ctx.checkOnly) {
    return outcome('ebay', 'drift', inStock, {
      live: 0,
      detail: relistable ? 'the eBay listing is ended but stock is available; it will be relisted' : 'the eBay offer is not published (queued, draft or never listed)',
    });
  }
  if (!relistable) {
    return outcome('ebay', 'skipped', inStock, { live: 0, detail: 'the eBay offer is not published (queued, draft or never listed), so it was not relisted' });
  }

  // Relist: set the quantity on the inventory item, then publish the existing offer again.
  const invPath = `/sell/inventory/v1/inventory_item/${encodeURIComponent(live.sku)}`;
  const invGet = await ebayFetch(invPath, live.token);
  trackEbayCall();
  if (!invGet.ok) {
    const msg = `the eBay listing is ended and the inventory item could not be read (HTTP ${invGet.status}); relist it on eBay`;
    await flagStockProblem(item.id, msg);
    return outcome('ebay', 'skipped', inStock, { live: 0, detail: msg });
  }
  const invObject = ((await invGet.json().catch(() => ({}))) ?? {}) as Record<string, any>;
  const availability = (invObject.availability as Record<string, unknown> | undefined) ?? {};
  const shipTo = (availability.shipToLocationAvailability as Record<string, unknown> | undefined) ?? {};
  invObject.availability = { ...availability, shipToLocationAvailability: { ...shipTo, quantity: inStock } };
  const put = await ebayFetch(invPath, live.token, { method: 'PUT', body: invObject });
  trackEbayCall();
  if (!put.ok && put.status !== 204) {
    const body = await put.text().catch(() => '');
    const msg = `eBay did not accept the restocked quantity (HTTP ${put.status}) ${safeText(body, 160)}`.trim();
    await flagStockProblem(item.id, msg);
    return outcome('ebay', 'failed', inStock, { live: 0, detail: msg });
  }
  const pub = await ebayFetch(`/sell/inventory/v1/offer/${encodeURIComponent(item.ebayOfferId as string)}/publish`, live.token, { method: 'POST', body: {} });
  trackEbayCall();
  if (!pub.ok) {
    const body = await pub.text().catch(() => '');
    const msg = `eBay did not relist the item (HTTP ${pub.status}) ${safeText(body, 200)}`.trim();
    await flagStockProblem(item.id, msg);
    return outcome('ebay', 'failed', inStock, { live: 0, detail: msg });
  }
  const pubJson = ((await pub.json().catch(() => ({}))) ?? {}) as any;
  const newListingId = typeof pubJson?.listingId === 'string' && pubJson.listingId ? pubJson.listingId : null;
  try {
    await prisma.item.updateMany({
      where: { id: item.id },
      data: {
        ebayQuantityAvailable: inStock,
        ebayRenewalAnchorAt: new Date(), // a new listing id starts a new GTC renewal cycle
        ebayNextRenewalAt: null,
        ...(newListingId ? { ebayListingId: newListingId } : {}),
        ...((item.ebaySyncFailureReason ?? '').startsWith(STOCK_FLAG_PREFIX) ? { ebaySyncState: 'SYNCED' as const, ebaySyncFailureReason: null } : {}),
      },
    });
  } catch (err) {
    console.warn(`[StockSync] relisted item ${item.id} but could not record it:`, (err as Error).message);
  }
  console.log(`[StockSync] relisted item ${item.id} on eBay with quantity ${inStock} (${ctx.reason})`);
  return outcome('ebay', 'relisted', inStock, { live: inStock });
}

// ---------------------------------------------------------------------------------------------
// Etsy
// ---------------------------------------------------------------------------------------------

async function syncEtsy(ctx: SyncCtx): Promise<MarketSyncOutcome | null> {
  const { item, inStock } = ctx;
  const row = await prisma.etsyListing.findUnique({ where: { itemId: item.id } });
  if (!row) return null;
  if (await ctx.isLot()) return outcome('etsy', 'skipped', inStock, { detail: 'bulk lot: never sent to Etsy as a unit quantity' });
  const state = String(row.state);
  const expected = computeEtsyQuantity({ stockTotal: item.stockTotal, stockSold: item.stockSold });

  if (!isEtsyConnectorEnabled(process.env)) {
    return outcome('etsy', 'skipped', inStock === 0 ? 0 : expected, { detail: 'the Etsy connector is off' });
  }

  if (inStock === 0) {
    if (ctx.checkOnly) {
      return ['ACTIVE', 'DRAFT_READY', 'DRAFT_PENDING', 'PUBLISHING', 'FAILED'].includes(state) && row.etsyListingId
        ? outcome('etsy', 'drift', 0, { live: row.syncedQuantity ?? null, detail: 'the Etsy listing is still live but nothing is in stock' })
        : outcome('etsy', 'unchanged', 0, { live: 0 });
    }
    const w = await withdrawEtsyListingIfExists(item.id);
    if (w === 'withdrawn' || w === 'gone') return outcome('etsy', 'ended', 0, { live: 0 });
    if (w === 'failed') return outcome('etsy', 'failed', 0, { detail: 'Etsy did not end the listing, will retry on the next sync' });
    return outcome('etsy', 'unchanged', 0, { detail: 'no live Etsy listing to end' });
  }

  if (NOT_FOR_SALE_STATUSES.has(item.status)) {
    return outcome('etsy', 'skipped', expected, { detail: 'the item is no longer for sale, so its Etsy listing was not changed' });
  }
  if (!row.etsyListingId || !['ACTIVE', 'DRAFT_READY'].includes(state)) {
    return outcome('etsy', 'skipped', expected, { detail: `the Etsy listing is ${state.toLowerCase()}, so it was not changed` });
  }
  const synced = typeof row.syncedQuantity === 'number' ? row.syncedQuantity : null;
  if (ctx.checkOnly) {
    return synced === expected ? outcome('etsy', 'unchanged', expected, { live: synced }) : outcome('etsy', 'drift', expected, { live: synced, detail: 'live value is the last quantity sent to Etsy' });
  }
  if (synced === expected) return outcome('etsy', 'unchanged', expected, { live: synced });
  const r = await updateEtsyListingInventory(item.id);
  if (r.outcome === 'updated') return outcome('etsy', 'synced', expected, { live: expected });
  if (r.outcome === 'skipped' && r.reason === 'unchanged') return outcome('etsy', 'unchanged', expected, { live: expected });
  if (r.outcome === 'failed') return outcome('etsy', 'failed', expected, { detail: safeText(r.detail ?? r.reason ?? 'Etsy did not accept the quantity') });
  return outcome('etsy', 'skipped', expected, { detail: `Etsy quantity not sent (${r.reason ?? 'skipped'})` });
}

// ---------------------------------------------------------------------------------------------
// Shopify
// ---------------------------------------------------------------------------------------------

async function readShopifyLive(listing: { shopifyVariantId: string | null; organizer: any }): Promise<number | null> {
  if (!listing.shopifyVariantId || !listing.organizer) return null;
  try {
    const client = getShopifyClient(listing.organizer);
    const resp = await client.get(`/variants/${listing.shopifyVariantId}.json`);
    const q = resp.data?.variant?.inventory_quantity;
    return typeof q === 'number' && Number.isFinite(q) ? q : null;
  } catch (err) {
    console.warn('[StockSync] could not read the live Shopify quantity:', (err as Error).message);
    return null;
  }
}

async function syncShopify(ctx: SyncCtx): Promise<MarketSyncOutcome | null> {
  const { item, inStock } = ctx;
  const listing = await prisma.shopifyListing.findUnique({ where: { itemId: item.id }, include: { organizer: true } });
  if (!listing) return null;
  if (await ctx.isLot()) return outcome('shopify', 'skipped', inStock, { detail: 'bulk lot: never sent to Shopify as a unit quantity' });

  if (inStock === 0) {
    if (listing.status !== 'ACTIVE') return outcome('shopify', 'unchanged', 0, { live: 0 });
    if (ctx.checkOnly) return outcome('shopify', 'drift', 0, { live: await readShopifyLive(listing), detail: 'the Shopify listing is still active but nothing is in stock' });
    await markShopifyItemSold(item.id);
    return outcome('shopify', 'ended', 0, { live: 0 });
  }

  if (listing.status === 'REMOVED') return outcome('shopify', 'skipped', inStock, { detail: 'the Shopify product was removed' });
  if (NOT_FOR_SALE_STATUSES.has(item.status)) return outcome('shopify', 'skipped', inStock, { detail: 'the item is no longer for sale, so its Shopify listing was not changed' });

  if (listing.status === 'SOLD') {
    // Restock of an item that sold out: the product exists but was zeroed. Bring it back only when the item is available again.
    if (ctx.checkOnly) return outcome('shopify', 'drift', inStock, { live: 0, detail: 'the Shopify listing is marked sold but stock is available' });
    if (item.status !== 'AVAILABLE') return outcome('shopify', 'skipped', inStock, { live: 0, detail: 'the Shopify listing is marked sold and the item is not available' });
    await prisma.shopifyListing.updateMany({ where: { itemId: item.id, status: 'SOLD' }, data: { status: 'ACTIVE' } });
  }

  const liveQty = await readShopifyLive(listing);
  if (liveQty !== null && liveQty === inStock) return outcome('shopify', 'unchanged', inStock, { live: liveQty });
  if (ctx.checkOnly) return outcome('shopify', 'drift', inStock, { live: liveQty });
  await updateShopifyProductFields(item.id, { quantity: inStock });
  const after = await readShopifyLive(listing);
  if (after !== null && after !== inStock) return outcome('shopify', 'failed', inStock, { live: after, detail: 'Shopify did not confirm the new quantity' });
  return outcome('shopify', 'synced', inStock, { live: after ?? inStock });
}

// ---------------------------------------------------------------------------------------------
// Markets with no quantity API
// ---------------------------------------------------------------------------------------------

const EXTENSION_MARKETS: Record<string, { market: MarketName; label: string }> = {
  FACEBOOK: { market: 'facebook', label: 'Facebook Marketplace' },
  CRAIGSLIST: { market: 'craigslist', label: 'Craigslist' },
  VINTED: { market: 'vinted', label: 'Vinted' },
  POSHMARK: { market: 'poshmark', label: 'Poshmark' },
  MERCARI: { market: 'mercari', label: 'Mercari' },
  GRAILED: { market: 'grailed', label: 'Grailed' },
};

async function syncCountlessMarkets(ctx: SyncCtx): Promise<MarketSyncOutcome[]> {
  const { item, inStock } = ctx;
  const present: Array<{ market: MarketName; label: string; live?: number | null }> = [];
  if (item.reverbListingId) present.push({ market: 'reverb', label: 'Reverb' });
  if (item.discogsListingId) present.push({ market: 'discogs', label: 'Discogs' });

  // Extension marketplaces: listed when the newest POST/REMOVE row (REMOVE+SKIPPED rows ignored) is POST + POSTED.
  try {
    const jobs = await prisma.marketplaceListingJob.findMany({
      where: { itemId: item.id, platform: { in: ['FACEBOOK', 'CRAIGSLIST', 'VINTED', 'POSHMARK', 'MERCARI', 'GRAILED'] } },
      select: { platform: true, action: true, status: true, createdAt: true },
    });
    const newest = new Map<string, { action: string; status: string; createdAt: Date }>();
    for (const j of jobs) {
      if (j.action === 'REMOVE' && j.status === 'SKIPPED') continue;
      const cur = newest.get(j.platform);
      if (!cur || j.createdAt > cur.createdAt) newest.set(j.platform, { action: j.action, status: j.status, createdAt: j.createdAt });
    }
    for (const [platform, job] of newest) {
      if (job.action === 'POST' && job.status === 'POSTED' && EXTENSION_MARKETS[platform]) present.push({ ...EXTENSION_MARKETS[platform] });
    }
  } catch (err) {
    console.warn(`[StockSync] could not read extension listings for item ${item.id}:`, (err as Error).message);
  }
  if (item.fbExportedAt && !present.some((p) => p.market === 'facebook')) present.push({ ...EXTENSION_MARKETS.FACEBOOK });
  const tcg = item.card?.tcgplayerQty;
  if (typeof tcg === 'number') present.push({ market: 'tcgplayer', label: 'TCGplayer', live: tcg });

  if (present.length === 0) return [];
  if (await ctx.isLot()) return [];

  const outcomes: MarketSyncOutcome[] = [];
  for (const p of present) {
    if (inStock === 0) {
      if (!ctx.checkOnly) {
        try {
          if (p.market === 'reverb') await withdrawReverbListingIfExists(item.id);
          else if (p.market === 'discogs') await withdrawDiscogsListingIfExists(item.id);
          else if (p.market === 'facebook' && ctx.transitioned) await notifyFacebookExportedItemSold(item.id);
        } catch (err) {
          outcomes.push(failedOutcome(p.market, 0, err));
          continue;
        }
      }
      outcomes.push(
        outcome(p.market, ctx.checkOnly ? 'drift' : 'ended', 0, {
          ...(p.live !== undefined ? { live: p.live } : {}),
          detail:
            p.market === 'tcgplayer'
              ? 'the next TCGplayer export zeroes the count'
              : ctx.checkOnly
                ? `${p.label} may still show this item although nothing is in stock`
                : `${p.label} listing is withdrawn or queued for removal now that nothing is in stock`,
        })
      );
      continue;
    }
    if (p.market === 'tcgplayer') {
      outcomes.push(
        p.live === inStock
          ? outcome('tcgplayer', 'unchanged', inStock, { live: p.live })
          : outcome('tcgplayer', 'manual', inStock, { live: p.live ?? null, detail: 'TCGplayer counts change when the TCGplayer export is uploaded' })
      );
      continue;
    }
    outcomes.push(
      inStock > 1
        ? outcome(p.market, 'manual', inStock, { detail: `${p.label} cannot take a count from FindA.Sale, so the listing there is one unit; ${inStock} are in stock` })
        : outcome(p.market, 'unchanged', inStock, { detail: `${p.label} lists one unit` })
    );
  }
  return outcomes;
}
