/**
 * itemController wave 4 wiring (ADR-134 5.4 + B5b, ADR-135 D4.6). NOT the same file as itemControllerCard.test.ts:
 * this one keeps itemChannelStatusService REAL (it is pure) and gives ebayPublishService a working
 * ebayPublishWithSelfHeal. Covers:
 *   - getDraftItemsBySaleId: ETSY joins the account query; the Etsy dot inputs are loaded in ONE organizer-scoped
 *     EtsyListing query (plus one ItemCard query) only for an organizer with an active Etsy account; everyone else
 *     runs exactly the queries they ran before and gets etsy: null; a failure loading the inputs never fails the list
 *   - updateItem: the on-save eBay republish (self-heal) receives the item's card record (B5b); a non-card item gets null
 *   - ADR-134 5.4 (1): Item.ebayCategoryId is set from the pinned card category ONLY when it is null, on create and update
 */

const mockPrisma: any = {
  item: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  itemCard: { findUnique: jest.fn(), findMany: jest.fn() },
  etsyListing: { findMany: jest.fn() },
  sale: { findUnique: jest.fn() },
  organizer: { findUnique: jest.fn() },
  organizerWorkspace: { findFirst: jest.fn() },
  discountRule: { findMany: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn() },
};

jest.mock('../index', () => ({ prisma: mockPrisma }));
// itemController now imports utils/itemOwner, which imports lib/prisma; point it at the same stand-in so no real client is built.
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn().mockRejectedValue(new Error('no embedding service in tests')) },
}));
jest.mock('../services/cloudAIService', () => ({ analyzeItemImage: jest.fn(), isCloudAIAvailable: () => true }));
jest.mock('../lib/aiTagsQuotaTracker', () => ({
  checkAiTagQuota: jest.fn().mockResolvedValue({ exceeded: false, used: 0, limit: 100, remaining: 100 }),
  incrementAiTagCount: jest.fn(),
}));
jest.mock('../utils/expireCheckoutSession', () => ({ retrieveCheckoutSessionAcrossAccounts: jest.fn() }));
// marketplaceEligibilityRules (real here, through itemChannelStatusService) reads the descendants map at load time.
jest.mock('../services/ebayRateEstimateService', () => ({ classifyPackageSurchargeTrigger: () => 'SAFE', EBAY_STANDARD_ENVELOPE_CATEGORY_ID_DESCENDANTS: {} }));
jest.mock('../utils/ebayShippingClassifier', () => ({ classifyEbayShipping: () => null }));
jest.mock('../services/achievementService', () => ({ checkAndAward: () => Promise.resolve() }));
jest.mock('../services/commandCenterService', () => ({ invalidateCommandCenterCache: () => Promise.resolve() }));
jest.mock('../utils/listingHealthScore', () => ({ computeHealthScore: () => ({ score: 0 }) }));
jest.mock('../controllers/ebayController', () => ({ refreshEbayAccessToken: jest.fn(async () => 'tok_test') }));
jest.mock('../services/itemSaleGuard', () => {
  class ItemAlreadyCommittedError extends Error {}
  return { commitItemSale: jest.fn(), ItemAlreadyCommittedError };
});
jest.mock('../services/priceDropService', () => ({ notifyPriceDropAlerts: jest.fn(async () => undefined) }));
jest.mock('../services/ebayPublishService', () => ({
  ebayPublishWithSelfHeal: jest.fn(async () => ({ published: true })),
  republishEbayOffer: jest.fn(),
  ensureConditionValidForCategory: jest.fn(),
}));
[
  'csv-parse', '../middleware/auth', '../utils/markdownSticker', '../utils/cloudinaryWatermark', 'cloudinary',
  'form-data', '../lib/socket', '../services/webhookService',
  '../services/marketplace/autoFanoutDispatcher', '../services/liveFeedService',
  '../helpers/itemQueries', '../services/publicItemIndexService',
  '../lib/tierEnforcement',
  '../utils/getClientIp', '../services/notificationService', '../services/auctionService', '../lib/placesService',
  '../controllers/uploadController', '../utils/highValueFlagging', '../services/xpService', '../utils/rankUtils',
  '../jobs/fetchEbayComps', '../services/marketplace/marketplacePosterService',
  '../services/descriptionMerger', '../services/facebookNudgeService',
  '../services/saleAlertEmailService', '../services/checkoutGuard',
  '../services/shopifyService', '../services/marketplace/discogsListingConnector',
  '../services/marketplace/reverbConnector', '../services/marketplace/etsyConnector', '../services/nativeShippingSuggestionService',
  '../services/shippingLabelService', '../utils/actingOrganizer',
  '../services/itemCsvImport', '../services/itemDeletionService', '../services/ebaySaleReopenService',
].forEach((p) => jest.mock(p, () => ({})));

