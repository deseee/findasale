/**
 * Homoglyph normalization on the item write paths (2026-10-27). Mocked-Prisma scaffold copied from
 * itemControllerCard.test.ts: createItem / updateItem must store a title/description with Cyrillic/Greek
 * lookalikes inside Latin words replaced, and must not touch genuinely Cyrillic text.
 */

const mockPrisma: any = {
  item: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
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
const { createItem, updateItem } = require('../controllers/itemController');

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
const CYR_TE = '\u0442';
const LIVE_TITLE = `D'Addario Plane${CYR_TE}waves Acoustic Quick-Release Guitar Strap System`;
const FIXED_TITLE = "D'Addario Planetwaves Acoustic Quick-Release Guitar Strap System";

function baseItem(over: Record<string, unknown> = {}): any {
  return {
    id: 'i1',
    saleId: 's1',
    organizerId: 'org1',
    title: 'Old title',
    description: 'Old description',
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

let spies: any[] = [];
let logSpy: jest.SpyInstance;

beforeEach(() => {
  mockPrisma.item.findUnique.mockReset();
  mockPrisma.item.create.mockReset();
  mockPrisma.item.update.mockReset();
  mockPrisma.itemCard.findUnique.mockReset();
  mockPrisma.sale.findUnique.mockReset();
  mockPrisma.organizer.findUnique.mockReset();
  spies = (['error', 'warn'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  spies.forEach((spy) => spy.mockRestore());
  logSpy.mockRestore();
});

function homoglyphLogs(): string[] {
  return logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[homoglyphs]'));
}

describe('createItem normalizes homoglyphs in title and description', () => {
  beforeEach(() => {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org1', organizer: { userId: 'u1' } });
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'PRO' });
    mockPrisma.item.create.mockImplementation(async ({ data }: any) => ({ id: 'new1', ...data }));
  });

  it('stores the Latin title and description and logs the change', async () => {
    const res = makeRes();
    await createItem(
      { user: organizerUser, body: { saleId: 's1', title: LIVE_TITLE, description: `Fits most \u0430coustic guitars\u200B.`, price: '12' }, files: undefined },
      res
    );
    expect(res.statusCode).toBe(201);
    const data = mockPrisma.item.create.mock.calls[0][0].data;
    expect(data.title).toBe(FIXED_TITLE);
    expect(data.description).toBe('Fits most acoustic guitars.');
    expect(homoglyphLogs().length).toBe(2);
  });

  it('keeps a genuinely Cyrillic title exactly as the organizer typed it, and does not log', async () => {
    const russian = '\u041C\u0430\u0442\u0440\u0451\u0448\u043A\u0430 \u041C\u0430\u043C\u0430'; // Матрёшка Мама
    const res = makeRes();
    await createItem({ user: organizerUser, body: { saleId: 's1', title: russian, price: '12' }, files: undefined }, res);
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.item.create.mock.calls[0][0].data.title).toBe(russian);
    expect(homoglyphLogs()).toEqual([]);
  });
});

describe('updateItem normalizes homoglyphs in title and description', () => {
  it('writes the Latin title and description to the item update', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem());
    mockPrisma.item.update.mockImplementation(async ({ data }: any) => ({ ...baseItem(), ...data }));
    const res = makeRes();
    await updateItem(
      { user: organizerUser, params: { id: 'i1' }, body: { title: LIVE_TITLE, description: `Gr\u0435at str\u0430p` } },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.item.update).toHaveBeenCalled();
    const data = mockPrisma.item.update.mock.calls[0][0].data;
    expect(data.title).toBe(FIXED_TITLE);
    expect(data.description).toBe('Great strap');
    expect(homoglyphLogs().some((l) => l.includes('updateItem i1 title'))).toBe(true);
  });

  it('a clean title passes through unchanged with no homoglyph log', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem());
    mockPrisma.item.update.mockImplementation(async ({ data }: any) => ({ ...baseItem(), ...data }));
    const res = makeRes();
    await updateItem({ user: organizerUser, params: { id: 'i1' }, body: { title: 'Brass Floor Lamp' } }, res);
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.item.update.mock.calls[0][0].data.title).toBe('Brass Floor Lamp');
    expect(homoglyphLogs()).toEqual([]);
  });
});
