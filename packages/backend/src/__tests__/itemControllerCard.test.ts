/**
 * itemController card record integration (ADR-134 #640 batch B2 + decision D3). NOT executed when
 * written (jest cannot run on the authoring device); CI is the first real run. Prisma is a plain
 * object of jest.fn()s; itemController's many other imports are stubbed exactly like
 * itemControllerHoldAndTags.test.ts does. cardRecordService is the real module (pure, no env/network).
 *
 * Covers ADR-134 B2 acceptance:
 *   (1) unknown key in `card` on create/update -> 400 CARD_VALIDATION, nothing written
 *   (6) an item without a card returns `card: null` (public and edit reads); no card key on the non-card paths
 *   (7) the PUBLIC item response card block has no lockedFields, dedupKey, organizerId
 * and the D3 FIX: publishItem refuses a CARD item that has no price.
 */

const mockPrisma: any = {
  item: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  itemCard: { findUnique: jest.fn() },
  sale: { findUnique: jest.fn() },
  organizer: { findUnique: jest.fn() },
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
// Modules whose functions the card paths actually call.
jest.mock('../services/ebayRateEstimateService', () => ({ classifyPackageSurchargeTrigger: () => 'SAFE' }));
jest.mock('../utils/ebayShippingClassifier', () => ({ classifyEbayShipping: () => null }));
jest.mock('../services/achievementService', () => ({ checkAndAward: () => Promise.resolve() }));
jest.mock('../services/commandCenterService', () => ({ invalidateCommandCenterCache: () => Promise.resolve() }));
[
  'csv-parse', '../middleware/auth', '../utils/markdownSticker', '../utils/cloudinaryWatermark', 'cloudinary',
  'form-data', '../lib/socket', '../services/webhookService',
  '../services/marketplace/autoFanoutDispatcher', '../services/priceDropService', '../services/liveFeedService',
  '../helpers/itemQueries', '../services/publicItemIndexService', '../utils/listingHealthScore',
  '../lib/tierEnforcement',
  '../utils/getClientIp', '../services/notificationService', '../services/auctionService', '../lib/placesService',
  '../controllers/uploadController', '../utils/highValueFlagging', '../services/xpService', '../utils/rankUtils',
  '../jobs/fetchEbayComps', '../services/marketplace/marketplacePosterService', '../controllers/ebayController',
  '../services/descriptionMerger', '../services/facebookNudgeService',
  '../services/saleAlertEmailService', '../services/ebayPublishService', '../services/checkoutGuard',
  '../services/itemSaleGuard', '../services/shopifyService', '../services/marketplace/discogsListingConnector',
  '../services/marketplace/reverbConnector', '../services/marketplace/etsyConnector', '../services/nativeShippingSuggestionService',
  '../services/shippingLabelService', '../services/itemChannelStatusService', '../utils/actingOrganizer',
  '../services/itemCsvImport', '../services/itemDeletionService', '../services/ebaySaleReopenService',
].forEach((p) => jest.mock(p, () => ({})));

// Required AFTER the mocks above (imports are hoisted, so a plain import would load the real modules first).
const { getItemById, getItemForEdit, createItem, updateItem, publishItem } = require('../controllers/itemController');
const { CARD_PUBLIC_SELECT, CARD_EDIT_SELECT } = require('../services/cardRecordService');

/** Records only the FIRST response, so work after res.json (or a catch that re-sends) cannot hide it. */
function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    sent: false,
    status(code: number) {
      if (!this.sent) this.statusCode = code;
      return this;
    },
    json(body: any) {
      if (!this.sent) {
        this.body = body;
        this.sent = true;
      }
      return this;
    },
  };
  return res;
}

const organizerUser = { id: 'u1', roles: ['ORGANIZER'], organizer: { id: 'org1' } };

function baseItem(over: Record<string, unknown> = {}): any {
  return {
    id: 'i1',
    saleId: 's1',
    organizerId: 'org1',
    title: 'Lightning Bolt',
    price: null,
    isActive: true,
    draftStatus: 'PUBLISHED',
    listingType: 'FIXED',
    status: 'AVAILABLE',
    stockSold: 0,
    vendorBoothId: null,
    ebayOfferId: null,
    ebayListingId: null,
    packageWeightOz: null,
    userEditedFields: [],
    card: null,
    reservation: null,
    checkoutAttempts: [],
    sale: {
      status: 'PUBLISHED',
      organizerId: 'org1',
      zip: '49000',
      organizer: { id: 'org1', userId: 'u1', subscriptionTier: 'PRO', lat: null, lng: null },
    },
    ...over,
  };
}

