/**
 * bulkLotEbayStockGuards.test.ts (ADR-136 Addendum C, roadmap #659): the two older eBay write paths that read a lot's numbers
 * must never send a lot's card count or its per-1,000 price to eBay, and must behave exactly as before for every other item
 * (including with both bulk flags off and with the lot table missing).
 *
 *   services/marketplaceStockSyncService.syncMarketplaceStock   quantity revise after a partial sale on another channel
 *   services/ebayPriceRevisionService.reviseEbayOfferPrice      price-only offer revise
 *
 * No network, no database, no eBay call: every module with a side effect is mocked, fetch is a mock, and a lot is a row the
 * mocked itemBulkLot.findMany returns. Flags are read from process.env when the function is called.
 */

jest.mock('../lib/prisma', () => {
  const lotFind = jest.fn();
  (globalThis as any).__guardLotFind = lotFind;
  const itemFind = jest.fn();
  (globalThis as any).__guardItemFind = itemFind;
  return {
    prisma: {
      itemBulkLot: { findMany: lotFind },
      item: { findUnique: itemFind },
      sale: { findUnique: jest.fn(async () => ({ organizerId: 'org_1' })) },
      organizer: {
        findUnique: jest.fn(async () => ({ id: 'org_1', skuAppendDate: false, skuAppendCost: false, skuAppendLocation: false, ebayConnection: { lastEbaySoldSyncAt: new Date() } })),
      },
    },
  };
});
jest.mock('../services/ebayHttp', () => ({
  ebayProxyUrl: (p: string) => decodeURIComponent(p),
  ebayProxyHeaders: () => ({}),
  ebayUserHeaders: () => ({}),
  refreshEbayAccessToken: async () => 'tok',
  getEbayAccessToken: async () => 'tok',
}));
jest.mock('../lib/ebayRateLimiter', () => ({ isEbayRateLimited: () => false, trackEbayCall: () => undefined }));
jest.mock('../controllers/ebayController', () => ({ buildCustomLabel: (id: string) => `FAS-${id}` }));
jest.mock('../services/bulkLot/bulkLotEbayWiring', () => {
  const hook = jest.fn();
  (globalThis as any).__guardReconcile = hook;
  return { reconcileBulkLotEbayInBackgroundIfEnabled: hook };
});
jest.mock('../services/ebayPublishService', () => {
  const ebayFetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) }));
  (globalThis as any).__guardEbayFetch = ebayFetch;
  return {
    ebayFetch,
    getRequiredAspectsForCategory: jest.fn(),
    parseMissingRequiredAspectNames: jest.fn(),
    pickSafeAspectDefault: jest.fn(),
    resolveCoinConditionOverride: jest.fn(),
    toConditionDescriptorPayload: jest.fn(),
    buildTradingConditionDescriptorsXml: jest.fn(),
  };
});
jest.mock('../services/reanalyzeService', () => ({ reanalyzeItem: jest.fn() }));

const g = globalThis as any;
const fetchMock = jest.fn();

const ENV_KEYS = ['CARD_BULK_LOTS_ENABLED', 'CARD_BULK_EBAY_ENABLED'] as const;
function setFlags(lots: boolean, ebay: boolean): void {
  for (const k of ENV_KEYS) delete process.env[k];
  if (lots) process.env.CARD_BULK_LOTS_ENABLED = 'true';
  if (ebay) process.env.CARD_BULK_EBAY_ENABLED = 'true';
}

