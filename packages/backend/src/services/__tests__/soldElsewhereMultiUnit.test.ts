/**
 * S-SINGLE-INVENTORY-NUMBER (2026-10-13): every sold-elsewhere detection path takes exactly ONE unit of a multi-unit item and
 * leaves the listings up; only the unit that empties the stock runs the full sold fan-out. Single-unit items are unchanged, and a
 * repeated poll / duplicate event never takes a second unit.
 *
 * Everything is an in-memory fake: items, the ProcessedWebhookEvent marker table, MarketplaceListingJob rows, the guarded stock
 * decrement and the withdraw connectors. No database, no market call.
 */

const mockDb: {
  items: Map<string, any>;
  events: Set<string>;
  jobs: any[];
} = { items: new Map(), events: new Set(), jobs: [] };

const mockTx: any = {
  $queryRaw: jest.fn(async (_s: any, id: string) => {
    const it = mockDb.items.get(id);
    return it ? [{ status: it.status, stockTotal: it.stockTotal, listingType: it.listingType }] : [];
  }),
  processedWebhookEvent: {
    createMany: jest.fn(async ({ data }: any) => {
      let count = 0;
      for (const d of data) {
        if (!mockDb.events.has(d.eventId)) { mockDb.events.add(d.eventId); count++; }
      }
      return { count };
    }),
  },
  marketplaceListingJob: {
    findFirst: jest.fn(async ({ where }: any) => {
      const rows = mockDb.jobs.filter(
        (j) =>
          j.itemId === where.itemId &&
          j.platform === where.platform &&
          !(j.action === 'REMOVE' && j.status === 'SKIPPED') &&
          (where.remoteListingId === undefined || j.remoteListingId === where.remoteListingId)
      );
      return rows.length ? rows[rows.length - 1] : null;
    }),
    create: jest.fn(async ({ data }: any) => { mockDb.jobs.push({ ...data, createdAt: new Date() }); return data; }),
  },
};

