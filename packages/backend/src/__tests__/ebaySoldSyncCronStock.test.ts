/**
 * 2026-10-13 (single inventory number): the READER side of the eBay sold sync (jobs/ebaySoldSyncCron.syncSoldItemsForOrganizer).
 * The platform's own number (stockTotal - stockSold) decides what is multi-quantity and what is sold out;
 * Item.ebayQuantityAvailable is only a mirror of the last quantity confirmed on eBay. In-memory database, eBay's order list faked.
 */
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: jest.fn((_opts: any, fn: any) => fn) }));
jest.mock('../lib/prisma', () => ({ prisma: require('./__fixtures__/ebayCronFakes').prisma }));
jest.mock('../controllers/ebayController', () => ({
  refreshEbayAccessToken: jest.fn(async () => 'token'),
  endEbayListingIfExists: jest.fn(async () => true),
}));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn(async () => undefined) }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn(async () => undefined) }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn(async () => undefined) }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn(async () => undefined) }));
jest.mock('../services/ebaySaleReopenService', () => ({ reopenEbayCancelledSale: jest.fn(async () => ({ reopened: false, code: 'X' })) }));
jest.mock('../services/ebayLiveListingsService', () => ({ fetchLiveEbayListings: jest.fn(async () => []) }));
jest.mock('../services/bulkLot/bulkLotEbayWiring', () => ({ reconcileBulkLotEbayInBackgroundIfEnabled: jest.fn() }));

import { createNotification } from '../lib/notificationService';
import { endEbayListingIfExists } from '../controllers/ebayController';
import { syncSoldItemsForOrganizer } from '../jobs/ebaySoldSyncCron';
import { store, FakeLot } from './__fixtures__/ebayCronFakes';

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

function unit(over: Partial<FakeLot> = {}): FakeLot {
  return {
    id: 'u1',
    title: 'Brass lamp',
    saleId: 'sale1',
    status: 'AVAILABLE',
    stockTotal: 4,
    stockSold: 0,
    ebayListingId: 'L1',
    ebayOfferId: 'O1',
    ebayQuantityAvailable: 4,
    ebayQuantitySold: 0,
    bundleSize: null,
    ...over,
  };
}

function orderFor(sku: string, quantity: number, orderId = 'ORD-1') {
  return { orderId, orderPaymentStatus: 'PAID', lineItems: [{ sku, lineItemId: 'LI-1', quantity, title: 'x', legacyItemId: 'L1' }] };
}

function setOrders(orders: any[]) {
  (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ orders }) }));
}

beforeEach(() => {
  store.reset();
  jest.clearAllMocks();
  delete process.env.CARD_BULK_LOTS_ENABLED;
  delete process.env.CARD_BULK_EBAY_ENABLED;
});

describe('ebaySoldSyncCron reads the platform number', () => {
  it('the candidate filter asks for stockTotal > 1, never for the eBay mirror', async () => {
    store.items = [unit()];
    setOrders([]);
    await syncSoldItemsForOrganizer('org1');
    const where = JSON.stringify(store.lastItemFindMany?.where);
    expect(where).toContain('"stockTotal":{"gt":1}');
    expect(where).not.toContain('ebayQuantityAvailable');
  });

  it('a SOLD multi-unit item is still a candidate; a SOLD single-unit item whose mirror says 5 is not', async () => {
    store.items = [
      unit({ id: 'multi', status: 'SOLD', stockTotal: 3, stockSold: 1, ebayQuantityAvailable: null }),
      unit({ id: 'single', status: 'SOLD', stockTotal: 1, stockSold: 1, ebayQuantityAvailable: 5 }),
    ];
    setOrders([]);
    await syncSoldItemsForOrganizer('org1');
    // run the fake's own filter through the real query: only the multi-unit row comes back
    const rows = await (require('./__fixtures__/ebayCronFakes').prisma.item.findMany as any)(store.lastItemFindMany);
    expect(rows.map((r: any) => r.id)).toEqual(['multi']);
  });

  it('after a partial sale the mirror equals the units left and nothing is pushed back to eBay', async () => {
    store.items = [unit({ stockTotal: 4, stockSold: 0, ebayQuantityAvailable: 4 })];
    setOrders([orderFor('FAS-u1', 1)]);
    await syncSoldItemsForOrganizer('org1');
    expect(store.item('u1')).toMatchObject({ stockSold: 1, ebayQuantitySold: 1, ebayQuantityAvailable: 3, status: 'AVAILABLE' });
    expect(endEbayListingIfExists).not.toHaveBeenCalled();
  });

  it('the "X of Y" copy counts sold on eBay plus what is left', async () => {
    store.items = [unit({ stockTotal: 4, stockSold: 0 })];
    setOrders([orderFor('FAS-u1', 1)]);
    await syncSoldItemsForOrganizer('org1');
    const body = (createNotification as jest.Mock).mock.calls[0][0].body as string;
    expect(body).toContain('sold a unit on eBay (1 of 4)');
    expect(body).not.toMatch(/[–—]/);
  });

  it('selling the last unit sells the item out, ends the listing and leaves the mirror at 0', async () => {
    store.items = [unit({ stockTotal: 2, stockSold: 1, ebayQuantityAvailable: 1 })];
    setOrders([orderFor('FAS-u1', 1)]);
    await syncSoldItemsForOrganizer('org1');
    expect(store.item('u1')).toMatchObject({ stockSold: 2, status: 'SOLD', ebayQuantityAvailable: 0 });
    expect(endEbayListingIfExists).toHaveBeenCalledWith('u1');
  });

  it('a stock pool desync (eBay sold more than the platform holds) still decides sold out from a fresh read of the platform number', async () => {
    // stockSold already equals stockTotal, so the guarded decrement refuses: the fallback must read stock fresh, not the stale mirror (5).
    store.items = [unit({ stockTotal: 2, stockSold: 2, ebayQuantityAvailable: 5 })];
    setOrders([orderFor('FAS-u1', 1)]);
    await syncSoldItemsForOrganizer('org1');
    expect(store.item('u1')).toMatchObject({ status: 'SOLD', ebayQuantityAvailable: 0 });
    expect(endEbayListingIfExists).toHaveBeenCalledWith('u1');
  });

  it('a desync with units still in the platform pool does not sell the item out', async () => {
    // order of 3 against 2 left: refused by the guard, but the platform still shows units, so the item stays AVAILABLE.
    store.items = [unit({ stockTotal: 5, stockSold: 3, ebayQuantityAvailable: 1 })];
    setOrders([orderFor('FAS-u1', 3)]);
    await syncSoldItemsForOrganizer('org1');
    expect(store.item('u1').status).toBe('AVAILABLE');
    expect(store.item('u1').ebayQuantityAvailable).toBe(2);
    expect(endEbayListingIfExists).not.toHaveBeenCalled();
  });
});
