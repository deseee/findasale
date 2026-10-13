/**
 * bulkLotEbayStockGuards.test.ts (ADR-136 Addendum C, roadmap #659): the two older eBay write paths that read a lot's numbers
 * must never send a lot's card count or its per-1,000 price to eBay, and must behave exactly as before for every other item
 * (including with both bulk flags off and with the lot table missing).
 *
 *   services/marketplaceStockSyncService.syncMarketplaceStock   quantity revise after a partial sale on another channel
 *                                                               (2026-10-13: a thin delegate to inventoryStockSync.syncItemStock,
 *                                                               which now owns the lot guards; the assertions below go through it)
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
jest.mock('../controllers/ebayController', () => ({ buildCustomLabel: (id: string) => `FAS-${id}`, endEbayListingIfExists: jest.fn(async () => null) }));
// inventoryStockSync (loaded by the delegate) imports every market connector; none of them is exercised here.
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn(), updateShopifyProductFields: jest.fn(), getShopifyClient: jest.fn() }));
jest.mock('../services/marketplace/etsyConnector', () => ({ updateEtsyListingInventory: jest.fn(), withdrawEtsyListingIfExists: jest.fn() }));
jest.mock('../services/marketplace/etsyHttp', () => ({ isEtsyConnectorEnabled: () => false }));
jest.mock('../services/marketplace/etsyMapping', () => ({ computeEtsyQuantity: () => 1 }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn() }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn() }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn() }));
jest.mock('../services/itemKitStock', () => ({ recomputeKitsForComponents: jest.fn() }));
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

/** The row inventoryStockSync reads for item_1 (ordinary item, 4 of 5 units in stock). */
const syncRow = (over: Record<string, unknown> = {}) => ({
  id: 'item_1', status: 'AVAILABLE', listingType: 'STANDARD', stockTotal: 5, stockSold: 1, saleId: 'sale_1', organizerId: 'org_1',
  createdAt: new Date(), costBasis: null, roomTag: null, deletedAt: null, draftStatus: 'PUBLISHED', isKitComponent: false,
  ebayOfferId: 'offer_1', ebayListingId: '1234567890', ebayQueuedAt: null, ebaySyncHeldAt: null, ebayHeldFields: [],
  ebaySyncState: 'SYNCED', ebaySyncFailureReason: null, discogsListingId: null, reverbListingId: null, fbExportedAt: null, card: null,
  ...over,
});

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
    g.__guardItemFind.mockReset().mockResolvedValue(syncRow());
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
      expect(g.__guardEbayFetch).toHaveBeenCalledTimes(1);
      expect(g.__guardEbayFetch.mock.calls[0][0]).toBe('/sell/inventory/v1/offer/offer_1'); // the offer GET (a GET carries no init)
      expect(g.__guardEbayFetch.mock.calls[0][2]).toBeUndefined();
      expect(g.__guardReconcile).not.toHaveBeenCalled();
    });

    it('an item with no eBay offer returns before the lot lookup', async () => {
      g.__guardItemFind.mockResolvedValue(syncRow({ ebayOfferId: null, ebayListingId: null }));
      await stock.syncMarketplaceStock('item_1', outcome);
      expect(g.__guardLotFind).not.toHaveBeenCalled();
      expect(g.__guardEbayFetch).not.toHaveBeenCalled();
    });

    it('a lot with its offer still live and the bundle flag off sends nothing to eBay (4,200 cards is never 4,200 bundles)', async () => {
      g.__guardLotFind.mockResolvedValue([{ itemId: 'item_1' }]);
      setFlags(true, false);
      await stock.syncMarketplaceStock('item_1', outcome);
      expect(g.__guardEbayFetch).not.toHaveBeenCalled();
      expect(g.__guardReconcile).not.toHaveBeenCalled();
    });

    it('a lot is still protected after the lot flag itself is turned off', async () => {
      g.__guardLotFind.mockResolvedValue([{ itemId: 'item_1' }]);
      setFlags(false, false);
      await stock.syncMarketplaceStock('item_1', outcome);
      expect(g.__guardEbayFetch).not.toHaveBeenCalled();
    });

    it('a lot with both flags on goes to the bundle reconcile, never to the card count revise', async () => {
      g.__guardLotFind.mockResolvedValue([{ itemId: 'item_1' }]);
      setFlags(true, true);
      await stock.syncMarketplaceStock('item_1', outcome);
      expect(g.__guardEbayFetch).not.toHaveBeenCalled();
      expect(g.__guardReconcile).toHaveBeenCalledWith('item_1', 'partial sale on another channel');
    });

    it('a failed lot lookup with the lot flag on sends nothing (fail closed)', async () => {
      g.__guardLotFind.mockRejectedValue(new Error('db down'));
      setFlags(true, false);
      await stock.syncMarketplaceStock('item_1', outcome);
      expect(g.__guardEbayFetch).not.toHaveBeenCalled();
    });

    it('a failed lot lookup with the lot flag off fails open: the table may not exist before the migration', async () => {
      g.__guardLotFind.mockRejectedValue(new Error('relation "ItemBulkLot" does not exist'));
      setFlags(false, false);
      await stock.syncMarketplaceStock('item_1', outcome);
      expect(g.__guardEbayFetch).toHaveBeenCalledTimes(1);
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
