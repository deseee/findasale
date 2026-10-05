/**
 * bulkLotEbayService (ADR-136 Addendum C, roadmap #659): database side of eBay bundles for bulk lots.
 *
 * What it does
 *  - saves the organizer's bundle settings (size, premium or discount, title, condition, package),
 *  - decides what has to happen on eBay for a lot (planBundleSync) and does it through injected eBay operations:
 *      REVISE   bulkUpdatePriceQuantity on the live offer (quantity = whole bundles left, price = bundle price)
 *      END      withdraw the offer when fewer than one bundle is left (or bundles were turned off)
 *      RELIST   publish the same offer again through the normal push pipeline when stock returns
 *  - never touches counter stock. The eBay side only ever LOWERS the lot's stock through the sold sync, never here.
 *
 * Design rules (same as bulkLotService)
 *  - The database client and the eBay operations are injected, never imported, so a unit test passes fakes. This module
 *    reads no env var and imports no Prisma client and no eBay code. The feature flag is read by callers.
 *  - reconcileBulkLotEbay NEVER throws: it is called from sale paths and from a cron, and an eBay problem must never
 *    fail a counter sale. Problems are recorded on the bundle row (lastSyncStatus, lastSyncError) and returned.
 *  - Work on one lot is serialised inside this process (withItemLock), so a sale hook and the sweep cannot both
 *    publish or end the same listing at once. Across processes the eBay calls are idempotent (end twice, revise to the
 *    same numbers twice, publish an offer that is already live).
 */
import {
  BUNDLE_SIZE_MAX,
  BUNDLE_SIZE_MIN,
  BUNDLE_SIZE_PRESETS,
  BulkEbayError,
  BULK_EBAY_MESSAGES,
  BUNDLE_SIZE_LOCKED_MESSAGE,
  buildBundleOverlay,
  bundleQuantity,
  bundleTitle,
  bpsToPercent,
  computeBundlePriceCents,
  describeBundleListing,
  parseBundleSettings,
  percentToBps,
  planBundleSync,
  suggestBundlePackage,
  validateBundlePackage,
  type BundleRow,
  type BundleSyncPlan,
} from './bulkLotEbayBundle';
import { formatCardCount, formatCents, pricePerThousandCentsFromDollars, remainingCards } from './bulkLotPricing';
import { DEFAULT_BULK_LOT_GAME } from './bulkLotVocabulary';

// ---------------------------------------------------------------------------
// Database and eBay operation shapes (what a fake must provide)
// ---------------------------------------------------------------------------