jest.mock('../../lib/prisma', () => ({
  prisma: {
    item: {
      update: jest.fn(async ({ where, data }: any) => Object.assign(mockDb.items.get(where.id), data)),
      findUnique: jest.fn(async ({ where }: any) => mockDb.items.get(where.id) ?? null),
    },
    $transaction: jest.fn(async (cb: any) => cb(mockTx)),
  },
}));
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../utils/cronGuard', () => ({ cronGuard: (_o: any, fn: any) => fn }));
jest.mock('../../lib/notificationService', () => ({ createNotification: jest.fn(async () => undefined) }));
jest.mock('../itemStockService', () => ({
  sellItemUnits: jest.fn(async (id: string, n: number) => {
    const it = mockDb.items.get(id);
    it.stockSold += n;
    const total = it.stockTotal ?? 1;
    const fullySoldOut = it.stockSold >= total;
    if (fullySoldOut) it.status = 'SOLD';
    return { fullySoldOut, remainingStock: Math.max(total - it.stockSold, 0) };
  }),
}));
jest.mock('../itemSaleGuard', () => {
  class ItemAlreadyCommittedError extends Error {}
  return {
    ItemAlreadyCommittedError,
    commitItemSale: jest.fn(async (id: string) => {
      const it = mockDb.items.get(id);
      if (!it || it.status !== 'AVAILABLE') throw new ItemAlreadyCommittedError('already');
      it.status = 'SOLD';
      return {};
    }),
  };
});
jest.mock('../marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn(async () => undefined) }));
jest.mock('../bulkLot/bulkLotInvariants', () => ({ lotChannelRefusal: jest.fn(async () => null) }));
jest.mock('../bulkLot/bulkLotConfig', () => ({ isBulkLotsEnabled: () => false }));
jest.mock('../saleReopenGuard', () => ({ isReportOfCancelledReopenedSale: jest.fn(async () => false) }));
jest.mock('../../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../shopifyService', () => ({ markShopifyItemSold: jest.fn(async () => undefined) }));
jest.mock('../marketplace/discogsListingConnector', () => ({
  withdrawDiscogsListingIfExists: jest.fn(async () => undefined),
  fetchRecentDiscogsSellerOrders: jest.fn(),
}));
jest.mock('../marketplace/reverbConnector', () => ({
  withdrawReverbListingIfExists: jest.fn(async () => undefined),
  fetchRecentReverbSellerOrders: jest.fn(),
}));
jest.mock('../marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn(async () => 'skipped') }));
// The real module exists now. It must NOT be a virtual mock: a virtual mock is keyed by the extension-less path, so the lazy
// `import('./inventoryStockSync')` in soldElsewhereUnitSale.ts (which resolves to the real .ts file) bypassed it, ran the real
// syncItemStock against this suite's prisma stub, and the spy below was never called.
jest.mock('../inventoryStockSync', () => ({
  syncItemStock: jest.fn(async (itemId: string) => ({ itemId, inStock: 0, outcomes: [] })),
}));

import { commitFacebookNativeSale } from '../facebookNativeSaleService';
import { commitItemSale } from '../itemSaleGuard';
import { sellItemUnits } from '../itemStockService';
import { endEbayListingIfExists } from '../../controllers/ebayController';
import { markShopifyItemSold } from '../shopifyService';
import { withdrawDiscogsListingIfExists } from '../marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../marketplace/reverbConnector';
import { withdrawEtsyListingIfExists } from '../marketplace/etsyConnector';
import { syncItemStock } from '../inventoryStockSync';
import { syncDiscogsSoldItemsForOrganizer } from '../../jobs/discogsSoldSyncCron';
import { syncReverbSoldItemsForOrganizer } from '../../jobs/reverbSoldSyncCron';

const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };

function seedItem(id: string, over: Record<string, any> = {}) {
  mockDb.items.set(id, { id, status: 'AVAILABLE', stockTotal: 3, stockSold: 0, listingType: 'FIXED', lastSoldVia: null, ...over });
}
const noWithdrawals = () => {
  expect(endEbayListingIfExists).not.toHaveBeenCalled();
  expect(markShopifyItemSold).not.toHaveBeenCalled();
  expect(withdrawDiscogsListingIfExists).not.toHaveBeenCalled();
  expect(withdrawReverbListingIfExists).not.toHaveBeenCalled();
  expect(withdrawEtsyListingIfExists).not.toHaveBeenCalled();
};

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());
beforeEach(() => {
  mockDb.items.clear(); mockDb.events.clear(); mockDb.jobs.length = 0;
  jest.clearAllMocks();
});