describe('bulk lots and the older eBay write paths', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const stock = require('../services/marketplaceStockSyncService') as typeof import('../services/marketplaceStockSyncService');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const price = require('../services/ebayPriceRevisionService') as typeof import('../services/ebayPriceRevisionService');

  beforeEach(() => {
    setFlags(false, false);
    g.__guardLotFind.mockReset().mockResolvedValue([]);
    g.__guardItemFind.mockReset().mockResolvedValue({ ebayOfferId: 'offer_1', saleId: 'sale_1', createdAt: new Date(), costBasis: null, roomTag: null });
    g.__guardReconcile.mockReset();
    g.__guardEbayFetch.mockClear();
    fetchMock.mockReset().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) });
    (global as any).fetch = fetchMock;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    setFlags(false, false);
  });

  describe('syncMarketplaceStock (quantity revise)', () => {
    const outcome = { fullySoldOut: false, remainingStock: 4200 } as any;

    it('an ordinary item still reaches eBay with both flags off (one extra lot lookup, nothing else changes)', async () => {
      await stock.syncMarketplaceStock('item_1', outcome);
      expect(g.__guardLotFind).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
      expect(g.__guardReconcile).not.toHaveBeenCalled();
    });

    it('an item with no eBay offer returns before the lot lookup', async () => {
      g.__guardItemFind.mockResolvedValue({ ebayOfferId: null, saleId: 'sale_1', createdAt: new Date(), costBasis: null, roomTag: null });
      await stock.syncMarketplaceStock('item_1', outcome);
      expect(g.__guardLotFind).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a lot with its offer still live and the bundle flag off sends nothing to eBay (4,200 cards is never 4,200 bundles)', async () => {
      g.__guardLotFind.mockResolvedValue([{ itemId: 'item_1' }]);
      setFlags(true, false);
      await stock.syncMarketplaceStock('item_1', outcome);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(g.__guardReconcile).not.toHaveBeenCalled();
    });

    it('a lot is still protected after the lot flag itself is turned off', async () => {
      g.__guardLotFind.mockResolvedValue([{ itemId: 'item_1' }]);
      setFlags(false, false);
      await stock.syncMarketplaceStock('item_1', outcome);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a lot with both flags on goes to the bundle reconcile, never to the card count revise', async () => {
      g.__guardLotFind.mockResolvedValue([{ itemId: 'item_1' }]);
      setFlags(true, true);
      await stock.syncMarketplaceStock('item_1', outcome);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(g.__guardReconcile).toHaveBeenCalledWith('item_1', 'partial sale on another channel');
    });

    it('a failed lot lookup with the lot flag on sends nothing (fail closed)', async () => {
      g.__guardLotFind.mockRejectedValue(new Error('db down'));
      setFlags(true, false);
      await stock.syncMarketplaceStock('item_1', outcome);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a failed lot lookup with the lot flag off fails open: the table may not exist before the migration', async () => {
      g.__guardLotFind.mockRejectedValue(new Error('relation "ItemBulkLot" does not exist'));
      setFlags(false, false);
      await stock.syncMarketplaceStock('item_1', outcome);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('reviseEbayOfferPrice (price revise)', () => {
    it('a lot is refused with the bundle reason and no eBay call, flags on or off', async () => {
      g.__guardLotFind.mockResolvedValue([{ itemId: 'item_1' }]);
      for (const [lots, ebay] of [[false, false], [true, false], [true, true]] as Array<[boolean, boolean]>) {
        setFlags(lots, ebay);
        const r = await price.reviseEbayOfferPrice('offer_1', 8, 'tok', null, 'item_1');
        expect(r).toMatchObject({ ok: false, reason: 'bulk-lot-bundle' });
      }
      expect(g.__guardEbayFetch).not.toHaveBeenCalled();
    });

    it('a failed lot lookup with the lot flag on refuses with a plain error (fail closed)', async () => {
      g.__guardLotFind.mockRejectedValue(new Error('db down'));
      setFlags(true, false);
      const r = await price.reviseEbayOfferPrice('offer_1', 8, 'tok', null, 'item_1');
      expect(r).toMatchObject({ ok: false, reason: 'error' });
      expect(g.__guardEbayFetch).not.toHaveBeenCalled();
    });

    it('a failed lot lookup with the lot flag off fails open and the ordinary path runs', async () => {
      g.__guardLotFind.mockRejectedValue(new Error('relation "ItemBulkLot" does not exist'));
      setFlags(false, false);
      const r = await price.reviseEbayOfferPrice('offer_1', 8, 'tok', null, 'item_1');
      expect(r).toMatchObject({ ok: false, reason: 'get-failed' });
      expect(g.__guardEbayFetch).toHaveBeenCalledTimes(1);
    });

    it('an ordinary item reaches eBay exactly as before', async () => {
      const r = await price.reviseEbayOfferPrice('offer_1', 8, 'tok', null, 'item_1');
      expect(r).toMatchObject({ ok: false, reason: 'get-failed' });
      expect(g.__guardEbayFetch).toHaveBeenCalledTimes(1);
    });

    it('a call with no item id does not look up lots (legacy callers)', async () => {
      const r = await price.reviseEbayOfferPrice(null, 8, 'tok', null);
      expect(r).toMatchObject({ ok: false, reason: 'no-offer-id' });
      expect(g.__guardLotFind).not.toHaveBeenCalled();
    });
  });
});
