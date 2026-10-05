/**
 * ADR-136 Addendum C (roadmap #659): the order side of eBay bundles. An eBay order line for a bulk lot bundle becomes a
 * sale record (EbaySoldEvent with bulkQuantity) and takes N x bundleSize cards from the lot through the real guarded
 * decrement (itemStockService.sellItemUnits). Covers: the pure absorb and give-back helpers, then the real sold sync
 * (jobs/ebaySoldSyncCron.syncSoldItemsForOrganizer) on an in-memory database with eBay's order list faked.
 * No network, no real database, no clock-dependent assertions.
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
import { reconcileBulkLotEbayInBackgroundIfEnabled } from '../services/bulkLot/bulkLotEbayWiring';
import { syncSoldItemsForOrganizer } from '../jobs/ebaySoldSyncCron';
import {
  absorbBundleOrderLine,
  cardsToGiveBack,
  releaseCancelledBundleLines,
  shortfallMessage,
} from '../services/bulkLot/bulkLotEbaySoldService';
import { InsufficientStockError } from '../services/itemStockService';
import { store, FakeLot } from './__fixtures__/ebayCronFakes';

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function pool(initial: number) {
  const state = { left: initial, calls: [] as number[] };
  const deps = {
    sellUnits: async (_id: string, units: number) => {
      state.calls.push(units);
      if (units > state.left) throw new InsufficientStockError('lot', units, state.left);
      state.left -= units;
      return { fullySoldOut: state.left < 1, remainingStock: state.left };
    },
    remainingCards: async () => state.left,
    isInsufficientStock: (e: unknown) => e instanceof InsufficientStockError,
  };
  return { state, deps };
}

describe('absorbBundleOrderLine', () => {
  it('takes bundles x bundleSize cards in one guarded decrement', async () => {
    const { state, deps } = pool(5000);
    const r = await absorbBundleOrderLine(deps, { itemId: 'lot1', bundleSize: 1000, bundles: 3 });
    expect(r).toEqual({ cards: 3000, taken: 3000, shortfall: 0, fullySoldOut: false, remainingCards: 2000 });
    expect(state.calls).toEqual([3000]);
  });

  it('marks the lot sold out when the order takes the last cards', async () => {
    const { deps } = pool(1000);
    expect(await absorbBundleOrderLine(deps, { itemId: 'lot1', bundleSize: 500, bundles: 2 })).toMatchObject({ taken: 1000, shortfall: 0, fullySoldOut: true, remainingCards: 0 });
  });

  it('never drops a paid order: a shortfall takes what is left and records the gap', async () => {
    const { state, deps } = pool(1200);
    const r = await absorbBundleOrderLine(deps, { itemId: 'lot1', bundleSize: 1000, bundles: 2 });
    expect(r).toMatchObject({ cards: 2000, taken: 1200, shortfall: 800, fullySoldOut: true, remainingCards: 0 });
    expect(state.calls).toEqual([2000, 1200]);
  });

  it('a lot already empty records the whole order as shortfall', async () => {
    const { deps } = pool(0);
    expect(await absorbBundleOrderLine(deps, { itemId: 'lot1', bundleSize: 500, bundles: 1 })).toMatchObject({ taken: 0, shortfall: 500, fullySoldOut: true });
  });

  it('survives a counter sale landing between the read and the take (retries with the new remainder)', async () => {
    let left = 1500;
    let first = true;
    const deps = {
      sellUnits: async (_id: string, units: number) => {
        if (units > left) throw new InsufficientStockError('lot', units, left);
        left -= units;
        return { fullySoldOut: left < 1, remainingStock: left };
      },
      remainingCards: async () => {
        const seen = left;
        if (first) {
          first = false;
          left -= 400; // the register sells 400 right after we read
        }
        return seen;
      },
      isInsufficientStock: (e: unknown) => e instanceof InsufficientStockError,
    };
    const r = await absorbBundleOrderLine(deps, { itemId: 'lot1', bundleSize: 1000, bundles: 2 });
    expect(r.taken + r.shortfall).toBe(2000);
    expect(r.taken).toBe(1100);
    expect(left).toBe(0);
  });

  it('rethrows an error that is not a shortfall, and refuses bad figures', async () => {
    const deps = { sellUnits: async () => { throw new Error('db down'); }, remainingCards: async () => 10, isInsufficientStock: () => false };
    await expect(absorbBundleOrderLine(deps, { itemId: 'lot1', bundleSize: 500, bundles: 1 })).rejects.toThrow('db down');
    await expect(absorbBundleOrderLine(pool(10).deps, { itemId: 'lot1', bundleSize: 500, bundles: 0 })).rejects.toThrow(/bad bundles/);
  });
});

describe('cancelled or refunded bundle orders give cards back once', () => {
  it('gives back what was owed minus what the lot could not supply', () => {
    expect(cardsToGiveBack({ bulkQuantity: 2000, bulkShortfall: null })).toBe(2000);
    expect(cardsToGiveBack({ bulkQuantity: 2000, bulkShortfall: 800 })).toBe(1200);
    expect(cardsToGiveBack({ bulkQuantity: 500, bulkShortfall: 900 })).toBe(0);
  });

  it('claims each ledger row once, so a second run gives nothing back', async () => {
    const claimed = new Set<string>();
    const given: Array<[string, number]> = [];
    const deps = {
      claim: async (id: string) => (claimed.has(id) ? false : (claimed.add(id), true)),
      releaseCards: async (itemId: string, cards: number) => { given.push([itemId, cards]); },
    };
    const lines = [
      { eventId: 'e1', itemId: 'lot1', bulkQuantity: 1500, bulkShortfall: null },
      { eventId: 'e2', itemId: 'lot1', bulkQuantity: 1000, bulkShortfall: 400 },
    ];
    expect(await releaseCancelledBundleLines(deps, lines)).toEqual({ lines: 2, cards: 2100, itemIds: ['lot1'] });
    expect(await releaseCancelledBundleLines(deps, lines)).toEqual({ lines: 0, cards: 0, itemIds: [] });
    expect(given).toEqual([['lot1', 1500], ['lot1', 600]]);
  });

  it('the shortfall sentence tells the organizer what to do, in plain words', () => {
    const m = shortfallMessage('Bulk commons', '12-3456', 2000, 800);
    expect(m).toContain('needs 2,000 cards');
    expect(m).toContain('only had 1,200 left');
    expect(m).toContain('cancel the order on eBay');
    expect(m).not.toMatch(/[–—]/);
  });
});

// ---------------------------------------------------------------------------
// The real sold sync
// ---------------------------------------------------------------------------

function lot(over: Partial<FakeLot> = {}): FakeLot {
  return {
    id: 'lot1',
    title: 'Bulk commons',
    saleId: 'sale1',
    status: 'AVAILABLE',
    stockTotal: 5000,
    stockSold: 0,
    ebayListingId: 'L1',
    ebayOfferId: 'O1',
    ebayQuantityAvailable: 5,
    ebayQuantitySold: 0,
    bundleSize: 1000,
    ...over,
  };
}

function orderFor(sku: string, quantity: number, over: Record<string, unknown> = {}) {
  return { orderId: over.orderId ?? 'ORD-1', orderPaymentStatus: 'PAID', lineItems: [{ sku, lineItemId: over.lineItemId ?? 'LI-1', quantity, title: 'x', legacyItemId: 'L1' }], ...over };
}

function setOrders(orders: any[]) {
  (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ orders }) }));
}

const flagsOn = () => {
  process.env.CARD_BULK_LOTS_ENABLED = 'true';
  process.env.CARD_BULK_EBAY_ENABLED = 'true';
};
const flagsOff = () => {
  delete process.env.CARD_BULK_LOTS_ENABLED;
  delete process.env.CARD_BULK_EBAY_ENABLED;
};

beforeEach(() => {
  store.reset();
  jest.clearAllMocks();
  flagsOn();
});
afterAll(flagsOff);

describe('syncSoldItemsForOrganizer: a bundle order becomes a sale record', () => {
  it('3 bundles of 500 take 1,500 cards, write the ledger with bulkQuantity, keep the lot AVAILABLE and line eBay up', async () => {
    store.items = [lot({ bundleSize: 500, stockTotal: 5000 })];
    setOrders([orderFor('FAS-lot1', 3)]);
    const res = await syncSoldItemsForOrganizer('org1');
    expect(res.synced).toBe(1);
    expect(store.item('lot1')).toMatchObject({ stockSold: 1500, status: 'AVAILABLE', ebayQuantitySold: 3 });
    expect(store.ledger).toHaveLength(1);
    expect(store.ledger[0]).toMatchObject({ itemId: 'lot1', ebayOrderId: 'ORD-1', ebayLineItemId: 'LI-1', quantitySold: 3, bulkQuantity: 1500 });
    expect(store.ledger[0].bulkShortfall ?? null).toBeNull();
    expect(reconcileBulkLotEbayInBackgroundIfEnabled).toHaveBeenCalledWith('lot1', 'ebay sold sync');
    expect(endEbayListingIfExists).not.toHaveBeenCalled();
    const body = (createNotification as jest.Mock).mock.calls[0][0].body as string;
    expect(body).toContain('3 bundles of 500 cards (1,500 cards) sold on eBay.');
    expect(body).toContain('3,500 cards left in the lot.');
  });

  it('is idempotent: the same order again records nothing and takes no more cards', async () => {
    store.items = [lot({ bundleSize: 500 })];
    setOrders([orderFor('FAS-lot1', 3)]);
    await syncSoldItemsForOrganizer('org1');
    const again = await syncSoldItemsForOrganizer('org1');
    expect(again.synced).toBe(0);
    expect(store.item('lot1').stockSold).toBe(1500);
    expect(store.ledger).toHaveLength(1);
  });

  it('matches the date-appended SKU a relisted bundle carries', async () => {
    store.items = [lot({ bundleSize: 1000 })];
    setOrders([orderFor('FAS-lot1 2026-10-05', 1)]);
    await syncSoldItemsForOrganizer('org1');
    expect(store.item('lot1').stockSold).toBe(1000);
    expect(store.ledger[0].bulkQuantity).toBe(1000);
  });

  it('selling the last bundle sells the lot out and withdraws the listing', async () => {
    store.items = [lot({ bundleSize: 1000, stockTotal: 2000, stockSold: 1000 })];
    setOrders([orderFor('FAS-lot1', 1)]);
    await syncSoldItemsForOrganizer('org1');
    expect(store.item('lot1')).toMatchObject({ stockSold: 2000, status: 'SOLD', lastSoldVia: 'EBAY' });
    expect(endEbayListingIfExists).toHaveBeenCalledWith('lot1');
  });

  it('a counter sale got there first: takes what is left, records the shortfall, tells the organizer, never loses the order', async () => {
    store.items = [lot({ bundleSize: 1000, stockTotal: 5000, stockSold: 4400 })]; // 600 left, order wants 2,000
    setOrders([orderFor('FAS-lot1', 2)]);
    const res = await syncSoldItemsForOrganizer('org1');
    expect(res.synced).toBe(1);
    expect(store.item('lot1')).toMatchObject({ stockSold: 5000, status: 'SOLD' });
    expect(store.ledger[0]).toMatchObject({ bulkQuantity: 2000, bulkShortfall: 1400 });
    const titles = (createNotification as jest.Mock).mock.calls.map((c) => c[0].title);
    expect(titles).toContain('eBay bundle order is short on cards');
    expect(titles).toContain('Item sold on eBay');
  });

  it('a fully short order (the lot was already sold out by status) is still recorded with the whole order as shortfall', async () => {
    store.items = [lot({ bundleSize: 500, stockTotal: 1000, stockSold: 1000, status: 'SOLD' })];
    setOrders([orderFor('FAS-lot1', 1)]);
    await syncSoldItemsForOrganizer('org1');
    expect(store.ledger[0]).toMatchObject({ bulkQuantity: 500, bulkShortfall: 500 });
    expect(store.item('lot1').stockSold).toBe(1000);
  });

  it('cancelled and unpaid orders are not sales', async () => {
    store.items = [lot({ bundleSize: 500 })];
    setOrders([orderFor('FAS-lot1', 2, { orderId: 'C1', cancelStatus: { cancelState: 'CANCELED' } }), orderFor('FAS-lot1', 2, { orderId: 'U1', orderPaymentStatus: 'PENDING', lineItemId: 'LI-9' })]);
    const res = await syncSoldItemsForOrganizer('org1');
    expect(res.synced).toBe(0);
    expect(store.item('lot1').stockSold).toBe(0);
    expect(store.ledger).toHaveLength(0);
  });

  it('an ordinary item sold on eBay is unchanged: units, not cards, and no bundle fields on the ledger', async () => {
    store.items = [lot({ id: 'plain1', title: 'A figurine', bundleSize: null, stockTotal: 3, stockSold: 0, ebayQuantityAvailable: 3 })];
    setOrders([orderFor('FAS-plain1', 2)]);
    await syncSoldItemsForOrganizer('org1');
    expect(store.item('plain1')).toMatchObject({ stockSold: 2, ebayQuantitySold: 2 });
    expect(store.ledger[0].bulkQuantity ?? null).toBeNull();
    expect(reconcileBulkLotEbayInBackgroundIfEnabled).not.toHaveBeenCalled();
  });

  it('with the lot flag OFF the sync never reads the bundle table and treats every item as before', async () => {
    delete process.env.CARD_BULK_LOTS_ENABLED;
    delete process.env.CARD_BULK_EBAY_ENABLED;
    store.items = [lot({ bundleSize: 500, stockTotal: 5, stockSold: 0 })];
    setOrders([orderFor('FAS-lot1', 2)]);
    await syncSoldItemsForOrganizer('org1');
    expect(JSON.stringify(store.lastItemFindMany)).not.toContain('ebayBundle');
    expect(store.item('lot1').stockSold).toBe(2); // units, exactly like any multi-quantity item
    expect(store.ledger[0].bulkQuantity ?? null).toBeNull();
    expect(reconcileBulkLotEbayInBackgroundIfEnabled).not.toHaveBeenCalled();
  });

  it('with the bundle flag OFF but the lot flag ON, an order for a bundle listing that is still live is absorbed per bundle', async () => {
    delete process.env.CARD_BULK_EBAY_ENABLED;
    store.items = [lot({ bundleSize: 500, stockTotal: 5000, stockSold: 0 })];
    setOrders([orderFor('FAS-lot1', 2)]);
    await syncSoldItemsForOrganizer('org1');
    expect(store.item('lot1').stockSold).toBe(1000); // 2 bundles x 500 cards, never 2 cards
    expect(store.ledger[0]).toMatchObject({ bulkQuantity: 1000 });
  });

  it('a cancelled bundle order gives its cards back exactly once, and the lot returns to AVAILABLE', async () => {
    store.items = [lot({ bundleSize: 500, stockTotal: 1500, stockSold: 0 })];
    setOrders([orderFor('FAS-lot1', 3)]);
    await syncSoldItemsForOrganizer('org1');
    expect(store.item('lot1')).toMatchObject({ stockSold: 1500, status: 'SOLD' });
    // the buyer cancels; eBay now reports the order as cancelled
    setOrders([{ orderId: 'ORD-1', cancelStatus: { cancelState: 'CANCELED' }, orderPaymentStatus: 'PAID', lineItems: [{ sku: 'FAS-lot1', lineItemId: 'LI-1', quantity: 3 }] }]);
    await syncSoldItemsForOrganizer('org1');
    expect(store.item('lot1')).toMatchObject({ stockSold: 0, status: 'AVAILABLE' });
    expect(store.ledger[0].bulkReleasedAt).toBeInstanceOf(Date);
    await syncSoldItemsForOrganizer('org1');
    expect(store.item('lot1').stockSold).toBe(0); // not given back twice
    expect(reconcileBulkLotEbayInBackgroundIfEnabled).toHaveBeenCalledWith('lot1', 'ebay cancelled bundle order');
  });

  it('a cancelled order that was short gives back only the cards that were taken', async () => {
    store.items = [lot({ bundleSize: 1000, stockTotal: 3000, stockSold: 2000 })]; // 1,000 left, order wants 2,000
    setOrders([orderFor('FAS-lot1', 2)]);
    await syncSoldItemsForOrganizer('org1');
    expect(store.ledger[0]).toMatchObject({ bulkQuantity: 2000, bulkShortfall: 1000 });
    expect(store.item('lot1').stockSold).toBe(3000);
    setOrders([{ orderId: 'ORD-1', cancelStatus: { cancelState: 'CANCELED' }, lineItems: [{ sku: 'FAS-lot1', lineItemId: 'LI-1', quantity: 2 }] }]);
    await syncSoldItemsForOrganizer('org1');
    expect(store.item('lot1').stockSold).toBe(2000); // 1,000 cards come back, not 2,000
  });
});