const PUBLIC_CARD = { game: 'MTG', productType: 'SINGLE', cardName: 'Lightning Bolt', setCode: 'lea', grader: null, grade: null, releaseYear: 1993 };

let spies: any[] = [];

beforeEach(() => {
  mockPrisma.item.findUnique.mockReset();
  mockPrisma.item.create.mockReset();
  mockPrisma.item.update.mockReset();
  mockPrisma.itemCard.findUnique.mockReset();
  mockPrisma.sale.findUnique.mockReset();
  mockPrisma.organizer.findUnique.mockReset();
  spies = (['error', 'log', 'warn'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});

afterEach(() => {
  spies.forEach((spy) => spy.mockRestore());
});

describe('(7) public read: getItemById', () => {
  it('selects the card with the PUBLIC select only', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem());
    const res = makeRes();
    await getItemById({ params: { id: 'i1' }, user: undefined }, res);
    const select = mockPrisma.item.findUnique.mock.calls[0][0].select;
    expect(select.card).toEqual({ select: CARD_PUBLIC_SELECT });
    const cardKeys = Object.keys(select.card.select);
    for (const forbidden of ['lockedFields', 'dedupKey', 'organizerId', 'itemId', 'catalogPrintingId']) {
      expect(cardKeys).not.toContain(forbidden);
    }
  });

  it('(6) an item without a card returns card: null', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem({ card: null }));
    const res = makeRes();
    await getItemById({ params: { id: 'i1' }, user: undefined }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('card', null);
    expect(res.body.title).toBe('Lightning Bolt');
  });

  it('passes the public card block through without lockedFields, dedupKey or organizerId', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem({ card: { ...PUBLIC_CARD } }));
    const res = makeRes();
    await getItemById({ params: { id: 'i1' }, user: undefined }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.card).toEqual(PUBLIC_CARD);
    expect(res.body.card).not.toHaveProperty('lockedFields');
    expect(res.body.card).not.toHaveProperty('dedupKey');
    expect(res.body.card).not.toHaveProperty('organizerId');
  });
});

describe('owner read: getItemForEdit', () => {
  it('selects the card with the owner select (lockedFields) and still never dedupKey or organizerId', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem({ card: { ...PUBLIC_CARD, lockedFields: ['game'], catalogPrintingId: null } }));
    const res = makeRes();
    await getItemForEdit({ params: { id: 'i1' }, user: organizerUser }, res);
    expect(res.statusCode).toBe(200);
    const select = mockPrisma.item.findUnique.mock.calls[0][0].select;
    expect(select.card).toEqual({ select: CARD_EDIT_SELECT });
    expect(Object.keys(select.card.select)).toContain('lockedFields');
    expect(Object.keys(select.card.select)).not.toContain('dedupKey');
    expect(Object.keys(select.card.select)).not.toContain('organizerId');
    expect(res.body.card.lockedFields).toEqual(['game']);
  });

  it('(6) card: null for an item without a card, and another organizer is still refused', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem({ card: null }));
    const ok = makeRes();
    await getItemForEdit({ params: { id: 'i1' }, user: organizerUser }, ok);
    expect(ok.body).toHaveProperty('card', null);
    mockPrisma.item.findUnique.mockResolvedValue(baseItem({ card: { ...PUBLIC_CARD, lockedFields: [] } }));
    const denied = makeRes();
    await getItemForEdit({ params: { id: 'i1' }, user: { id: 'u2', roles: ['ORGANIZER'] } }, denied);
    expect(denied.statusCode).toBe(403);
    expect(JSON.stringify(denied.body)).not.toMatch(/Lightning/);
  });
});

