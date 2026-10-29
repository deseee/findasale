/**
 * 2026-10-29 owner report: "BCW Penny Tubes are marked down when the No markdowns box is checked."
 * updateItem must clear the markdown state when the organizer opts an item out of markdowns (restoring the
 * pre-markdown price unless the same save sets a price) and when a manual price replaces a markdown, and every
 * organizer price change must write an ItemPriceHistory row. Mocked-Prisma scaffold from itemControllerHomoglyphs.test.ts.
 */

const mockPrisma: any = {
  item: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  itemPriceHistory: { create: jest.fn(async () => ({})) },
  priceOverrideLog: { create: jest.fn(async () => ({})) },
  itemCard: { findUnique: jest.fn() },
  sale: { findUnique: jest.fn() },
  organizer: { findUnique: jest.fn() },
  // 2026-10-23: verify-to-publish lookup (lib/publishGate.ts userCanPublish); not reset between tests.
  user: { findUnique: jest.fn(async () => ({ emailVerified: true, role: 'ORGANIZER', roles: ['ORGANIZER'] })) },
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
jest.mock('../services/priceDropService', () => ({ notifyPriceDropAlerts: () => Promise.resolve() }));
jest.mock('../services/itemSaleGuard', () => ({ ItemAlreadyCommittedError: class ItemAlreadyCommittedError extends Error {}, commitItemSale: jest.fn() }));
[
  'csv-parse', '../middleware/auth', '../utils/markdownSticker', '../utils/cloudinaryWatermark', 'cloudinary',
  'form-data', '../lib/socket', '../services/webhookService',
  '../services/marketplace/autoFanoutDispatcher', '../services/liveFeedService',
  '../helpers/itemQueries', '../services/publicItemIndexService', '../utils/listingHealthScore',
  '../lib/tierEnforcement',
  '../utils/getClientIp', '../services/notificationService', '../services/auctionService', '../lib/placesService',
  '../controllers/uploadController', '../utils/highValueFlagging', '../services/xpService', '../utils/rankUtils',
  '../jobs/fetchEbayComps', '../services/marketplace/marketplacePosterService', '../controllers/ebayController',
  '../services/descriptionMerger', '../services/facebookNudgeService',
  '../services/saleAlertEmailService', '../services/ebayPublishService', '../services/checkoutGuard',
  '../services/shopifyService', '../services/marketplace/discogsListingConnector',
  '../services/marketplace/reverbConnector', '../services/marketplace/etsyConnector', '../services/nativeShippingSuggestionService',
  '../services/shippingLabelService', '../services/itemChannelStatusService', '../utils/actingOrganizer',
  '../services/itemCsvImport', '../services/itemDeletionService', '../services/ebaySaleReopenService',
].forEach((p) => jest.mock(p, () => ({})));

// Required AFTER the mocks above (imports are hoisted, so a plain import would load the real modules first).
const { updateItem } = require('../controllers/itemController');

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

const organizerUser = { id: 'u1', roles: ['ORGANIZER'], emailVerified: true, organizer: { id: 'org1' } };

function baseItem(over: Record<string, unknown> = {}): any {
  return {
    id: 'i1',
    saleId: 's1',
    organizerId: 'org1',
    title: 'BCW Penny Tubes',
    description: 'Old description',
    category: 'Coins & Paper Money',
    price: 0.99,
    originalPrice: 1.25,
    priceBeforeMarkdown: 1.25,
    markdownApplied: true,
    markdownTierApplied: 0,
    markdownStepIndexApplied: 3,
    excludeFromMarkdown: false,
    rarity: 'COMMON',
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


beforeEach(() => {
  for (const m of [mockPrisma.item.findUnique, mockPrisma.item.create, mockPrisma.item.update, mockPrisma.itemCard.findUnique, mockPrisma.sale.findUnique, mockPrisma.organizer.findUnique, mockPrisma.itemPriceHistory.create, mockPrisma.priceOverrideLog.create]) m.mockReset();
  mockPrisma.itemPriceHistory.create.mockResolvedValue({});
  mockPrisma.priceOverrideLog.create.mockResolvedValue({});
  mockPrisma.sale.findUnique.mockResolvedValue({ organizerId: 'org1' });
  mockPrisma.item.update.mockImplementation(async ({ data }: any) => ({ ...baseItem(), ...data }));
  spies = (['error', 'warn', 'log'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => spies.forEach((spy) => spy.mockRestore()));

let spies: any[] = [];

async function save(item: any, body: Record<string, unknown>) {
  mockPrisma.item.findUnique.mockResolvedValue(item);
  const res = makeRes();
  await updateItem({ user: organizerUser, params: { id: 'i1' }, body }, res);
  if (res.statusCode >= 500) throw new Error(`updateItem 500: ${JSON.stringify(spies[0]?.mock?.calls)}`);
  return { res, data: mockPrisma.item.update.mock.calls[0]?.[0]?.data };
}

describe('updateItem: "Keep out of automatic markdowns" on a marked-down item (2026-10-29 owner report)', () => {
  it('restores the pre-markdown price, clears the markdown state and records history', async () => {
    const { res, data } = await save(baseItem(), { title: 'BCW Penny Tubes', price: '0.99', excludeFromMarkdown: true });
    expect(res.statusCode).toBe(200);
    expect(data).toMatchObject({
      excludeFromMarkdown: true,
      price: 1.25,
      originalPrice: 1.25,
      markdownApplied: false,
      priceBeforeMarkdown: null,
      markdownTierApplied: 0,
      markdownStepIndexApplied: null,
      markdownPhysicallyAppliedAt: null,
    });
    expect(data.priceUpdatedAt).toBeInstanceOf(Date);
    expect(mockPrisma.itemPriceHistory.create).toHaveBeenCalledWith({
      data: { itemId: 'i1', price: 1.25, changedBy: 'organizer', note: 'Markdown removed: kept out of automatic markdowns' },
    });
    // A restore is not an organizer pricing decision for the calibration log.
    expect(mockPrisma.priceOverrideLog.create).not.toHaveBeenCalled();
  });

  it('a manual price typed in the same save wins over the restore', async () => {
    const { data } = await save(baseItem(), { price: '1.19', excludeFromMarkdown: true });
    expect(data).toMatchObject({ price: 1.19, originalPrice: 1.19, markdownApplied: false, priceBeforeMarkdown: null, markdownStepIndexApplied: null });
    expect(mockPrisma.itemPriceHistory.create).toHaveBeenCalledWith({
      data: { itemId: 'i1', price: 1.19, changedBy: 'organizer', note: 'Manual price edit (replaces markdown)' },
    });
  });

  it('a sold item keeps its markdown; only the flag is stored', async () => {
    const { data } = await save(baseItem({ status: 'SOLD' }), { excludeFromMarkdown: true });
    expect(data.excludeFromMarkdown).toBe(true);
    expect(data.price).toBeUndefined();
    expect(data.markdownApplied).toBeUndefined();
    expect(mockPrisma.itemPriceHistory.create).not.toHaveBeenCalled();
  });

  it('an item that is not marked down only stores the flag', async () => {
    const { data } = await save(baseItem({ markdownApplied: false, price: 1.25, markdownStepIndexApplied: null }), { price: '1.25', excludeFromMarkdown: true });
    expect(data.excludeFromMarkdown).toBe(true);
    expect(data.markdownApplied).toBeUndefined();
    expect(data.priceUpdatedAt).toBeUndefined();
    expect(mockPrisma.itemPriceHistory.create).not.toHaveBeenCalled();
  });

  it('an already-excluded item is not restored again on a resave', async () => {
    const { data } = await save(baseItem({ excludeFromMarkdown: true, price: 1.19 }), { price: '1.19', excludeFromMarkdown: true });
    expect(data.price).toBe(1.19);
    expect(data.priceUpdatedAt).toBeUndefined();
  });
});

describe('updateItem: a manual price on a marked-down item replaces the markdown', () => {
  it('clears markdownApplied and priceBeforeMarkdown but keeps the cron step pointer', async () => {
    const { data } = await save(baseItem(), { price: '1.19' });
    expect(data).toMatchObject({ price: 1.19, originalPrice: 1.19, markdownApplied: false, priceBeforeMarkdown: null });
    expect(data.markdownStepIndexApplied).toBeUndefined();
    expect(data.markdownTierApplied).toBeUndefined();
    expect(data.excludeFromMarkdown).toBeUndefined();
    expect(mockPrisma.itemPriceHistory.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.priceOverrideLog.create).toHaveBeenCalledTimes(1);
  });

  it('a plain price edit on an unmarked item re-anchors and records history', async () => {
    const { data } = await save(baseItem({ markdownApplied: false, price: 2, priceBeforeMarkdown: 2, markdownStepIndexApplied: null }), { price: '3' });
    expect(data).toMatchObject({ price: 3, priceBeforeMarkdown: 3, markdownApplied: false, originalPrice: 3 });
    expect(mockPrisma.itemPriceHistory.create).toHaveBeenCalledWith({
      data: { itemId: 'i1', price: 3, changedBy: 'organizer', note: 'Manual price edit' },
    });
  });

  it('a same-price resave writes no history', async () => {
    await save(baseItem(), { price: '0.99' });
    expect(mockPrisma.itemPriceHistory.create).not.toHaveBeenCalled();
  });

  it('a history write failure never fails the save', async () => {
    mockPrisma.itemPriceHistory.create.mockRejectedValue(new Error('db down'));
    const { res } = await save(baseItem(), { price: '1.19' });
    expect(res.statusCode).toBe(200);
  });
});