describe('Discogs order poll (no quantity API, dedupe = order id)', () => {
  const orders = (ids: string[]) => ids.map((id) => ({ id, status: 'Payment Received', items: [{ id: 'L1' }] }));
  const run = (orderIds: string[]) => syncDiscogsSoldItemsForOrganizer('org', {
    loadListedItems: async () => [{ id: 'disc', title: 'LP', saleId: null, discogsListingId: 'L1' }],
    fetchOrders: async () => orders(orderIds),
    notify: async () => undefined,
  });

  it('multi-unit: one order takes one unit, keeps the item AVAILABLE and withdraws nothing', async () => {
    seedItem('disc');
    const r = await run(['o1']);
    await flush();
    expect(r.sold).toEqual([{ itemId: 'disc', orderId: 'o1' }]);
    expect(mockDb.items.get('disc')).toEqual(expect.objectContaining({ status: 'AVAILABLE', stockSold: 1 }));
    expect(commitItemSale).not.toHaveBeenCalled();
    noWithdrawals();
    expect(syncItemStock).toHaveBeenCalledWith('disc', 'sold-on-discogs');
  });

  it('a repeated poll of the same order does not take a second unit', async () => {
    seedItem('disc');
    await run(['o1']);
    const again = await run(['o1']);
    const third = await run(['o1']);
    expect(again.sold).toEqual([]);
    expect(again.alreadySold).toBe(1);
    expect(third.alreadySold).toBe(1);
    expect(mockDb.items.get('disc').stockSold).toBe(1);
    expect(sellItemUnits).toHaveBeenCalledTimes(1);
  });

  it('distinct orders each take one unit; the order that empties the stock runs the full cascade (minus Discogs itself)', async () => {
    seedItem('disc');
    await run(['o1']);
    await run(['o2']);
    expect(mockDb.items.get('disc')).toEqual(expect.objectContaining({ status: 'AVAILABLE', stockSold: 2 }));
    noWithdrawals();
    await run(['o3']);
    expect(mockDb.items.get('disc')).toEqual(expect.objectContaining({ status: 'SOLD', stockSold: 3, lastSoldVia: 'DISCOGS' }));
    expect(endEbayListingIfExists).toHaveBeenCalledWith('disc');
    expect(markShopifyItemSold).toHaveBeenCalledWith('disc');
    expect(withdrawReverbListingIfExists).toHaveBeenCalledWith('disc');
    expect(withdrawEtsyListingIfExists).toHaveBeenCalledWith('disc');
    expect(withdrawDiscogsListingIfExists).not.toHaveBeenCalled();
  });

  it('two distinct orders in the SAME poll each take one unit, and a repeat of that poll takes none', async () => {
    seedItem('disc', { stockTotal: 5 });
    const r = await run(['o1', 'o2']);
    expect(r.sold).toEqual([{ itemId: 'disc', orderId: 'o1' }, { itemId: 'disc', orderId: 'o2' }]);
    expect(mockDb.items.get('disc')).toEqual(expect.objectContaining({ status: 'AVAILABLE', stockSold: 2 }));
    const again = await run(['o1', 'o2']);
    expect(again.sold).toEqual([]);
    expect(again.alreadySold).toBe(2);
    expect(mockDb.items.get('disc').stockSold).toBe(2);
    noWithdrawals();
  });

  it('single-unit item with two live orders on the listing: sold once, the second order is alreadyCommitted', async () => {
    seedItem('disc', { stockTotal: 1 });
    const r = await run(['o1', 'o2']);
    expect(r.sold).toEqual([{ itemId: 'disc', orderId: 'o1' }]);
    expect(r.alreadySold).toBe(1);
    expect(mockDb.items.get('disc')).toEqual(expect.objectContaining({ status: 'SOLD' }));
    expect(sellItemUnits).not.toHaveBeenCalled();
  });

  it('single-unit item is unchanged: whole-item SOLD, lastSoldVia, full cascade, no marker written', async () => {
    seedItem('disc', { stockTotal: 1 });
    const r = await run(['o1']);
    expect(r.sold).toEqual([{ itemId: 'disc', orderId: 'o1' }]);
    expect(commitItemSale).toHaveBeenCalledWith('disc', 'SOLD', ['AVAILABLE']);
    expect(mockDb.items.get('disc')).toEqual(expect.objectContaining({ status: 'SOLD', lastSoldVia: 'DISCOGS' }));
    expect(sellItemUnits).not.toHaveBeenCalled();
    expect(mockDb.events.size).toBe(0);
    expect(endEbayListingIfExists).toHaveBeenCalledWith('disc');
    expect(withdrawDiscogsListingIfExists).not.toHaveBeenCalled();
    await flush();
    expect(syncItemStock).not.toHaveBeenCalled();
  });

  it('null stockTotal behaves as a single unit', async () => {
    seedItem('disc', { stockTotal: null });
    await run(['o1']);
    expect(commitItemSale).toHaveBeenCalled();
    expect(sellItemUnits).not.toHaveBeenCalled();
  });
});