// Required AFTER the mocks above (imports are hoisted, so a plain import would load the real modules first).
const { getDraftItemsBySaleId, createItem, updateItem } = require('../controllers/itemController');
const { ebayPublishWithSelfHeal } = require('../services/ebayPublishService');

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    sent: false,
    status(code: number) { if (!this.sent) this.statusCode = code; return this; },
    json(body: any) { if (!this.sent) { this.body = body; this.sent = true; } return this; },
  };
  return res;
}

const organizerUser = { id: 'u1', roles: ['ORGANIZER'], organizer: { id: 'org1' } };
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

let spies: any[] = [];
const realFetch = (global as any).fetch;

beforeEach(() => {
  for (const model of Object.values(mockPrisma) as any[]) for (const fn of Object.values(model) as any[]) fn.mockReset();
  (ebayPublishWithSelfHeal as jest.Mock).mockClear();
  spies = (['error', 'log', 'warn'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => {
  spies.forEach((s) => s.mockRestore());
  (global as any).fetch = realFetch;
});

// ---------------------------------------------------------------------------------------------
describe('getDraftItemsBySaleId: Etsy channel dot', () => {
  const listItem = (id: string, over: Record<string, unknown> = {}) => ({
    id, saleId: 's1', title: `Item ${id}`, price: 5, photoUrls: [], tags: [], tagColor: null, description: '', category: null,
    ebayListingId: null, discogsListingId: null, reverbListingId: null, shopifyListing: null, ebayCategoryId: null,
    ...over,
  });

  function arrange(accounts: Array<{ id: string; platform: string }>, items = [listItem('a'), listItem('b'), listItem('c')]) {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org1', organizer: { userId: 'u1' } });
    mockPrisma.item.findMany.mockResolvedValue(items);
    mockPrisma.organizerWorkspace.findFirst.mockResolvedValue(null);
    mockPrisma.organizer.findUnique.mockResolvedValue({
      ebayConnection: null, shopifyEnabled: false, subscriptionTier: 'PRO', marketplaceAccounts: accounts,
    });
    mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([]);
  }
  const call = async () => {
    const res = makeRes();
    await getDraftItemsBySaleId({ user: organizerUser, query: { saleId: 's1' } }, res);
    return res;
  };

  it('widens the account query to DISCOGS, REVERB and ETSY (one combined query)', async () => {
    arrange([]);
    await call();
    expect(mockPrisma.organizer.findUnique).toHaveBeenCalledTimes(1);
    const select = mockPrisma.organizer.findUnique.mock.calls[0][0].select;
    expect(select.marketplaceAccounts.where).toEqual({ platform: { in: ['DISCOGS', 'REVERB', 'ETSY'] }, status: 'ACTIVE' });
  });

  it('an organizer without Etsy runs no Etsy or card queries and every item gets etsy: null', async () => {
    arrange([{ id: 'm1', platform: 'REVERB' }]);
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.etsyListing.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.itemCard.findMany).not.toHaveBeenCalled();
    expect(res.body).toHaveLength(3);
    for (const row of res.body) expect(row.channelStatus.etsy).toBeNull();
    // the pre-Etsy keys keep their shape
    expect(Object.keys(res.body[0].channelStatus).sort()).toEqual(
      ['craigslist', 'discogs', 'ebay', 'etsy', 'facebook', 'grailed', 'gumtreeAu', 'mercari', 'poshmark', 'reverb', 'shopify', 'vinted']
    );
  });

  it('with an active Etsy account: ONE organizer-scoped EtsyListing query and one ItemCard query for the page ids', async () => {
    arrange([{ id: 'm1', platform: 'ETSY' }]);
    mockPrisma.etsyListing.findMany.mockResolvedValue([
      { itemId: 'b', state: 'ACTIVE', whenMade: 'before_2007', isSupply: false },
    ]);
    mockPrisma.itemCard.findMany.mockResolvedValue([{ itemId: 'a', releaseYear: 1999 }]);
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.etsyListing.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.etsyListing.findMany).toHaveBeenCalledWith({
      where: { itemId: { in: ['a', 'b', 'c'] }, organizerId: 'org1' },
      select: { itemId: true, state: true, whenMade: true, isSupply: true },
    });
    expect(mockPrisma.itemCard.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.itemCard.findMany).toHaveBeenCalledWith({
      where: { itemId: { in: ['a', 'b', 'c'] } },
      select: { itemId: true, releaseYear: true },
    });
    const byId = Object.fromEntries(res.body.map((r: any) => [r.id, r.channelStatus.etsy]));
    expect(byId).toEqual({ a: 'ELIGIBLE', b: 'PUBLISHED', c: null });
  });

  it('never leaks the Etsy inputs into the item rows that are returned', async () => {
    arrange([{ id: 'm1', platform: 'ETSY' }]);
    mockPrisma.etsyListing.findMany.mockResolvedValue([{ itemId: 'a', state: 'DRAFT_READY', whenMade: 'before_2007', isSupply: true }]);
    mockPrisma.itemCard.findMany.mockResolvedValue([{ itemId: 'a', releaseYear: 1999 }]);
    const res = await call();
    for (const row of res.body) {
      for (const key of ['etsyListingState', 'etsyWhenMade', 'etsyIsCraftSupply', 'releaseYear']) expect(row).not.toHaveProperty(key);
    }
    expect(res.body[0].channelStatus.etsy).toBe('ELIGIBLE');
  });

  it('a card released after the cutoff, or an ACTIVE listing whose rule now fails, is flagged correctly', async () => {
    arrange([{ id: 'm1', platform: 'ETSY' }], [listItem('a'), listItem('b')]);
    mockPrisma.etsyListing.findMany.mockResolvedValue([{ itemId: 'b', state: 'ACTIVE', whenMade: '2020_2026', isSupply: false }]);
    mockPrisma.itemCard.findMany.mockResolvedValue([{ itemId: 'a', releaseYear: new Date().getFullYear() }]);
    const res = await call();
    const byId = Object.fromEntries(res.body.map((r: any) => [r.id, r.channelStatus.etsy]));
    expect(byId).toEqual({ a: null, b: 'PUBLISHED_INELIGIBLE' });
  });

  it('a failure loading the Etsy inputs hides only the Etsy dot: the list still returns 200', async () => {
    arrange([{ id: 'm1', platform: 'ETSY' }]);
    mockPrisma.etsyListing.findMany.mockRejectedValue(new Error('relation "EtsyListing" does not exist'));
    mockPrisma.itemCard.findMany.mockResolvedValue([]);
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(3);
    for (const row of res.body) expect(row.channelStatus.etsy).toBeNull();
  });

  it('an empty sale does not query Etsy at all', async () => {
    arrange([{ id: 'm1', platform: 'ETSY' }], []);
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.etsyListing.findMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
describe('updateItem: eBay self-heal receives the card record (B5b)', () => {
  const CARD_ROW = { game: 'MTG', productType: 'SINGLE', cardName: 'Black Lotus', setCode: 'lea', setName: 'Alpha', collectorNumber: '232', language: 'EN', finish: 'NONFOIL', rarity: 'rare', conditionCode: null, grader: 'PSA', grade: '9', certNumber: '12345678' };

  function liveItem(over: Record<string, unknown> = {}) {
    return {
      id: 'i1', saleId: 's1', organizerId: 'org1', title: 'Black Lotus', price: 100, status: 'AVAILABLE', isActive: true,
      ebayOfferId: 'offer1', ebayListingId: 'list1', ebayCategoryId: '183454', ebayCategoryName: null,
      stockSold: 0, userEditedFields: [], packageWeightOz: null, shippingPrice: null,
      sale: { status: 'PUBLISHED', organizerId: 'org1', zip: '49000', organizer: { id: 'org1', userId: 'u1', subscriptionTier: 'PRO', lat: null, lng: null } },
      ...over,
    };
  }

  function arrange(card: unknown) {
    mockPrisma.item.findUnique.mockResolvedValue(liveItem());
    mockPrisma.item.update.mockResolvedValue({
      id: 'i1', title: 'Black Lotus', price: 120, condition: 'USED', brand: null, mpn: null, category: null, tags: [], description: 'd',
      ebayOfferId: 'offer1', ebayListingId: 'list1', ebayCategoryId: '183454', ebayCategoryName: null,
    });
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', ebayPolicyMapping: { defaultDescriptionHtml: null } });
    mockPrisma.itemCard.findUnique.mockResolvedValue(card);
    (global as any).fetch = jest.fn(async (_url: string, init: any) => {
      if (init?.method === 'GET') return { ok: true, status: 200, json: async () => ({ sku: 'SKU1', pricingSummary: { price: { value: '100', currency: 'USD' } } }) };
      return { ok: true, status: 204, json: async () => ({}) };
    });
  }

  it('selects the card by itemId with the EbayCardInput fields and passes it to ebayPublishWithSelfHeal', async () => {
    arrange(CARD_ROW);
    const res = makeRes();
    await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { price: '120' } }, res);
    await flush();
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.itemCard.findUnique).toHaveBeenCalledWith({
      where: { itemId: 'i1' },
      select: { game: true, productType: true, cardName: true, setCode: true, setName: true, collectorNumber: true, language: true, finish: true, rarity: true, conditionCode: true, grader: true, grade: true, certNumber: true },
    });
    expect(ebayPublishWithSelfHeal).toHaveBeenCalledTimes(1);
    const arg = (ebayPublishWithSelfHeal as jest.Mock).mock.calls[0][0];
    expect(arg.item.card).toEqual(CARD_ROW);
    expect(arg.item).toMatchObject({ id: 'i1', ebayOfferId: 'offer1', ebayCategoryId: '183454' });
    expect(arg.accessToken).toBe('tok_test');
  });

  it('a non-card item passes card: null and everything else the heal receives is unchanged', async () => {
    arrange(null);
    const res = makeRes();
    await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { price: '120' } }, res);
    await flush();
    expect(ebayPublishWithSelfHeal).toHaveBeenCalledTimes(1);
    const arg = (ebayPublishWithSelfHeal as jest.Mock).mock.calls[0][0];
    expect(arg.item.card).toBeNull();
    expect(Object.keys(arg.item).sort()).toEqual(
      ['brand', 'card', 'category', 'description', 'ebayCategoryId', 'ebayCategoryName', 'ebayOfferId', 'id', 'mpn', 'tags', 'title', 'condition'].sort()
    );
  });

  it('an item that is not live on eBay never reads the card for the heal and never calls it', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(liveItem({ ebayOfferId: null, ebayListingId: null }));
    mockPrisma.item.update.mockResolvedValue({ id: 'i1', title: 'x', price: 120, ebayOfferId: null });
    const res = makeRes();
    await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { price: '120' } }, res);
    await flush();
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.itemCard.findUnique).not.toHaveBeenCalled();
    expect(ebayPublishWithSelfHeal).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
