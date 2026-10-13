/**
 * ebaySaleReopenService.reopenEbayCancelledSale: a cancelled eBay order gives back ONLY its own units (2026-10-13, single inventory number).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 */
const mockPrisma: any = {
  item: { findUnique: jest.fn(), updateMany: jest.fn() },
  ebaySoldEvent: { findMany: jest.fn() },
  purchase: { findFirst: jest.fn() },
  organizer: { findUnique: jest.fn() },
  $transaction: jest.fn(),
  $executeRaw: jest.fn(),
};
const mockFetchOrder = jest.fn();
const mockClassify = jest.fn();
const mockFetchLive = jest.fn();
const mockSyncStock = jest.fn();

jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/ebayOrderState', () => ({
  fetchEbayOrder: (...a: unknown[]) => mockFetchOrder(...a),
  classifyEbayOrderLine: (...a: unknown[]) => mockClassify(...a),
}));
jest.mock('../services/ebayLiveListingsService', () => ({
  fetchLiveEbayListings: (...a: unknown[]) => mockFetchLive(...a),
  itemIdFromFasSku: (sku: string) => (sku && sku.startsWith('FAS-') ? sku.slice(4) : null),
  lookupOfferIdForSku: jest.fn().mockResolvedValue(null),
}));
jest.mock('../services/inventoryStockSync', () => ({ syncItemStock: (...a: unknown[]) => mockSyncStock(...a) }));

import { reopenEbayCancelledSale } from '../services/ebaySaleReopenService';

const OPTS = { source: 'organizer' as const, organizerId: 'org1', actorUserId: 'u1', accessToken: 'tok' };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockPrisma.item.findUnique.mockResolvedValue({
    id: 'item1', title: 'Lamp', status: 'SOLD', lastSoldVia: 'EBAY', saleId: 's1', ebayListingId: 'L1', ebayOfferId: 'O1', stockTotal: 1, ebayQuantityAvailable: 0,
  });
  mockPrisma.ebaySoldEvent.findMany.mockResolvedValue([{ ebayOrderId: 'o1', ebayLineItemId: 'l1', quantitySold: 1 }]);
  mockPrisma.purchase.findFirst.mockResolvedValue(null);
  mockPrisma.organizer.findUnique.mockResolvedValue({ userId: 'u1' });
  mockFetchOrder.mockResolvedValue({ lineItems: [{ lineItemId: 'l1' }] });
  mockClassify.mockReturnValue({ counts: false, kind: 'CANCELLED', reason: 'cancelled' });
  mockFetchLive.mockResolvedValue({ complete: true, listings: [{ itemId: 'L1', sku: 'FAS-item1' }] });
  mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.$executeRaw.mockResolvedValue(0);
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  mockSyncStock.mockResolvedValue({});
});

describe('reopenEbayCancelledSale: only the cancelled orders\' units come back', () => {
  it('decrements stockSold and ebayQuantitySold by the ledger quantity (never resets to 0), floors both, then syncs the markets', async () => {
    const r: any = await reopenEbayCancelledSale('item1', OPTS);
    expect(r.ok).toBe(true);
    const arg = mockPrisma.item.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'item1', status: 'SOLD', lastSoldVia: 'EBAY', OR: [{ stockTotal: null }, { stockTotal: { lte: 1 } }] });
    expect(arg.data).toMatchObject({ status: 'AVAILABLE', stockSold: { decrement: 1 }, ebayQuantitySold: { decrement: 1 }, lastSoldVia: null });
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$executeRaw.mock.calls[0][0].join('?')).toContain('GREATEST("stockSold", 0)');
    await new Promise((res) => setImmediate(res));
    expect(mockSyncStock).toHaveBeenCalledWith('item1', 'reopen');
  });

  it('sums the quantities of every cancelled ledger line', async () => {
    mockPrisma.ebaySoldEvent.findMany.mockResolvedValue([
      { ebayOrderId: 'o1', ebayLineItemId: 'l1', quantitySold: 1 },
      { ebayOrderId: 'o1', ebayLineItemId: 'l1', quantitySold: 1 },
    ]);
    await reopenEbayCancelledSale('item1', OPTS);
    expect(mockPrisma.item.updateMany.mock.calls[0][0].data.stockSold).toEqual({ decrement: 2 });
  });

  it('still refuses a multi-unit item (stockTotal > 1) before writing anything', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({ id: 'item1', title: 'Lamp', status: 'SOLD', lastSoldVia: 'EBAY', saleId: 's1', ebayListingId: 'L1', ebayOfferId: 'O1', stockTotal: 3, ebayQuantityAvailable: 0 });
    const r: any = await reopenEbayCancelledSale('item1', OPTS);
    expect(r).toMatchObject({ ok: false, code: 'MULTI_QUANTITY' });
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it('reports RACE (and writes no floor statement, no sync) when the guarded WHERE matches nothing', async () => {
    mockPrisma.item.updateMany.mockResolvedValue({ count: 0 });
    const r: any = await reopenEbayCancelledSale('item1', OPTS);
    expect(r).toMatchObject({ ok: false, code: 'RACE' });
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    expect(mockSyncStock).not.toHaveBeenCalled();
  });

  it('leaves the item alone when any order is still a real sale', async () => {
    mockClassify.mockReturnValue({ counts: true, kind: 'PAID', reason: 'paid' });
    const r: any = await reopenEbayCancelledSale('item1', OPTS);
    expect(r).toMatchObject({ ok: false, code: 'NOT_CANCELLED' });
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });
});