describe('createItem with a card', () => {
  const baseBody = { saleId: 's1', title: 'Lightning Bolt', price: '4.50' };

  it('(1) an unknown card key returns 400 CARD_VALIDATION before anything is read or written', async () => {
    const res = makeRes();
    await createItem({ user: organizerUser, body: { ...baseBody, card: { game: 'MTG', bogus: 1 } }, files: undefined }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('CARD_VALIDATION');
    expect(mockPrisma.sale.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.item.create).not.toHaveBeenCalled();
  });

  it('a client cannot send organizerId, dedupKey or lockedFields inside card', async () => {
    for (const bad of [{ organizerId: 'evil' }, { dedupKey: 'x' }, { lockedFields: [] }]) {
      const res = makeRes();
      await createItem({ user: organizerUser, body: { ...baseBody, card: { game: 'MTG', ...bad } }, files: undefined }, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('CARD_VALIDATION');
    }
    expect(mockPrisma.item.create).not.toHaveBeenCalled();
  });

  it('(5) graded plus conditionCode returns 400 and creates nothing', async () => {
    const res = makeRes();
    await createItem({ user: organizerUser, body: { ...baseBody, card: { game: 'POKEMON', grader: 'PSA', grade: '10', conditionCode: 'NM' } }, files: undefined }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('CARD_VALIDATION');
    expect(mockPrisma.item.create).not.toHaveBeenCalled();
  });

  it('a card without a game is rejected on create', async () => {
    const res = makeRes();
    await createItem({ user: organizerUser, body: { ...baseBody, card: { cardName: 'Bolt' } }, files: undefined }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('CARD_VALIDATION');
  });

  it('a valid card (also as a multipart JSON string) is created in the same nested write with server-owned columns', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org-from-sale', organizer: { userId: 'u1' } });
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'PRO' });
    mockPrisma.item.create.mockResolvedValue({ id: 'new1', title: 'Lightning Bolt' });
    mockPrisma.itemCard.findUnique.mockResolvedValue({ ...PUBLIC_CARD, lockedFields: ['game', 'cardName'], catalogPrintingId: null });
    const res = makeRes();
    await createItem(
      { user: organizerUser, body: { ...baseBody, card: JSON.stringify({ game: 'mtg', cardName: 'Lightning Bolt' }) }, files: undefined },
      res
    );
    expect(res.statusCode).toBe(201);
    const data = mockPrisma.item.create.mock.calls[0][0].data;
    expect(data.card.create).toMatchObject({ game: 'MTG', cardName: 'Lightning Bolt', organizerId: 'org-from-sale', catalogPrintingId: null });
    expect(data.card.create.dedupKey).toMatch(/^[0-9a-f]{40}$/);
    expect(data.card.create.lockedFields).toEqual(['game', 'cardName']);
    expect(data.card.create).not.toHaveProperty('itemId');
    expect(res.body.card.lockedFields).toEqual(['game', 'cardName']);
    expect(res.body.card).not.toHaveProperty('dedupKey');
    expect(res.body.card).not.toHaveProperty('organizerId');
  });

  it('(6) without a card nothing about cards is written or returned', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org1', organizer: { userId: 'u1' } });
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'PRO' });
    mockPrisma.item.create.mockResolvedValue({ id: 'new2', title: 'Lamp' });
    const res = makeRes();
    await createItem({ user: organizerUser, body: { ...baseBody, title: 'Lamp' }, files: undefined }, res);
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.item.create.mock.calls[0][0].data).not.toHaveProperty('card');
    expect(mockPrisma.itemCard.findUnique).not.toHaveBeenCalled();
    expect(res.body).not.toHaveProperty('card');
  });
});

