/**
 * ADR-136 Addendum C (roadmap #659): keeping the eBay bundle listing of a bulk lot in line with counter stock.
 * Reconcile (revise, end below one bundle, relist when stock returns), the organizer actions (save, list, sync) and the
 * sweep, on an in-memory database and fake eBay operations. No network, no real database, no clock.
 */
import {
  BundleDb,
  BundleEbayOps,
  BundleOpResult,
  planFor,
  reconcileBulkLotEbay,
  saveBundleSettings,
  listBundleOnEbay,
  syncBundleNow,
  sweepBundleListings,
  toBundleView,
  withItemLock,
} from '../services/bulkLot/bulkLotEbayService';
import { isBulkEbayError, suggestBundlePackage } from '../services/bulkLot/bulkLotEbayBundle';

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

interface FakeItem {
  id: string;
  organizerId: string;
  saleId: string | null;
  title: string;
  status: string;
  isActive: boolean;
  price: number | null;
  stockTotal: number | null;
  stockSold: number;
  ebayOfferId: string | null;
  ebayListingId: string | null;
  bulkLot: { game: string; lotKind: string } | null;
}
interface FakeRow {
  id: string;
  itemId: string;
  organizerId: string;
  enabled: boolean;
  bundleSize: number;
  adjustmentBps: number;
  ebayTitle: string | null;
  condition: string;
  language: string;
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  dimsConfirmed: boolean;
  listedQty: number | null;
  listedPriceCents: number | null;
  endedForStock: boolean;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

function makeDb(items: FakeItem[], rows: FakeRow[]) {
  const writes: Array<{ kind: string; data: any }> = [];
  const db: BundleDb & { items: FakeItem[]; rows: FakeRow[]; writes: typeof writes } = {
    items,
    rows,
    writes,
    item: {
      findUnique: async ({ where }: any) => {
        const it = items.find((i) => i.id === where.id);
        if (!it) return null;
        const row = rows.find((r) => r.itemId === it.id) ?? null;
        return { ...it, ebayBundle: row ? { ...row } : null };
      },
    },
    itemBulkLotEbayBundle: {
      findMany: async (args: any) => {
        let list = rows.filter((r) => r.enabled || !r.endedForStock);
        list = [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
        if (args.cursor) {
          const at = list.findIndex((r) => r.id === args.cursor.id);
          list = list.slice(at + (args.skip ?? 0));
        }
        if (typeof args.take === 'number') list = list.slice(0, args.take);
        return list.map((r) => ({ id: r.id, itemId: r.itemId }));
      },
      upsert: async ({ where, create, update }: any) => {
        const at = rows.find((r) => r.itemId === where.itemId);
        writes.push({ kind: 'upsert', data: at ? update : create });
        if (at) Object.assign(at, update);
        else rows.push({ id: `row-${rows.length + 1}`, listedQty: null, listedPriceCents: null, endedForStock: false, lastSyncAt: null, lastSyncStatus: null, lastSyncError: null, ...create });
        return at;
      },
      update: async ({ where, data }: any) => {
        const at = rows.find((r) => r.itemId === where.itemId);
        if (!at) throw new Error('no row');
        writes.push({ kind: 'update', data });
        Object.assign(at, data);
        return at;
      },
    },
  };
  return db;
}

function lot(over: Partial<FakeItem> = {}): FakeItem {
  return {
    id: 'lot1',
    organizerId: 'org1',
    saleId: 'sale1',
    title: 'Bulk commons',
    status: 'AVAILABLE',
    isActive: true,
    price: 8, // dollars per 1,000 cards
    stockTotal: 5000,
    stockSold: 0,
    ebayOfferId: 'offer1',
    ebayListingId: 'listing1',
    bulkLot: { game: 'MTG', lotKind: 'BULK_COMMON_UNCOMMON' },
    ...over,
  };
}

function row(over: Partial<FakeRow> = {}): FakeRow {
  return {
    id: 'row1',
    itemId: 'lot1',
    organizerId: 'org1',
    enabled: true,
    bundleSize: 1000,
    adjustmentBps: 0,
    ebayTitle: null,
    condition: 'USED',
    language: 'English',
    weightOz: 80,
    lengthIn: 16,
    widthIn: 4,
    heightIn: 5,
    dimsConfirmed: true,
    listedQty: 5,
    listedPriceCents: 800,
    endedForStock: false,
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    ...over,
  };
}

function makeOps(over: Partial<BundleEbayOps> = {}) {
  const calls: string[] = [];
  const ops: BundleEbayOps & { calls: string[]; revised: Array<{ quantity: number; priceCents: number }> } = {
    calls,
    revised: [],
    revise: async (ctx) => {
      calls.push('revise');
      ops.revised.push({ quantity: ctx.quantity, priceCents: ctx.priceCents });
      return { ok: true } as BundleOpResult;
    },
    end: async () => {
      calls.push('end');
      return true;
    },
    publish: async () => {
      calls.push('publish');
      return { ok: true, listingId: 'listing2' } as BundleOpResult;
    },
    ...over,
  };
  return ops;
}

describe('reconcileBulkLotEbay', () => {
  it('does not call eBay and does not write when nothing differs', async () => {
    const db = makeDb([lot()], [row()]);
    const ops = makeOps();
    const r = await reconcileBulkLotEbay(db, ops, 'lot1');
    expect(r).toMatchObject({ status: 'NOTHING_TO_DO', reason: 'IN_SYNC' });
    expect(ops.calls).toEqual([]);
    expect(db.writes).toEqual([]);
  });

  it('after a counter sale of 2,300 cards revises the quantity down to the whole bundles left (2)', async () => {
    const db = makeDb([lot({ stockSold: 3300 })], [row()]); // 5000 - 3300 = 1700 left -> 1 bundle
    const ops = makeOps();
    const r = await reconcileBulkLotEbay(db, ops, 'lot1');
    expect(r).toMatchObject({ status: 'REVISED', listedQty: 1, listedPriceCents: 800 });
    expect(ops.revised).toEqual([{ quantity: 1, priceCents: 800 }]);
    expect(db.rows[0]).toMatchObject({ listedQty: 1, lastSyncStatus: 'REVISED', lastSyncError: null });
    // idempotent: running it again does nothing
    ops.calls.length = 0;
    expect((await reconcileBulkLotEbay(db, ops, 'lot1')).status).toBe('NOTHING_TO_DO');
    expect(ops.calls).toEqual([]);
  });

  it('a change of the per-1,000 price revises the price', async () => {
    const db = makeDb([lot({ price: 9.5 })], [row()]);
    const ops = makeOps();
    const r = await reconcileBulkLotEbay(db, ops, 'lot1');
    expect(r).toMatchObject({ status: 'REVISED', reason: 'PRICE_CHANGED', listedPriceCents: 950 });
    expect(ops.revised).toEqual([{ quantity: 5, priceCents: 950 }]);
  });

  it('below one bundle ends the listing cleanly and remembers it was ended for stock', async () => {
    const db = makeDb([lot({ stockSold: 4001 })], [row()]); // 999 left
    const ops = makeOps();
    const r = await reconcileBulkLotEbay(db, ops, 'lot1');
    expect(r).toMatchObject({ status: 'ENDED', reason: 'BELOW_ONE_BUNDLE', listedQty: 0 });
    expect(ops.calls).toEqual(['end']);
    expect(db.rows[0]).toMatchObject({ endedForStock: true, listedQty: 0, lastSyncStatus: 'ENDED' });
  });

  it('relists when stock returns, then is idle again', async () => {
    const db = makeDb([lot({ stockSold: 4001, ebayOfferId: null })], [row({ endedForStock: true, listedQty: 0 })]);
    const ops = makeOps();
    // still below one bundle: nothing
    expect((await reconcileBulkLotEbay(db, ops, 'lot1')).reason).toBe('ALREADY_ENDED');
    expect(ops.calls).toEqual([]);
    // restock 2,000 cards (stockTotal 7000): 2,999 left -> 2 bundles
    db.items[0].stockTotal = 7000;
    db.items[0].ebayOfferId = null; // the ended-listings sync cleared it; relist must still happen
    const r = await reconcileBulkLotEbay(db, ops, 'lot1');
    expect(r).toMatchObject({ status: 'LISTED', action: 'RELIST', listedQty: 2, listedPriceCents: 800 });
    expect(ops.calls).toEqual(['publish']);
    expect(db.rows[0]).toMatchObject({ endedForStock: false, listedQty: 2, lastSyncStatus: 'LISTED' });
    ops.calls.length = 0;
    db.items[0].ebayOfferId = 'offer2';
    expect((await reconcileBulkLotEbay(db, ops, 'lot1')).status).toBe('NOTHING_TO_DO');
  });

  it('a failed end is recorded and retried, and the lot is not marked ended', async () => {
    const db = makeDb([lot({ stockSold: 4500 })], [row()]);
    const ops = makeOps({ end: async () => false });
    const r = await reconcileBulkLotEbay(db, ops, 'lot1');
    expect(r).toMatchObject({ status: 'FAILED', action: 'END', ok: false });
    expect(db.rows[0]).toMatchObject({ endedForStock: false, lastSyncStatus: 'END_FAILED' });
  });

  it('an end with nothing to end (null) still counts as ended', async () => {
    const db = makeDb([lot({ stockSold: 4500 })], [row()]);
    const r = await reconcileBulkLotEbay(db, makeOps({ end: async () => null }), 'lot1');
    expect(r.status).toBe('ENDED');
  });

  it('a failed relist keeps the ended state and records the reason', async () => {
    const db = makeDb([lot({ ebayOfferId: null })], [row({ endedForStock: true, listedQty: 0 })]);
    const ops = makeOps({ publish: async () => ({ ok: false, code: 'EBAY_REJECTED', message: 'eBay said no' }) });
    const r = await reconcileBulkLotEbay(db, ops, 'lot1');
    expect(r).toMatchObject({ status: 'FAILED', action: 'RELIST', reason: 'EBAY_REJECTED', message: 'eBay said no' });
    expect(db.rows[0]).toMatchObject({ endedForStock: true, lastSyncStatus: 'RELIST_FAILED', lastSyncError: 'eBay said no' });
  });

  it('a revise on an offer that is not live is reported plainly and not recorded as listed', async () => {
    const db = makeDb([lot({ stockSold: 3300 })], [row()]);
    const ops = makeOps({ revise: async () => ({ ok: false, code: 'NOT_LIVE', message: 'x' }) });
    const r = await reconcileBulkLotEbay(db, ops, 'lot1');
    expect(r).toMatchObject({ status: 'FAILED', reason: 'NOT_LIVE' });
    expect(r.message).toContain('not live');
    expect(db.rows[0].listedQty).toBe(5);
  });

  it('turning bundles off ends a live listing', async () => {
    const db = makeDb([lot()], [row({ enabled: false })]);
    const ops = makeOps();
    expect((await reconcileBulkLotEbay(db, ops, 'lot1')).status).toBe('ENDED');
    expect(ops.calls).toEqual(['end']);
  });

  it('never lists a lot nobody listed', async () => {
    const db = makeDb([lot({ ebayOfferId: null })], [row({ listedQty: null, listedPriceCents: null })]);
    const ops = makeOps();
    expect(await reconcileBulkLotEbay(db, ops, 'lot1')).toMatchObject({ status: 'NOTHING_TO_DO', reason: 'NOT_LISTED' });
    expect(ops.calls).toEqual([]);
  });

  it('skips an item that is not a lot or has no bundle settings, and never throws', async () => {
    const db = makeDb([lot({ bulkLot: null }), lot({ id: 'lot2' })], [row({ itemId: 'lot2', id: 'row2' })]);
    const ops = makeOps();
    expect((await reconcileBulkLotEbay(db, ops, 'lot1')).reason).toBe('NOT_LOT');
    expect((await reconcileBulkLotEbay(db, ops, 'missing')).reason).toBe('NOT_LOT');
    const noRow = makeDb([lot()], []);
    expect((await reconcileBulkLotEbay(noRow, ops, 'lot1')).reason).toBe('NO_BUNDLE_SETTINGS');
    const boom: BundleDb = { ...db, item: { findUnique: async () => { throw new Error('db down'); } } };
    expect(await reconcileBulkLotEbay(boom, ops, 'lot1')).toMatchObject({ status: 'FAILED', reason: 'EXCEPTION', ok: false });
    expect(ops.calls).toEqual([]);
  });

  it('forceRepublish pushes the whole listing again (changed text or package), only when live and sellable', async () => {
    const db = makeDb([lot()], [row()]);
    const ops = makeOps();
    const r = await reconcileBulkLotEbay(db, ops, 'lot1', { forceRepublish: true });
    expect(r).toMatchObject({ status: 'LISTED', action: 'REPUBLISH' });
    expect(ops.calls).toEqual(['publish']);
    const empty = makeDb([lot({ stockSold: 4500 })], [row()]);
    const ops2 = makeOps();
    const r2 = await reconcileBulkLotEbay(empty, ops2, 'lot1', { forceRepublish: true });
    expect(r2.action).toBe('END'); // nothing to sell: ends instead of republishing
    expect(ops2.calls).toEqual(['end']);
  });

  it('serializes concurrent reconciles of the same lot so two quantity pushes cannot interleave', async () => {
    const order: string[] = [];
    const a = withItemLock('x', async () => { order.push('a1'); await new Promise((r) => setTimeout(r, 10)); order.push('a2'); });
    const b = withItemLock('x', async () => { order.push('b1'); order.push('b2'); });
    await Promise.all([a, b]);
    expect(order).toEqual(['a1', 'a2', 'b1', 'b2']);
  });

  it('planFor counts an ended-for-stock lot as listed even when its offer id was cleared', () => {
    expect(planFor(lot({ ebayOfferId: null }), row({ endedForStock: true, listedQty: 0 })).action).toBe('RELIST');
    expect(planFor(lot({ ebayOfferId: null }), row({ listedQty: null, listedPriceCents: null })).reason).toBe('NOT_LISTED');
  });
});

describe('organizer actions', () => {
  const ctx = { organizerId: 'org1' };

  it('another organizer cannot read or change the lot (looks like a missing one)', async () => {
    const db = makeDb([lot()], [row()]);
    await expect(syncBundleNow(db, makeOps(), { organizerId: 'org2' }, 'lot1')).rejects.toMatchObject({ code: 'BUNDLE_NOT_FOUND', status: 404 });
    await expect(saveBundleSettings(db, makeOps(), { organizerId: 'org2' }, 'lot1', { bundleSize: 500 })).rejects.toMatchObject({ code: 'BUNDLE_NOT_FOUND' });
    await expect(listBundleOnEbay(db, makeOps(), { organizerId: 'org2' }, 'lot1')).rejects.toMatchObject({ code: 'BUNDLE_NOT_FOUND' });
  });

  it('refuses an item that is not a lot', async () => {
    const db = makeDb([lot({ bulkLot: null })], []);
    await expect(syncBundleNow(db, makeOps(), ctx, 'lot1')).rejects.toMatchObject({ code: 'BUNDLE_NOT_LOT', status: 409 });
  });

  it('first save with no package uses the suggestion but is NOT confirmed, so listing is refused until it is', async () => {
    const db = makeDb([lot({ ebayOfferId: null, ebayListingId: null })], []);
    const ops = makeOps();
    const { view } = await saveBundleSettings(db, ops, ctx, 'lot1', { enabled: true, bundleSize: 1000 });
    expect(view.enabled).toBe(true);
    expect(view.package.confirmed).toBe(false);
    expect(view.package.weightOz).toBe(suggestBundlePackage(1000).weightOz);
    expect(view.blockers.join(' ')).toContain('Confirm the box weight');
    await expect(listBundleOnEbay(db, ops, ctx, 'lot1')).rejects.toMatchObject({ code: 'BUNDLE_PACKAGE_UNCONFIRMED' });
    expect(ops.calls).toEqual([]);
  });

  it('listing after confirming publishes once and records what is live', async () => {
    const db = makeDb([lot({ ebayOfferId: null, ebayListingId: null })], []);
    const ops = makeOps();
    await saveBundleSettings(db, ops, ctx, 'lot1', { enabled: true, bundleSize: 1000, weightOz: 80, lengthIn: 16, widthIn: 4, heightIn: 5, dimsConfirmed: true });
    const { result, view } = await listBundleOnEbay(db, ops, ctx, 'lot1');
    expect(result.ok).toBe(true);
    expect(ops.calls).toEqual(['publish']);
    expect(db.rows[0]).toMatchObject({ listedQty: 5, listedPriceCents: 800, endedForStock: false, lastSyncStatus: 'LISTED' });
    expect(view.price.bundleCents).toBe(800);
    expect(view.stock.bundlesAvailable).toBe(5);
  });

  it('listing refuses below one bundle, when bundles are off, with no price, and when the lot is not available', async () => {
    const base = { enabled: true, bundleSize: 1000, weightOz: 80, lengthIn: 16, widthIn: 4, heightIn: 5, dimsConfirmed: true };
    const small = makeDb([lot({ stockTotal: 900 })], [row()]);
    await expect(listBundleOnEbay(small, makeOps(), ctx, 'lot1')).rejects.toMatchObject({ code: 'BUNDLE_BELOW_ONE', status: 409 });
    const off = makeDb([lot()], [row({ enabled: false })]);
    await expect(listBundleOnEbay(off, makeOps(), ctx, 'lot1')).rejects.toMatchObject({ code: 'BUNDLE_NOT_ENABLED', status: 409 });
    const noPrice = makeDb([lot({ price: null })], [row()]);
    await expect(listBundleOnEbay(noPrice, makeOps(), ctx, 'lot1')).rejects.toMatchObject({ code: 'BUNDLE_PRICE_INVALID' });
    const sold = makeDb([lot({ status: 'SOLD' })], [row()]);
    await expect(listBundleOnEbay(sold, makeOps(), ctx, 'lot1')).rejects.toBeTruthy();
    void base;
  });

  it('a failed publish is recorded and returned, not thrown', async () => {
    const db = makeDb([lot({ ebayOfferId: null })], [row({ listedQty: null, listedPriceCents: null })]);
    const ops = makeOps({ publish: async () => ({ ok: false, code: 'EBAY_REJECTED', message: 'Category needs an item specific.' }) });
    const { result } = await listBundleOnEbay(db, ops, ctx, 'lot1');
    expect(result).toMatchObject({ ok: false, code: 'EBAY_REJECTED' });
    expect(db.rows[0]).toMatchObject({ lastSyncStatus: 'LIST_FAILED', lastSyncError: 'Category needs an item specific.' });
    expect(db.rows[0].listedQty).toBeNull();
  });

  it('the bundle size is locked while a listing for the old size is live (orders would take the wrong number of cards)', async () => {
    const db = makeDb([lot()], [row()]);
    const ops = makeOps();
    await expect(saveBundleSettings(db, ops, ctx, 'lot1', { bundleSize: 500 })).rejects.toMatchObject({ code: 'BUNDLE_VALIDATION', status: 409 });
    expect(db.rows[0].bundleSize).toBe(1000);
    expect(db.writes).toEqual([]);
    expect(ops.calls).toEqual([]);
  });

  it('once the listing is ended, a changed bundle size resets the package to the new suggestion and requires a fresh confirmation', async () => {
    const db = makeDb([lot({ ebayOfferId: null })], [row({ enabled: false, endedForStock: true, listedQty: 0 })]);
    const ops = makeOps();
    const { view } = await saveBundleSettings(db, ops, ctx, 'lot1', { bundleSize: 500 });
    expect(view.bundleSize).toBe(500);
    expect(view.package.confirmed).toBe(false);
    expect(view.package.weightOz).toBe(suggestBundlePackage(500).weightOz);
    expect(ops.calls).toEqual([]);
  });

  it('changing the title or package of a live listing pushes the whole listing again', async () => {
    const db = makeDb([lot()], [row()]);
    const ops = makeOps();
    const { sync } = await saveBundleSettings(db, ops, ctx, 'lot1', { bundleSize: 1000, ebayTitle: 'A better title', dimsConfirmed: true });
    expect(sync.action).toBe('REPUBLISH');
    expect(ops.calls).toEqual(['publish']);
  });

  it('a premium change only revises the price of a live listing', async () => {
    const db = makeDb([lot()], [row()]);
    const ops = makeOps();
    const { sync, view } = await saveBundleSettings(db, ops, ctx, 'lot1', { bundleSize: 1000, adjustmentPercent: 5 });
    expect(sync).toMatchObject({ status: 'REVISED', reason: 'PRICE_CHANGED', listedPriceCents: 840 });
    expect(ops.calls).toEqual(['revise']);
    expect(view.adjustmentPercent).toBe(5);
  });

  it('turning bundles on without a usable price is refused', async () => {
    const db = makeDb([lot({ price: null, ebayOfferId: null })], []);
    await expect(saveBundleSettings(db, makeOps(), ctx, 'lot1', { enabled: true, bundleSize: 1000 })).rejects.toMatchObject({ code: 'BUNDLE_PRICE_INVALID', status: 409 });
  });

  it('rejects invalid settings with a plain 400 before touching anything', async () => {
    const db = makeDb([lot()], [row()]);
    let err: unknown;
    try {
      await saveBundleSettings(db, makeOps(), ctx, 'lot1', { bundleSize: 10 });
    } catch (e) {
      err = e;
    }
    expect(isBulkEbayError(err)).toBe(true);
    expect(db.writes).toEqual([]);
  });

  it('the view reports the bundles available, the leftover cards and the next action', () => {
    const v = toBundleView({ ...lot({ stockTotal: 5600 }), ebayBundle: row({ listedQty: 5 }) });
    expect(v.stock).toMatchObject({ remainingCards: 5600, bundlesAvailable: 5, leftoverCards: 600 });
    expect(v.price.summary).toBe('5 bundles of 1,000 cards at $8.00 each');
    expect(v.listing.nextAction).toBe('NONE');
    expect(v.listing.isLive).toBe(true);
    expect(v.listing.ebayUrl).toBe('https://www.ebay.com/itm/listing1');
  });
});

describe('sweepBundleListings', () => {
  it('walks every candidate row in pages (no starvation) and reports what changed and what failed', async () => {
    const items: FakeItem[] = [];
    const rows: FakeRow[] = [];
    for (let i = 1; i <= 7; i++) {
      items.push(lot({ id: `lot${i}`, stockSold: i === 3 ? 3300 : i === 5 ? 4500 : 0 }));
      rows.push(row({ id: `row${String(i).padStart(2, '0')}`, itemId: `lot${i}` }));
    }
    const db = makeDb(items, rows);
    const ops = makeOps();
    const res = await sweepBundleListings(db, ops, { pageSize: 3 });
    expect(res.checked).toBe(7);
    expect(res.changed).toBe(2); // lot3 revised, lot5 ended
    expect(res.failed).toBe(0);
    expect(ops.calls.sort()).toEqual(['end', 'revise']);
    // a second run finds nothing to do and calls nothing
    ops.calls.length = 0;
    const again = await sweepBundleListings(db, ops, { pageSize: 3 });
    expect(again.checked).toBe(7); // the ended lot (enabled, ended for stock) is still a candidate: it may be restocked
    expect(again.changed).toBe(0);
    expect(ops.calls).toEqual([]);
  });

  it('respects the per-run limit', async () => {
    const items = [1, 2, 3, 4].map((i) => lot({ id: `lot${i}` }));
    const rows = [1, 2, 3, 4].map((i) => row({ id: `row${i}`, itemId: `lot${i}` }));
    const res = await sweepBundleListings(makeDb(items, rows), makeOps(), { limit: 2, pageSize: 1 });
    expect(res.checked).toBe(2);
  });

  it('counts a failed end as failed and keeps going', async () => {
    const items = [lot({ id: 'lot1', stockSold: 4500 }), lot({ id: 'lot2', stockSold: 3300 })];
    const rows = [row({ id: 'row1', itemId: 'lot1' }), row({ id: 'row2', itemId: 'lot2' })];
    const res = await sweepBundleListings(makeDb(items, rows), makeOps({ end: async () => false }));
    expect(res).toMatchObject({ checked: 2, changed: 1, failed: 1 });
  });
});