export interface BundleDb {
  item: {
    findUnique(args: any): Promise<any>;
  };
  itemBulkLotEbayBundle: {
    findMany(args: any): Promise<any[]>;
    upsert(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
}

export type BundleOpResult = { ok: true; listingId?: string | null } | { ok: false; code: string; message: string };

export interface BundleEbayOps {
  /** Revise quantity and price of a LIVE offer. Must answer code 'NOT_LIVE' when the offer is not published. */
  revise(ctx: { itemId: string; quantity: number; priceCents: number }): Promise<BundleOpResult>;
  /** Withdraw the offer. true = ended, false = tried and failed, null = nothing to end. */
  end(itemId: string): Promise<boolean | null>;
  /** Run the normal push pipeline for this one lot (inventory item, offer, publish). Used to list and to relist. */
  publish(ctx: { itemId: string }): Promise<BundleOpResult>;
}

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

export const BUNDLE_ROW_SELECT = {
  id: true,
  itemId: true,
  organizerId: true,
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
  listedQty: true,
  listedPriceCents: true,
  endedForStock: true,
  lastSyncAt: true,
  lastSyncStatus: true,
  lastSyncError: true,
} as const;

export const LOT_EBAY_ITEM_SELECT = {
  id: true,
  organizerId: true,
  saleId: true,
  title: true,
  status: true,
  isActive: true,
  price: true,
  stockTotal: true,
  stockSold: true,
  ebayOfferId: true,
  ebayListingId: true,
  bulkLot: { select: { game: true, lotKind: true } },
  ebayBundle: { select: BUNDLE_ROW_SELECT },
} as const;

// ---------------------------------------------------------------------------
// In-process lock per lot
// ---------------------------------------------------------------------------

const locks = new Map<string, Promise<unknown>>();

export async function withItemLock<T>(itemId: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(itemId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);
  locks.set(itemId, next);
  try {
    return await next;
  } finally {
    if (locks.get(itemId) === next) locks.delete(itemId);
  }
}

// ---------------------------------------------------------------------------
// Reconcile
// ---------------------------------------------------------------------------

export type ReconcileStatus = 'SKIPPED' | 'NOTHING_TO_DO' | 'ENDED' | 'LISTED' | 'REVISED' | 'FAILED';

export interface ReconcileResult {
  itemId: string;
  status: ReconcileStatus;
  action: BundleSyncPlan['action'] | 'REPUBLISH' | null;
  reason: string;
  ok: boolean;
  message: string | null;
  listedQty?: number | null;
  listedPriceCents?: number | null;
}

export interface ReconcileOptions {
  /** Push the whole listing again (title, text, package, price, quantity) instead of only revising quantity and price. */
  forceRepublish?: boolean;
}

function itemSellable(item: { status?: string | null; isActive?: boolean | null }): boolean {
  return item.status === 'AVAILABLE' && item.isActive !== false;
}

function skipped(itemId: string, reason: string): ReconcileResult {
  return { itemId, status: 'SKIPPED', action: null, reason, ok: true, message: null };
}

function errText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 300);
}

async function recordSync(db: BundleDb, itemId: string, data: Record<string, unknown>): Promise<void> {
  try {
    await db.itemBulkLotEbayBundle.update({ where: { itemId }, data: { ...data, lastSyncAt: new Date() } });
  } catch (err) {
    console.warn(`[bulkLotEbay] could not record sync state for item ${itemId}:`, errText(err));
  }
}

/** The current plan for a lot, without doing anything. */
export function planFor(item: any, row: any): BundleSyncPlan {
  return planBundleSync({
    enabled: Boolean(row.enabled),
    bundleSize: row.bundleSize,
    adjustmentBps: row.adjustmentBps ?? 0,
    pricePerThousandCents: pricePerThousandCentsFromDollars(item.price),
    stockTotal: item.stockTotal,
    stockSold: item.stockSold,
    itemSellable: itemSellable(item),
    // An ended-for-stock lot still counts as listed even when the ended-listings sync cleared its offer id: relisting
    // simply builds a new offer through the push pipeline.
    hasListing: Boolean(item.ebayOfferId) || Boolean(row.endedForStock),
    endedForStock: Boolean(row.endedForStock),
    listedQty: row.listedQty,
    listedPriceCents: row.listedPriceCents,
  });
}

/**
 * Brings the eBay listing of one lot in line with its counter stock. Never throws. Safe to call as often as you like:
 * when nothing differs it does not call eBay and does not write.
 */
export async function reconcileBulkLotEbay(db: BundleDb, ops: BundleEbayOps, itemId: string, opts: ReconcileOptions = {}): Promise<ReconcileResult> {
  try {
    return await withItemLock(itemId, () => reconcileLocked(db, ops, itemId, opts));
  } catch (err) {
    console.error(`[bulkLotEbay] reconcile failed for item ${itemId}:`, err);
    return { itemId, status: 'FAILED', action: null, reason: 'EXCEPTION', ok: false, message: errText(err) };
  }
}

