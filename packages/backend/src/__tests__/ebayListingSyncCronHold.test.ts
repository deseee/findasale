/**
 * Pull-sync hold guard (item editor unification, Wave 2: U2).
 * A held item (ebaySyncHeldAt) is skipped entirely: no price push-first, no pull, no eBay call.
 * A dirty item (ebayContentDirtyAt) keeps its title, description and condition (the inventory item is not even fetched)
 * but still syncs price. An untouched item behaves exactly as before.
 */

const mockPrisma: any = {
  item: { findMany: jest.fn(), update: jest.fn() },
  ebayPolicyMapping: { findUnique: jest.fn() },
  ebayConnection: { findUnique: jest.fn(), findMany: jest.fn() },
  organizer: { findUnique: jest.fn() },
  notification: { findFirst: jest.fn(), create: jest.fn() },
};
const mockRevise = jest.fn();

jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: unknown, fn: unknown) => fn }));
jest.mock('../controllers/ebayController', () => ({ refreshEbayAccessToken: jest.fn(async () => 'tok') }));
jest.mock('../services/ebayPriceRevisionService', () => ({ reviseEbayOfferPrice: (...a: unknown[]) => mockRevise(...a) }));
jest.mock('../services/markdownPricePropagationService', () => ({
  classifyPropagationFailure: () => 'RETRYABLE',
  formatPropagationFailureReason: () => 'reason',
  resolveSyncStateAfterFailure: () => 'FAILED_RETRYABLE',
}));
jest.mock('../services/ebayStoreSubscriptionService', () => ({
  fetchAndCacheEbayStoreSubscription: jest.fn().mockResolvedValue(undefined),
  isEbayStoreSubscriptionStale: () => false,
}));
jest.mock('../lib/ebayInsertionsQuotaTracker', () => ({
  reconcileEbayInsertionsUsage: jest.fn().mockResolvedValue(undefined),
  isEbayInsertionsReconciliationStale: () => false,
}));
jest.mock('../lib/ebayRateLimiter', () => ({ isEbayRateLimited: () => false }));

import { pullSyncForOrganizer } from '../jobs/ebayListingSyncCron';

const baseItem = (over: Record<string, unknown> = {}) => ({
  id: 'i1', title: 'Local Title', description: 'Local desc', price: 20, condition: 'USED',
  ebayListingId: 'L1', ebayOfferId: 'O1', priceUpdatedAt: null, ebayPriceSyncedAt: null,
  ebaySyncState: 'SYNCED', ebaySyncFailureReason: null, ebaySyncAttempts: 0,
  ebaySyncHeldAt: null, ebayContentDirtyAt: null,
  ...over,
});

let calls: string[];
beforeEach(() => {
  jest.clearAllMocks();
  calls = [];
  mockPrisma.item.update.mockResolvedValue({});
  mockPrisma.ebayPolicyMapping.findUnique.mockResolvedValue(null);
  mockPrisma.ebayConnection.findUnique.mockResolvedValue({ storeSubscriptionCheckedAt: new Date() });
  mockPrisma.organizer.findUnique.mockResolvedValue({ ebayInsertionsReconciledAt: new Date() });
  mockRevise.mockResolvedValue({ ok: true });
  (global as any).fetch = jest.fn(async (url: string) => {
    const path = decodeURIComponent(url.split('path=')[1] ?? '');
    calls.push(path);
    if (path.includes('/offer/')) return { ok: true, status: 200, json: async () => ({ sku: 'SKU1', pricingSummary: { price: { value: '30' } } }) };
    return { ok: true, status: 200, json: async () => ({ product: { title: 'eBay Title', description: 'eBay desc' }, condition: 'NEW' }) };
  });
});

describe('ebayListingSyncCron hold guard', () => {
  it('the item query selects the two guard columns', async () => {
    mockPrisma.item.findMany.mockResolvedValue([]);
    await pullSyncForOrganizer('org1');
    const select = mockPrisma.item.findMany.mock.calls[0][0].select;
    expect(select.ebaySyncHeldAt).toBe(true);
    expect(select.ebayContentDirtyAt).toBe(true);
  });

  it('a held item is skipped entirely: no push-first, no eBay call, no write', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      baseItem({ ebaySyncHeldAt: new Date(), priceUpdatedAt: new Date(), ebayPriceSyncedAt: null }), // even with a pending local price change
    ]);
    await pullSyncForOrganizer('org1');
    expect(mockRevise).not.toHaveBeenCalled();
    expect((global as any).fetch).not.toHaveBeenCalled();
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('a dirty item still pulls price but never title, description or condition, and never fetches the inventory item', async () => {
    mockPrisma.item.findMany.mockResolvedValue([baseItem({ ebayContentDirtyAt: new Date() })]);
    await pullSyncForOrganizer('org1');
    expect(calls.some((p) => p.includes('/inventory_item/'))).toBe(false);
    expect(mockPrisma.item.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.item.update.mock.calls[0][0].data).toEqual({ price: 30 });
  });

  it('a dirty item with a pending local price still runs the price push-first', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      baseItem({ ebayContentDirtyAt: new Date(), priceUpdatedAt: new Date(), ebayPriceSyncedAt: null }),
    ]);
    await pullSyncForOrganizer('org1');
    expect(mockRevise).toHaveBeenCalledTimes(1);
  });

  it('an untouched item behaves exactly as before: price, title, description and condition are pulled', async () => {
    mockPrisma.item.findMany.mockResolvedValue([baseItem()]);
    await pullSyncForOrganizer('org1');
    expect(calls.some((p) => p.includes('/inventory_item/'))).toBe(true);
    expect(mockPrisma.item.update.mock.calls[0][0].data).toEqual({
      price: 30, title: 'eBay Title', description: 'eBay desc', condition: 'NEW',
    });
  });

  it('only the held item is skipped: its neighbors in the same run are still synced', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      baseItem({ id: 'held', ebaySyncHeldAt: new Date() }),
      baseItem({ id: 'free' }),
    ]);
    await pullSyncForOrganizer('org1');
    expect(mockPrisma.item.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.item.update.mock.calls[0][0].where).toEqual({ id: 'free' });
  });
});