describe('Reverb order poll (dedupe = order number)', () => {
  const run = (nums: string[]) => syncReverbSoldItemsForOrganizer('org', {
    loadListedItems: async () => [{ id: 'rev', title: 'Amp', saleId: null, reverbListingId: 'R1' }],
    fetchOrders: async () => nums.map((n) => ({ orderNumber: n, status: 'paid', listingId: 'R1' })) as any,
    notify: async () => undefined,
  });

  it('multi-unit: takes one unit once per order across repeated polls, withdraws nothing', async () => {
    seedItem('rev', { stockTotal: 2 });
    await run(['5']);
    await run(['5']);
    await run(['5']);
    await flush();
    expect(mockDb.items.get('rev')).toEqual(expect.objectContaining({ status: 'AVAILABLE', stockSold: 1 }));
    noWithdrawals();
    expect(syncItemStock).toHaveBeenCalledTimes(1);
    expect(syncItemStock).toHaveBeenCalledWith('rev', 'sold-on-reverb');
  });

  it('two distinct orders in the SAME poll each take one unit, and a repeat of that poll takes none', async () => {
    seedItem('rev', { stockTotal: 5 });
    const r = await run(['5', '6']);
    expect(r.sold).toEqual([{ itemId: 'rev', orderNumber: '5' }, { itemId: 'rev', orderNumber: '6' }]);
    expect(mockDb.items.get('rev')).toEqual(expect.objectContaining({ status: 'AVAILABLE', stockSold: 2 }));
    const again = await run(['5', '6']);
    expect(again.sold).toEqual([]);
    expect(again.alreadySold).toBe(2);
    expect(mockDb.items.get('rev').stockSold).toBe(2);
    noWithdrawals();
  });

  it('single-unit item with two live orders on the listing: sold once, the second order is alreadyCommitted', async () => {
    seedItem('rev', { stockTotal: 1 });
    const r = await run(['5', '6']);
    expect(r.sold).toEqual([{ itemId: 'rev', orderNumber: '5' }]);
    expect(r.alreadySold).toBe(1);
    expect(mockDb.items.get('rev').status).toBe('SOLD');
    expect(sellItemUnits).not.toHaveBeenCalled();
  });

  it('the last unit runs the cascade but leaves the Reverb listing alone', async () => {
    seedItem('rev', { stockTotal: 2 });
    await run(['5']);
    await run(['6']);
    expect(mockDb.items.get('rev')).toEqual(expect.objectContaining({ status: 'SOLD', lastSoldVia: 'REVERB' }));
    expect(endEbayListingIfExists).toHaveBeenCalledWith('rev');
    expect(withdrawDiscogsListingIfExists).toHaveBeenCalledWith('rev');
    expect(withdrawReverbListingIfExists).not.toHaveBeenCalled();
  });

  it('single-unit item is unchanged', async () => {
    seedItem('rev', { stockTotal: 1 });
    await run(['5']);
    expect(commitItemSale).toHaveBeenCalledWith('rev', 'SOLD', ['AVAILABLE']);
    expect(mockDb.items.get('rev').status).toBe('SOLD');
    expect(withdrawReverbListingIfExists).not.toHaveBeenCalled();
    expect(endEbayListingIfExists).toHaveBeenCalled();
  });
});

describe('Facebook (DOM scan / order e-mail) -> soldOnPlatform FACEBOOK, dedupe = the live FACEBOOK listing row', () => {
  const fbOpts = { soldOnPlatform: { platform: 'FACEBOOK' as const, remoteListingId: null } };
  const post = (itemId: string) => mockDb.jobs.push({ itemId, platform: 'FACEBOOK', action: 'POST', status: 'POSTED', remoteListingId: 'https://www.facebook.com/marketplace/you/selling', createdAt: new Date() });

  it('multi-unit: one unit, item stays AVAILABLE, no other market withdrawn; a duplicate report takes nothing', async () => {
    seedItem('fb'); post('fb');
    const first = await commitFacebookNativeSale('fb', 'FB_NATIVE', fbOpts);
    expect(first).toEqual({ ok: true, alreadyCommitted: false, partial: true, remainingStock: 2 });
    const dup = await commitFacebookNativeSale('fb', 'FB_NATIVE', fbOpts);
    expect(dup).toEqual(expect.objectContaining({ alreadyCommitted: true, noopReason: 'no_live_posted_row' }));
    expect(mockDb.items.get('fb')).toEqual(expect.objectContaining({ status: 'AVAILABLE', stockSold: 1 }));
    noWithdrawals();
    await flush();
    expect(syncItemStock).toHaveBeenCalledWith('fb', 'sold-on-facebook');
  });

  it('single-unit item with soldOnPlatform is unchanged (legacy whole-item SOLD)', async () => {
    seedItem('fb', { stockTotal: 1 }); post('fb');
    const r = await commitFacebookNativeSale('fb', 'FB_NATIVE', fbOpts);
    expect(r).toEqual({ ok: true, alreadyCommitted: false });
    expect(commitItemSale).toHaveBeenCalledWith('fb', 'SOLD', ['AVAILABLE']);
    expect(endEbayListingIfExists).toHaveBeenCalledWith('fb');
  });
});