async function reconcileLocked(db: BundleDb, ops: BundleEbayOps, itemId: string, opts: ReconcileOptions): Promise<ReconcileResult> {
  const item = await db.item.findUnique({ where: { id: itemId }, select: LOT_EBAY_ITEM_SELECT });
  if (!item || !item.bulkLot) return skipped(itemId, 'NOT_LOT');
  const row = item.ebayBundle;
  if (!row) return skipped(itemId, 'NO_BUNDLE_SETTINGS');

  const plan = planFor(item, row);
  const live = Boolean(item.ebayOfferId) && !row.endedForStock;

  // A changed title, text, package or bundle size cannot be sent by a quantity and price revise: push the whole
  // listing again, but only when there is something to sell and the offer exists.
  if (opts.forceRepublish && row.enabled && Boolean(item.ebayOfferId) && plan.wantedQty >= 1 && plan.wantedPriceCents !== null) {
    const res = await ops.publish({ itemId });
    if (res.ok) {
      await recordSync(db, itemId, {
        endedForStock: false,
        listedQty: plan.wantedQty,
        listedPriceCents: plan.wantedPriceCents,
        lastSyncStatus: 'LISTED',
        lastSyncError: null,
      });
      return { itemId, status: 'LISTED', action: 'REPUBLISH', reason: 'SETTINGS_CHANGED', ok: true, message: null, listedQty: plan.wantedQty, listedPriceCents: plan.wantedPriceCents };
    }
    await recordSync(db, itemId, { lastSyncStatus: 'REPUBLISH_FAILED', lastSyncError: res.message.slice(0, 300) });
    return { itemId, status: 'FAILED', action: 'REPUBLISH', reason: res.code, ok: false, message: res.message };
  }

  switch (plan.action) {
    case 'NONE':
      return { itemId, status: 'NOTHING_TO_DO', action: 'NONE', reason: plan.reason, ok: true, message: null };

    case 'END': {
      const ended = await ops.end(itemId);
      if (ended === false) {
        await recordSync(db, itemId, { lastSyncStatus: 'END_FAILED', lastSyncError: 'eBay did not end the listing. It will be tried again.' });
        return { itemId, status: 'FAILED', action: 'END', reason: plan.reason, ok: false, message: 'eBay did not end the listing.' };
      }
      await recordSync(db, itemId, { endedForStock: true, listedQty: 0, lastSyncStatus: 'ENDED', lastSyncError: null });
      return { itemId, status: 'ENDED', action: 'END', reason: plan.reason, ok: true, message: null, listedQty: 0 };
    }

    case 'RELIST': {
      const res = await ops.publish({ itemId });
      if (!res.ok) {
        await recordSync(db, itemId, { lastSyncStatus: 'RELIST_FAILED', lastSyncError: res.message.slice(0, 300) });
        return { itemId, status: 'FAILED', action: 'RELIST', reason: res.code, ok: false, message: res.message };
      }
      await recordSync(db, itemId, {
        endedForStock: false,
        listedQty: plan.wantedQty,
        listedPriceCents: plan.wantedPriceCents,
        lastSyncStatus: 'LISTED',
        lastSyncError: null,
      });
      return { itemId, status: 'LISTED', action: 'RELIST', reason: plan.reason, ok: true, message: null, listedQty: plan.wantedQty, listedPriceCents: plan.wantedPriceCents };
    }

    case 'REVISE': {
      if (!live || plan.wantedPriceCents === null) return skipped(itemId, 'NOT_LIVE');
      const res = await ops.revise({ itemId, quantity: plan.wantedQty, priceCents: plan.wantedPriceCents });
      if (!res.ok) {
        const status = res.code === 'NOT_LIVE' ? 'NOT_LIVE' : 'REVISE_FAILED';
        const message = res.code === 'NOT_LIVE' ? 'The eBay listing is not live. Use List on eBay to list it again.' : res.message;
        await recordSync(db, itemId, { lastSyncStatus: status, lastSyncError: message.slice(0, 300) });
        return { itemId, status: 'FAILED', action: 'REVISE', reason: res.code, ok: false, message };
      }
      await recordSync(db, itemId, {
        listedQty: plan.wantedQty,
        listedPriceCents: plan.wantedPriceCents,
        lastSyncStatus: 'REVISED',
        lastSyncError: null,
      });
      return { itemId, status: 'REVISED', action: 'REVISE', reason: plan.reason, ok: true, message: null, listedQty: plan.wantedQty, listedPriceCents: plan.wantedPriceCents };
    }
  }
}