describe('updateItem with a card', () => {
  it('(1) an unknown card key returns 400 CARD_VALIDATION before the item is even read', async () => {
    const res = makeRes();
    await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { card: { lockedFields: ['game'] } } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('CARD_VALIDATION');
    expect(mockPrisma.item.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('another organizer cannot patch the card (the existing ownership check still runs first)', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem());
    const res = makeRes();
    await updateItem({ user: { id: 'u2', roles: ['ORGANIZER'] }, params: { id: 'i1' }, body: { card: { game: 'MTG' } } }, res);
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('a first card without a game is rejected and the item is not updated', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem());
    mockPrisma.itemCard.findUnique.mockResolvedValueOnce(null);
    const res = makeRes();
    await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { card: { cardName: 'Bolt' } } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('CARD_VALIDATION');
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('applies the card as a nested upsert inside the same item update, server-owned columns only', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem());
    mockPrisma.itemCard.findUnique
      .mockResolvedValueOnce({ game: 'MTG', cardName: 'Bolt', lockedFields: ['game'], catalogPrintingId: 'SCRYFALL:x' }) // existing row read before the write
      .mockResolvedValueOnce({ ...PUBLIC_CARD, lockedFields: ['game', 'setName'], catalogPrintingId: 'SCRYFALL:x' }); // read-back after the write
    mockPrisma.item.update.mockResolvedValue({ id: 'i1', title: 'Lightning Bolt', price: null, ebayOfferId: null });
    const res = makeRes();
    await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { card: { setName: 'Alpha' } } }, res);
    expect(res.statusCode).toBe(200);
    const data = mockPrisma.item.update.mock.calls[0][0].data;
    expect(data.card.upsert.update.lockedFields).toEqual(['game', 'setName']);
    expect(data.card.upsert.update.setName).toBe('Alpha');
    expect(data.card.upsert.update.organizerId).toBe('org1');
    expect(data.card.upsert.update.dedupKey).toMatch(/^[0-9a-f]{40}$/);
    expect(data.card.upsert.update).not.toHaveProperty('itemId');
    expect(data.card.upsert.create.catalogPrintingId).toBe('SCRYFALL:x');
    expect(res.body.card.lockedFields).toEqual(['game', 'setName']);
    expect(res.body.card).not.toHaveProperty('dedupKey');
    expect(res.body.card).not.toHaveProperty('organizerId');
  });

  it('(6) an update without a card does not touch the card table or add a card key', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem());
    mockPrisma.item.update.mockResolvedValue({ id: 'i1', title: 'New title', price: null, ebayOfferId: null });
    const res = makeRes();
    await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { title: 'New title' } }, res);
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.item.update.mock.calls[0][0].data).not.toHaveProperty('card');
    expect(mockPrisma.itemCard.findUnique).not.toHaveBeenCalled();
    expect(res.body).not.toHaveProperty('card');
    // `card: null` is "leave the card alone", not "delete it"
    mockPrisma.item.update.mockClear();
    const res2 = makeRes();
    await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { title: 'x', card: null } }, res2);
    expect(mockPrisma.item.update.mock.calls[0][0].data).not.toHaveProperty('card');
  });
});

describe('publishItem: D3 FIX, a card without a price is refused', () => {
  const draftItem = (over: Record<string, unknown> = {}) =>
    baseItem({ draftStatus: 'PENDING_REVIEW', optimisticLockVersion: 0, category: null, tags: [], ...over });

  it('refuses a card item with no stored price and no price in the request', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(draftItem({ price: null, card: { id: 'c1' } }));
    const res = makeRes();
    await publishItem({ user: organizerUser, params: { itemId: 'i1' }, body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('CARD_PRICE_REQUIRED');
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('refuses when the request clears the price, or sends one that is not a number', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(draftItem({ price: 5, card: { id: 'c1' } }));
    for (const price of [null, '', 'abc']) {
      const res = makeRes();
      await publishItem({ user: organizerUser, params: { itemId: 'i1' }, body: { price } }, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('CARD_PRICE_REQUIRED');
    }
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('does not refuse a card that has a stored price, or that gets a price in the request', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(draftItem({ price: 4.5, card: { id: 'c1' } }));
    const stored = makeRes();
    await publishItem({ user: organizerUser, params: { itemId: 'i1' }, body: {} }, stored);
    expect(stored.body?.code).not.toBe('CARD_PRICE_REQUIRED');

    mockPrisma.item.findUnique.mockResolvedValue(draftItem({ price: null, card: { id: 'c1' } }));
    const sent = makeRes();
    await publishItem({ user: organizerUser, params: { itemId: 'i1' }, body: { price: '12.50' } }, sent);
    expect(sent.body?.code).not.toBe('CARD_PRICE_REQUIRED');
  });

  it('does not change behavior for a non-card item with no price', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(draftItem({ price: null, card: null }));
    const res = makeRes();
    await publishItem({ user: organizerUser, params: { itemId: 'i1' }, body: {} }, res);
    expect(res.body?.code).not.toBe('CARD_PRICE_REQUIRED');
  });

  it('the guard runs after the ownership check', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(draftItem({ price: null, card: { id: 'c1' } }));
    const res = makeRes();
    await publishItem({ user: { id: 'u2', roles: ['ORGANIZER'] }, params: { itemId: 'i1' }, body: {} }, res);
    expect(res.statusCode).toBe(403);
  });
});