describe('ADR-134 5.4 (1): pinned eBay category set only when null', () => {
  const PINNED = '183454';

  describe('createItem', () => {
    const baseBody = { saleId: 's1', title: 'Lightning Bolt', price: '4.50' };
    beforeEach(() => {
      mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org1', organizer: { userId: 'u1' } });
      mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'PRO' });
      mockPrisma.item.create.mockResolvedValue({ id: 'new1', title: 'Lightning Bolt' });
      mockPrisma.itemCard.findUnique.mockResolvedValue({ game: 'MTG' });
    });

    it('a pinned-game single starts with the pinned category id and its live-verified name', async () => {
      const res = makeRes();
      await createItem({ user: organizerUser, body: { ...baseBody, card: { game: 'MTG' } }, files: undefined }, res);
      expect(res.statusCode).toBe(201);
      const data = mockPrisma.item.create.mock.calls[0][0].data;
      expect(data.ebayCategoryId).toBe(PINNED);
      expect(data.ebayCategoryName).toBe('CCG Individual Cards'); // name read live from eBay (V1, 2026-10-04)
    });

    it('every pinned game maps to the pinned category', async () => {
      for (const game of ['MTG', 'POKEMON', 'YUGIOH', 'LORCANA', 'ONE_PIECE']) {
        mockPrisma.item.create.mockClear();
        const res = makeRes();
        await createItem({ user: organizerUser, body: { ...baseBody, card: { game } }, files: undefined }, res);
        expect(mockPrisma.item.create.mock.calls[0][0].data.ebayCategoryId).toBe(PINNED);
      }
    });

    it('OTHER, and a non-SINGLE product type, get no pin', async () => {
      for (const card of [{ game: 'OTHER' }, { game: 'MTG', productType: 'SEALED' }]) {
        mockPrisma.item.create.mockClear();
        const res = makeRes();
        await createItem({ user: organizerUser, body: { ...baseBody, card }, files: undefined }, res);
        expect(res.statusCode).toBe(201);
        expect(mockPrisma.item.create.mock.calls[0][0].data).not.toHaveProperty('ebayCategoryId');
      }
    });

    it('a non-card item gets no category key at all (create data unchanged)', async () => {
      const res = makeRes();
      await createItem({ user: organizerUser, body: { ...baseBody, title: 'Lamp' }, files: undefined }, res);
      expect(res.statusCode).toBe(201);
      const data = mockPrisma.item.create.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('ebayCategoryId');
      expect(data).not.toHaveProperty('ebayCategoryName');
      expect(data).not.toHaveProperty('card');
    });
  });

  describe('updateItem', () => {
    const stored = (over: Record<string, unknown> = {}) => ({
      id: 'i1', saleId: 's1', organizerId: 'org1', title: 'Bolt', price: 5, status: 'AVAILABLE', isActive: true,
      ebayOfferId: null, ebayListingId: null, ebayCategoryId: null, ebayCategoryName: null,
      stockSold: 0, userEditedFields: [], packageWeightOz: null, shippingPrice: null,
      sale: { status: 'PUBLISHED', organizerId: 'org1', zip: '49000', organizer: { id: 'org1', userId: 'u1', subscriptionTier: 'PRO', lat: null, lng: null } },
      ...over,
    });
    beforeEach(() => {
      mockPrisma.item.update.mockResolvedValue({ id: 'i1', title: 'Bolt', price: 5, ebayOfferId: null });
      mockPrisma.itemCard.findUnique.mockResolvedValue(null);
    });
    const dataOfUpdate = () => mockPrisma.item.update.mock.calls[0][0].data;

    it('a first card on an item with no category sets the pinned id', async () => {
      mockPrisma.item.findUnique.mockResolvedValue(stored());
      const res = makeRes();
      await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { card: { game: 'POKEMON' } } }, res);
      expect(res.statusCode).toBe(200);
      expect(dataOfUpdate().ebayCategoryId).toBe(PINNED);
      expect(dataOfUpdate().card.upsert.create.game).toBe('POKEMON');
    });

    it('a card patch that only changes a detail uses the STORED game to pin (merged card), when the category is null', async () => {
      mockPrisma.item.findUnique.mockResolvedValue(stored());
      mockPrisma.itemCard.findUnique.mockResolvedValueOnce({ game: 'MTG', productType: 'SINGLE', cardName: 'Bolt', lockedFields: [], catalogPrintingId: null });
      const res = makeRes();
      await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { card: { setName: 'Alpha' } } }, res);
      expect(res.statusCode).toBe(200);
      expect(dataOfUpdate().ebayCategoryId).toBe(PINNED);
    });

    it('NEVER overwrites a stored non-null category', async () => {
      mockPrisma.item.findUnique.mockResolvedValue(stored({ ebayCategoryId: '99999', ebayCategoryName: 'Organizer picked' }));
      const res = makeRes();
      await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { card: { game: 'MTG' } } }, res);
      expect(res.statusCode).toBe(200);
      expect(dataOfUpdate()).not.toHaveProperty('ebayCategoryId');
      expect(dataOfUpdate()).not.toHaveProperty('ebayCategoryName');
    });

    it('keeps a category the same request is setting, even alongside a card', async () => {
      mockPrisma.item.findUnique.mockResolvedValue(stored());
      const res = makeRes();
      await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { ebayCategoryId: '88888', card: { game: 'MTG' } } }, res);
      expect(res.statusCode).toBe(200);
      expect(dataOfUpdate().ebayCategoryId).toBe('88888');
    });

    it('OTHER and non-SINGLE cards get no pin', async () => {
      for (const card of [{ game: 'OTHER' }, { game: 'MTG', productType: 'SEALED' }]) {
        mockPrisma.item.update.mockClear();
        mockPrisma.item.findUnique.mockResolvedValue(stored());
        const res = makeRes();
        await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { card } }, res);
        expect(res.statusCode).toBe(200);
        expect(dataOfUpdate()).not.toHaveProperty('ebayCategoryId');
      }
    });

    it('an update with no card never touches the category, even on a null-category item', async () => {
      mockPrisma.item.findUnique.mockResolvedValue(stored());
      const res = makeRes();
      await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { title: 'New title' } }, res);
      expect(res.statusCode).toBe(200);
      expect(dataOfUpdate()).not.toHaveProperty('ebayCategoryId');
      expect(dataOfUpdate()).not.toHaveProperty('card');
    });
  });
});