/** Fire-and-forget form for sale paths. Never throws, never awaited by the caller. */
export function reconcileBulkLotEbayInBackground(db: BundleDb, ops: BundleEbayOps, itemId: string, why: string): void {
  reconcileBulkLotEbay(db, ops, itemId)
    .then((r) => {
      if (r.status === 'FAILED') console.warn(`[bulkLotEbay] ${why}: item ${itemId} ${r.action} failed (${r.reason}): ${r.message}`);
    })
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Organizer actions
// ---------------------------------------------------------------------------

export interface OrganizerCtx {
  organizerId: string;
}

async function loadOwnedLot(db: BundleDb, ctx: OrganizerCtx, itemId: string): Promise<any> {
  const item = await db.item.findUnique({ where: { id: itemId }, select: LOT_EBAY_ITEM_SELECT });
  // Another organizer's item looks exactly like a missing one.
  if (!item || item.organizerId !== ctx.organizerId) throw new BulkEbayError('BUNDLE_NOT_FOUND', 404, BULK_EBAY_MESSAGES.BUNDLE_NOT_FOUND);
  if (!item.bulkLot) throw new BulkEbayError('BUNDLE_NOT_LOT', 409, BULK_EBAY_MESSAGES.BUNDLE_NOT_LOT);
  return item;
}

export interface BundleView {
  itemId: string;
  hasSettings: boolean;
  enabled: boolean;
  bundleSize: number;
  adjustmentPercent: number;
  ebayTitle: string | null;
  titlePreview: string;
  condition: string;
  language: string;
  package: { weightOz: number; lengthIn: number; widthIn: number; heightIn: number; confirmed: boolean; suggested: { weightOz: number; lengthIn: number; widthIn: number; heightIn: number } };
  stock: { remainingCards: number; remainingLabel: string; bundlesAvailable: number; leftoverCards: number };
  price: { pricePerThousandCents: number | null; bundleCents: number | null; bundleLabel: string | null; summary: string | null };
  listing: {
    hasOffer: boolean;
    isLive: boolean;
    endedForStock: boolean;
    listedQty: number | null;
    listedPriceCents: number | null;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
    nextAction: string;
    ebayUrl: string | null;
  };
  /** Plain reasons the lot cannot be listed right now. Empty when it can. */
  blockers: string[];
  limits: { minBundleSize: number; maxBundleSize: number; presets: readonly number[] };
}

export function toBundleView(item: any): BundleView {
  const row = item.ebayBundle ?? null;
  const size: number = row?.bundleSize ?? 1000;
  const suggested = suggestBundlePackage(size);
  const remaining = remainingCards(item.stockTotal, item.stockSold);
  const bundles = bundleQuantity(remaining, size);
  const ppt = pricePerThousandCentsFromDollars(item.price);
  const price = computeBundlePriceCents(size, ppt, row?.adjustmentBps ?? 0);
  const pkg = row
    ? { weightOz: row.weightOz, lengthIn: row.lengthIn, widthIn: row.widthIn, heightIn: row.heightIn, confirmed: Boolean(row.dimsConfirmed) }
    : { ...suggested, confirmed: false };
  const plan = row ? planFor(item, row) : null;
  const blockers: string[] = [];
  if (!ppt) blockers.push(BULK_EBAY_MESSAGES.BUNDLE_PRICE_INVALID);
  else if (!price.ok) blockers.push(BULK_EBAY_MESSAGES[price.code]);
  if (bundles < 1) blockers.push(`This lot has ${formatCardCount(remaining)} cards left, fewer than one ${formatCardCount(size)}-card bundle.`);
  if (!pkg.confirmed || validateBundlePackage(pkg)) blockers.push(BULK_EBAY_MESSAGES.BUNDLE_PACKAGE_UNCONFIRMED);
  const isLive = Boolean(item.ebayOfferId) && Boolean(row) && !row.endedForStock && typeof row.listedQty === 'number' && row.listedQty > 0;
  return {
    itemId: item.id,
    hasSettings: Boolean(row),
    enabled: Boolean(row?.enabled),
    bundleSize: size,
    adjustmentPercent: bpsToPercent(row?.adjustmentBps ?? 0),
    ebayTitle: row?.ebayTitle ?? null,
    titlePreview: bundleTitle({ bundleSize: size, game: item.bulkLot?.game ?? DEFAULT_BULK_LOT_GAME, lotKind: item.bulkLot?.lotKind, ebayTitle: row?.ebayTitle }),
    condition: row?.condition ?? 'USED',
    language: row?.language ?? 'English',
    package: { ...pkg, suggested },
    stock: { remainingCards: remaining, remainingLabel: `${formatCardCount(remaining)} cards`, bundlesAvailable: bundles, leftoverCards: remaining - bundles * size },
    price: {
      pricePerThousandCents: ppt,
      bundleCents: price.ok ? price.cents : null,
      bundleLabel: price.ok ? formatCents(price.cents) : null,
      summary: price.ok && bundles > 0 ? describeBundleListing(size, bundles, price.cents) : null,
    },
    listing: {
      hasOffer: Boolean(item.ebayOfferId),
      isLive,
      endedForStock: Boolean(row?.endedForStock),
      listedQty: row?.listedQty ?? null,
      listedPriceCents: row?.listedPriceCents ?? null,
      lastSyncAt: row?.lastSyncAt ? new Date(row.lastSyncAt).toISOString() : null,
      lastSyncStatus: row?.lastSyncStatus ?? null,
      lastSyncError: row?.lastSyncError ?? null,
      nextAction: plan ? plan.action : 'NONE',
      ebayUrl: isLive && item.ebayListingId ? `https://www.ebay.com/itm/${item.ebayListingId}` : null,
    },
    blockers,
    limits: { minBundleSize: BUNDLE_SIZE_MIN, maxBundleSize: BUNDLE_SIZE_MAX, presets: BUNDLE_SIZE_PRESETS },
  };
}

export async function getBundleView(db: BundleDb, ctx: OrganizerCtx, itemId: string): Promise<BundleView> {
  return toBundleView(await loadOwnedLot(db, ctx, itemId));
}

const PACKAGE_KEYS = ['weightOz', 'lengthIn', 'widthIn', 'heightIn'] as const;

/**
 * Saves the organizer's bundle settings and brings eBay in line. A change to anything the listing text or package is
 * built from (size, title, condition, language, package) pushes the whole listing again when it is live; a change to the
 * premium or discount only changes the price; turning bundles off ends the listing.
 */
export async function saveBundleSettings(db: BundleDb, ops: BundleEbayOps, ctx: OrganizerCtx, itemId: string, rawInput: unknown): Promise<{ view: BundleView; sync: ReconcileResult }> {
  const input = parseBundleSettings(rawInput);
  const item = await loadOwnedLot(db, ctx, itemId);
  const existing = item.ebayBundle ?? null;

  const bundleSize = input.bundleSize;
  const sizeChanged = !existing || existing.bundleSize !== bundleSize;
  // The sold sync turns "N bundles" on an eBay order into N x (the saved bundle size) cards. While a listing for the old
  // size is live, a changed size would make those orders take the wrong number of cards, so the size is locked then.
  if (existing && sizeChanged && Boolean(item.ebayOfferId) && !existing.endedForStock && typeof existing.listedQty === 'number') {
    throw new BulkEbayError('BUNDLE_VALIDATION', 409, BUNDLE_SIZE_LOCKED_MESSAGE, { field: 'bundleSize' });
  }
  const suggested = suggestBundlePackage(bundleSize);

  const providedPkg = PACKAGE_KEYS.some((k) => input[k] !== undefined);
  let pkg: { weightOz: number; lengthIn: number; widthIn: number; heightIn: number };
  let dimsConfirmed: boolean;
  if (providedPkg) {
    const base = existing && !sizeChanged ? existing : suggested;
    pkg = {
      weightOz: input.weightOz ?? base.weightOz,
      lengthIn: input.lengthIn ?? base.lengthIn,
      widthIn: input.widthIn ?? base.widthIn,
      heightIn: input.heightIn ?? base.heightIn,
    };
    const differs = !existing || sizeChanged || PACKAGE_KEYS.some((k) => existing[k] !== pkg[k]);
    dimsConfirmed = input.dimsConfirmed ?? (differs ? false : Boolean(existing?.dimsConfirmed));
  } else if (existing && !sizeChanged) {
    pkg = { weightOz: existing.weightOz, lengthIn: existing.lengthIn, widthIn: existing.widthIn, heightIn: existing.heightIn };
    dimsConfirmed = input.dimsConfirmed ?? Boolean(existing.dimsConfirmed);
  } else {
    // New settings, or the size changed: the old weight and box no longer describe this bundle. Start from the
    // suggestion and require a fresh confirmation.
    pkg = suggested;
    dimsConfirmed = false;
  }
  const pkgProblem = validateBundlePackage(pkg);
  if (pkgProblem) throw new BulkEbayError('BUNDLE_VALIDATION', 400, pkgProblem);

  const adjustmentBps = input.adjustmentPercent !== undefined ? percentToBps(input.adjustmentPercent) : existing?.adjustmentBps ?? 0;
  const enabled = input.enabled ?? existing?.enabled ?? false;
  const ppt = pricePerThousandCentsFromDollars(item.price);
  const priceRes = computeBundlePriceCents(bundleSize, ppt, adjustmentBps);
  if (enabled && !priceRes.ok) {
    throw new BulkEbayError(priceRes.code, 409, BULK_EBAY_MESSAGES[priceRes.code]);
  }

  const data = {
    organizerId: ctx.organizerId,
    enabled,
    bundleSize,
    adjustmentBps,
    ebayTitle: input.ebayTitle === undefined ? existing?.ebayTitle ?? null : input.ebayTitle && input.ebayTitle.length > 0 ? input.ebayTitle : null,
    condition: input.condition ?? existing?.condition ?? 'USED',
    language: input.language ?? existing?.language ?? 'English',
    ...pkg,
    dimsConfirmed,
  };
  await db.itemBulkLotEbayBundle.upsert({
    where: { itemId },
    create: { itemId, ...data },
    update: data,
  });

  const contentChanged =
    !!existing &&
    (existing.bundleSize !== data.bundleSize ||
      (existing.ebayTitle ?? null) !== data.ebayTitle ||
      existing.condition !== data.condition ||
      existing.language !== data.language ||
      PACKAGE_KEYS.some((k) => existing[k] !== pkg[k]));
  const live = Boolean(item.ebayOfferId) && !(existing?.endedForStock ?? false) && typeof existing?.listedQty === 'number';
  const sync = await reconcileBulkLotEbay(db, ops, itemId, { forceRepublish: contentChanged && live && enabled });
  return { view: await getBundleView(db, ctx, itemId), sync };
}

/**
 * Explicit "List on eBay" (first listing, or after a failed or stopped one). Refuses with a plain message when the lot
 * cannot be listed. On success the bundle row records what is live so the sweep can keep it in line.
 */
export async function listBundleOnEbay(db: BundleDb, ops: BundleEbayOps, ctx: OrganizerCtx, itemId: string): Promise<{ view: BundleView; result: BundleOpResult }> {
  return withItemLock(itemId, async () => {
    const item = await loadOwnedLot(db, ctx, itemId);
    const row = item.ebayBundle as (BundleRow & { endedForStock?: boolean }) | null;
    const overlay = buildBundleOverlay({
      stockTotal: item.stockTotal,
      stockSold: item.stockSold,
      pricePerThousandCents: pricePerThousandCentsFromDollars(item.price),
      lot: { game: item.bulkLot?.game, lotKind: item.bulkLot?.lotKind },
      bundle: row,
    });
    if (!overlay.ok) {
      const status = overlay.code === 'BUNDLE_NOT_ENABLED' || overlay.code === 'BUNDLE_BELOW_ONE' ? 409 : 422;
      throw new BulkEbayError(overlay.code, status, overlay.message);
    }
    if (item.status !== 'AVAILABLE' || item.isActive === false) {
      throw new BulkEbayError('BUNDLE_BELOW_ONE', 409, 'This lot is not available, so it cannot be listed on eBay.');
    }
    const result = await ops.publish({ itemId });
    if (result.ok) {
      await recordSync(db, itemId, {
        endedForStock: false,
        listedQty: overlay.bundles,
        listedPriceCents: overlay.priceCents,
        lastSyncStatus: 'LISTED',
        lastSyncError: null,
      });
    } else {
      await recordSync(db, itemId, { lastSyncStatus: 'LIST_FAILED', lastSyncError: result.message.slice(0, 300) });
    }
    return { view: await getBundleView(db, ctx, itemId), result };
  });
}

/** "Sync now": the same reconcile the sweep runs, for one lot the caller owns. */
export async function syncBundleNow(db: BundleDb, ops: BundleEbayOps, ctx: OrganizerCtx, itemId: string): Promise<{ view: BundleView; sync: ReconcileResult }> {
  await loadOwnedLot(db, ctx, itemId);
  const sync = await reconcileBulkLotEbay(db, ops, itemId);
  return { view: await getBundleView(db, ctx, itemId), sync };
}

// ---------------------------------------------------------------------------
// Sweep (cron): catches everything the hooks missed (price edits, restocks, holds expiring, a failed end)
// ---------------------------------------------------------------------------

export interface SweepResult {
  checked: number;
  changed: number;
  failed: number;
  results: ReconcileResult[];
}

export async function sweepBundleListings(db: BundleDb, ops: BundleEbayOps, opts: { limit?: number; pageSize?: number } = {}): Promise<SweepResult> {
  // Walks every candidate row in id order, a page at a time, up to `limit` rows in one run. A run that did nothing for a
  // row writes nothing, so ordering by "oldest update" would examine the same first rows forever and starve the rest.
  const limit = Math.min(Math.max(opts.limit ?? 2000, 1), 5000);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 200, 1), 500);
  const out: SweepResult = { checked: 0, changed: 0, failed: 0, results: [] };
  let cursor: string | undefined;
  while (out.checked < limit) {
    // Rows that can need work: bundles on (to revise, end or relist) and bundles switched off but still live (to end).
    const rows = await db.itemBulkLotEbayBundle.findMany({
      where: { OR: [{ enabled: true }, { enabled: false, endedForStock: false }] },
      select: { id: true, itemId: true },
      orderBy: { id: 'asc' },
      take: Math.min(pageSize, limit - out.checked),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      const res = await reconcileBulkLotEbay(db, ops, r.itemId);
      out.checked++;
      if (res.status === 'FAILED') out.failed++;
      else if (res.status === 'ENDED' || res.status === 'LISTED' || res.status === 'REVISED') out.changed++;
      if (res.status !== 'NOTHING_TO_DO' && res.status !== 'SKIPPED') out.results.push(res);
    }
    cursor = rows[rows.length - 1].id as string;
    if (rows.length < pageSize) break;
  }
  return out;
}