describe('commitFacebookNativeSale with no platform (operator route / generic callers)', () => {
  it('multi-unit with a dedupeKey: first call takes a unit, a repeat of the same key does not', async () => {
    seedItem('op');
    const key = 'sold-unit:FB_NATIVE:evt1:op';
    const a = await commitFacebookNativeSale('op', 'FB_NATIVE', { dedupeKey: key });
    const b = await commitFacebookNativeSale('op', 'FB_NATIVE', { dedupeKey: key });
    expect(a).toEqual({ ok: true, alreadyCommitted: false, partial: true, remainingStock: 2 });
    expect(b).toEqual({ ok: true, alreadyCommitted: true, noopReason: 'event_already_counted', alreadyCounted: true });
    expect(mockDb.items.get('op').stockSold).toBe(1);
    noWithdrawals();
  });

  it('multi-unit without a key still takes ONE unit (never a whole-item SOLD)', async () => {
    seedItem('op');
    const r = await commitFacebookNativeSale('op', 'FB_NATIVE');
    expect(r.partial).toBe(true);
    expect(mockDb.items.get('op')).toEqual(expect.objectContaining({ status: 'AVAILABLE', stockSold: 1 }));
    expect(commitItemSale).not.toHaveBeenCalled();
    noWithdrawals();
  });

  it('item not AVAILABLE is an idempotent no-op', async () => {
    seedItem('op', { status: 'SOLD', stockSold: 3 });
    const r = await commitFacebookNativeSale('op', 'FB_NATIVE', { dedupeKey: 'sold-unit:FB_NATIVE:e:op' });
    expect(r).toEqual({ ok: true, alreadyCommitted: true, noopReason: 'item_status_SOLD' });
    expect(sellItemUnits).not.toHaveBeenCalled();
    expect(mockDb.events.size).toBe(0);
  });

  it('CONSIGNOR_TAG keeps its own path even with stock > 1', async () => {
    seedItem('tag', { listingType: 'CONSIGNOR_TAG' });
    const r = await commitFacebookNativeSale('tag', 'FB_NATIVE', { dedupeKey: 'sold-unit:FB_NATIVE:e:tag' });
    expect(r).toEqual({ ok: true, alreadyCommitted: false });
    expect(commitItemSale).toHaveBeenCalledWith('tag', 'SOLD', ['AVAILABLE']);
    expect(sellItemUnits).not.toHaveBeenCalled();
  });

  it('single-unit item: exactly the legacy path', async () => {
    seedItem('one', { stockTotal: 1 });
    const r = await commitFacebookNativeSale('one', 'FB_NATIVE');
    expect(r).toEqual({ ok: true, alreadyCommitted: false });
    expect(mockDb.items.get('one')).toEqual(expect.objectContaining({ status: 'SOLD', lastSoldVia: 'FB_NATIVE' }));
    expect(endEbayListingIfExists).toHaveBeenCalledWith('one');
    const again = await commitFacebookNativeSale('one', 'FB_NATIVE');
    expect(again).toEqual({ ok: true, alreadyCommitted: true });
  });
});
