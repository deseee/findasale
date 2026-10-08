/**
 * itemController marketplace wiring (item editor unification, Wave 2: U1, U2, U3, U4).
 * updateItem: marketplacePlan from the real diff, strict skipMarketplaceSync, hold and dirty columns, the hold columns
 * cannot be set from the body, condition and grade coercion. createItem: condition coercion. New handlers
 * (marketplace-status, ack, ebay-repush, ebay-hold/release): 403/404 matrix on sale and inventory items.
 * getDraftItemsBySaleId: batched failed-push badge count.
 */

const mockPrisma: any = {
  item: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
  itemCard: { findUnique: jest.fn(), findMany: jest.fn() },
  organizer: { findUnique: jest.fn(), findFirst: jest.fn() },
  organizerWorkspace: { findFirst: jest.fn() },
  discountRule: { findMany: jest.fn() },
  sale: { findUnique: jest.fn() },
  priceOverrideLog: { create: jest.fn() },
  photo: { create: jest.fn(), createMany: jest.fn() },
  marketplaceListingJob: { findMany: jest.fn() },
  itemMarketplacePush: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn(), updateMany: jest.fn() },
  etsyListing: { findMany: jest.fn(), findFirst: jest.fn() },
  $transaction: jest.fn(),
};
const mockPush = jest.fn();
const mockNotify = jest.fn();
const mockCommit = jest.fn();
const mockPhotoLimit = jest.fn();
const mockSpendXp = jest.fn();
const mockGetSpendableXp = jest.fn();
const mockComposeDescription = jest.fn();

jest.mock('../index', () => ({ prisma: mockPrisma }));
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn().mockRejectedValue(new Error('no embedding service in tests')) },
}));
jest.mock('../services/cloudAIService', () => ({ analyzeItemImage: jest.fn(), isCloudAIAvailable: () => false }));
jest.mock('../lib/aiTagsQuotaTracker', () => ({
  checkAiTagQuota: jest.fn().mockResolvedValue({ exceeded: false, used: 0, limit: 100, remaining: 100 }),
  incrementAiTagCount: jest.fn(),
}));
jest.mock('../utils/expireCheckoutSession', () => ({ retrieveCheckoutSessionAcrossAccounts: jest.fn() }));
jest.mock('../services/ebayRateEstimateService', () => ({ ...jest.requireActual('../services/ebayRateEstimateService'), classifyPackageSurchargeTrigger: () => 'SAFE' }));
jest.mock('../utils/ebayShippingClassifier', () => ({ classifyEbayShipping: () => null }));
jest.mock('../services/achievementService', () => ({ checkAndAward: () => Promise.resolve() }));
jest.mock('../services/commandCenterService', () => ({ invalidateCommandCenterCache: () => Promise.resolve() }));
jest.mock('../services/priceDropService', () => ({ notifyPriceDropAlerts: (...a: unknown[]) => mockNotify(...a) }));
jest.mock('../services/itemSaleGuard', () => {
  class ItemAlreadyCommittedError extends Error {}
  return { commitItemSale: (...a: unknown[]) => mockCommit(...a), ItemAlreadyCommittedError };
});
jest.mock('../lib/tierEnforcement', () => ({ checkItemOverPhotoLimit: (...a: unknown[]) => mockPhotoLimit(...a) }));
jest.mock('../services/xpService', () => ({
  getSpendableXp: (...a: unknown[]) => mockGetSpendableXp(...a),
  spendXp: (...a: unknown[]) => mockSpendXp(...a),
  awardXp: jest.fn(),
  applyHuntPassMultiplier: jest.fn(),
  checkMonthlyXpCap: jest.fn(),
  XP_AWARDS: {},
}));
jest.mock('../services/descriptionMerger', () => ({
  composeDescription: (...a: unknown[]) => mockComposeDescription(...a),
  stripShippingPhrases: (t: string) => t,
}));
jest.mock('../services/webhookService', () => ({ fireWebhooks: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/autoFanoutDispatcher', () => ({ dispatchApiTierAutoFanout: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../jobs/fetchEbayComps', () => ({ enqueueFetchEbayComps: jest.fn() }));
jest.mock('../services/marketplace/marketplacePosterService', () => ({ enqueueMarketplacePostJob: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../controllers/uploadController', () => ({
  resetRapidDraftDebounce: jest.fn(),
  rapidfireAIDebounce: new Map(),
  heldAnalysisItems: new Set(),
}));
jest.mock('../controllers/ebayController', () => ({
  refreshEbayAccessToken: jest.fn(async () => 'tok_test'),
  endEbayListingIfExists: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/ebayItemPushService', () => ({
  ...jest.requireActual('../services/ebayItemPushService'),
  pushItemToEbay: (...a: unknown[]) => mockPush(...a),
}));
jest.mock('../utils/listingHealthScore', () => ({ computeHealthScore: () => ({ score: 50 }) }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn().mockResolvedValue(undefined) }));
[
  'csv-parse', '../middleware/auth', '../utils/markdownSticker', 'cloudinary',
  'form-data', '../lib/socket', '../services/liveFeedService',
  '../helpers/itemQueries', '../services/publicItemIndexService',
  '../utils/getClientIp', '../services/notificationService', '../services/auctionService', '../lib/placesService',
  '../utils/highValueFlagging', '../utils/rankUtils',
  '../services/saleAlertEmailService', '../services/ebayPublishService', '../services/checkoutGuard',
  '../services/marketplace/etsyConnector', '../services/nativeShippingSuggestionService',
  '../services/shippingLabelService', '../utils/actingOrganizer',
  '../services/itemCsvImport', '../services/itemDeletionService', '../services/ebaySaleReopenService',
].forEach((p) => jest.mock(p, () => ({})));

// Required AFTER the mocks above (imports are hoisted, so a plain import would load the real modules first).
const {
  updateItem, createItem, getItemMarketplaceStatusHandler, acknowledgeItemMarketplacePush, repushItemToEbay, releaseEbayHold,
  getDraftItemsBySaleId, getItemForEdit, publishItem,
} = require('../controllers/itemController');


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

const OWNER_USER = 'u1';
const OTHER_USER = 'u2';
const asUser = (id: string, roles: string[] = ['ORGANIZER']) => ({ id, roles, organizer: { id: `org_of_${id}` } });
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

const saleOrganizer = (over: Record<string, unknown> = {}) => ({
  id: 'org_sale', userId: OWNER_USER, subscriptionTier: 'PRO', lat: 42.1, lng: -85.9, ...over,
});
const INVENTORY_ORGANIZER_ROW = { id: 'org_inv', userId: OWNER_USER, subscriptionTier: 'SIMPLE', lat: 42.5, lng: -85.5 };

function saleItem(over: Record<string, unknown> = {}): any {
  return {
    id: 'i1', saleId: 's1', organizerId: 'org_sale', title: 'Lamp', description: 'A lamp', price: 20, rarity: 'COMMON',
    category: 'Home', condition: 'USED', conditionGrade: null, tags: [], userEditedFields: [], photoUrls: [], draftStatus: 'PUBLISHED',
    optimisticLockVersion: 0, listingType: 'FIXED', status: 'AVAILABLE', stockSold: 0, vendorBoothId: null,
    ebayOfferId: null, ebayListingId: null, ebaySyncState: null, ebaySyncHeldAt: null, ebayHeldFields: [], ebayContentDirtyAt: null,
    packageWeightOz: null, shippingPrice: null, card: null,
    packageLengthIn: null, packageWidthIn: null, packageHeightIn: null,
    sale: { id: 's1', status: 'PUBLISHED', purchaseModel: 'SUBSCRIPTION', organizerId: 'org_sale', zip: '49000', organizer: saleOrganizer() },
    ...over,
  };
}
function inventoryItem(over: Record<string, unknown> = {}): any {
  return saleItem({ saleId: null, organizerId: 'org_inv', sale: null, ...over });
}
const ebayListed = (over: Record<string, unknown> = {}) => saleItem({ ebayOfferId: 'offer1', ebayListingId: 'list1', ...over });

const MATRIX: Array<{ label: string; item: () => any; userId: string; owns: boolean }> = [
  { label: 'sale owner', item: () => saleItem(), userId: OWNER_USER, owns: true },
  { label: 'other organizer on a sale item', item: () => saleItem(), userId: OTHER_USER, owns: false },
  { label: 'inventory owner', item: () => inventoryItem(), userId: OWNER_USER, owns: true },
  { label: 'other organizer on an inventory item', item: () => inventoryItem(), userId: OTHER_USER, owns: false },
];

let spies: any[] = [];

beforeEach(() => {
  for (const model of Object.values(mockPrisma) as any[]) {
    if (typeof model === 'function') { model.mockReset(); continue; }
    for (const fn of Object.values(model) as any[]) fn.mockReset();
  }
  mockNotify.mockReset().mockResolvedValue(undefined);
  mockCommit.mockReset().mockResolvedValue({ id: 'i1', status: 'SOLD' });
  mockPhotoLimit.mockReset().mockResolvedValue({ isOverLimit: false, limit: 10 });
  mockSpendXp.mockReset().mockResolvedValue(true);
  mockGetSpendableXp.mockReset().mockResolvedValue(1000);
  mockComposeDescription.mockReset().mockReturnValue({ appended: false, reason: 'duplicate' });
  mockPush.mockReset().mockResolvedValue({ status: 'SUCCESS', fieldsAttempted: [], fieldsPushed: [], errorCode: null, errorMessage: null });
  mockPrisma.organizer.findFirst.mockImplementation(async ({ where }: any) =>
    where && where.id === 'org_inv' && where.userId === OWNER_USER ? INVENTORY_ORGANIZER_ROW : null,
  );
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  mockPrisma.photo.create.mockResolvedValue({});
  mockPrisma.photo.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([]);
  mockPrisma.itemMarketplacePush.groupBy.mockResolvedValue([]);
  spies = (['error', 'log', 'warn'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

// ---------------------------------------------------------------------------------------------
describe('updateItem: marketplacePlan, hold, dirty, strict skipMarketplaceSync', () => {
  const arrange = (item: any, updated: Record<string, unknown> = {}) => {
    mockPrisma.item.findUnique.mockResolvedValue(item);
    mockPrisma.item.update.mockResolvedValue({
      id: 'i1', title: item.title, price: item.price, ebayOfferId: item.ebayOfferId, ebayListingId: item.ebayListingId,
      isHighValueLocked: true, saleId: item.saleId, ...updated,
    });
    mockPrisma.sale.findUnique.mockResolvedValue({ organizerId: 'org_sale' });
  };
  const run = async (body: Record<string, unknown>, userId = OWNER_USER) => {
    const res = makeRes();
    await updateItem({ user: asUser(userId), params: { id: 'i1' }, body }, res);
    await flush();
    return res;
  };
  const writtenData = () => mockPrisma.item.update.mock.calls[0][0].data;

  it('returns marketplacePlan with the REAL diff: only the changed field is planned, unchanged keys are not', async () => {
    arrange(ebayListed({ price: 20, title: 'Lamp', condition: 'USED' }));
    const res = await run({ title: 'Brass Lamp', price: '20', condition: 'USED', description: 'A lamp' });
    expect(res.statusCode).toBe(200);
    expect(res.body.marketplacePlan).toEqual({ ebay: { willPush: true, fields: ['title'] }, extension: [] });
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0]).toMatchObject({
      itemId: 'i1', organizerId: 'org_sale', trigger: 'SAVE', fields: ['title'], dirtyBefore: null,
    });
    expect(mockPush.mock.calls[0][0].hold).toBeUndefined();
  });

  it('an unchanged resave plans nothing and makes no eBay push at all', async () => {
    arrange(ebayListed({ price: 20, title: 'Lamp', condition: 'USED', description: 'A lamp' }));
    const res = await run({ title: 'Lamp', price: '20', condition: 'USED', description: 'A lamp' });
    expect(res.body.marketplacePlan.ebay).toEqual({ willPush: false, fields: [], reason: 'no_changes' });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('an item not on eBay: reason not_listed and no push', async () => {
    arrange(saleItem());
    const res = await run({ title: 'Changed' });
    expect(res.body.marketplacePlan.ebay).toEqual({ willPush: false, fields: [], reason: 'not_listed' });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('a price change plans price and keeps the push-first state: ebaySyncState goes to PENDING exactly as before', async () => {
    arrange(ebayListed({ price: 20 }));
    const res = await run({ price: '25' });
    expect(res.body.marketplacePlan.ebay).toEqual({ willPush: true, fields: ['price'] });
    expect(writtenData().ebaySyncState).toBe('PENDING');
    expect(writtenData().ebaySyncAttempts).toBe(0);
    expect(mockPush.mock.calls[0][0].fields).toEqual(['price']);
  });

  it('resaving an unchanged price on a parked-failed item still re-pushes the price (resave-to-retry)', async () => {
    arrange(ebayListed({ price: 20, ebaySyncState: 'FAILED_RETRYABLE' }));
    const res = await run({ price: '20' });
    expect(res.body.marketplacePlan.ebay).toEqual({ willPush: true, fields: ['price'] });
    expect(writtenData().ebaySyncState).toBe('PENDING');
  });

  it('extension marketplaces stay prompt-only: listed on Vinted plus a price change gives a manual-update prompt, no push', async () => {
    arrange(saleItem({ price: 20 }));
    mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([
      { itemId: 'i1', platform: 'VINTED', action: 'POST', status: 'POSTED', createdAt: new Date('2026-10-01') },
      { itemId: 'i1', platform: 'MERCARI', action: 'POST', status: 'POSTED', createdAt: new Date('2026-10-01') },
      { itemId: 'i1', platform: 'MERCARI', action: 'REMOVE', status: 'REMOVED', createdAt: new Date('2026-10-02') },
    ]);
    const res = await run({ price: '30' });
    expect(res.body.marketplacePlan.extension).toEqual([
      { platform: 'VINTED', message: 'Needs manual update on Vinted', fields: ['price'] },
    ]);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('a plan lookup failure never fails the save', async () => {
    arrange(saleItem({ price: 20 }));
    mockPrisma.marketplaceListingJob.findMany.mockRejectedValue(new Error('boom'));
    const res = await run({ price: '30' });
    expect(res.statusCode).toBe(200);
    expect(res.body.marketplacePlan.extension).toEqual([]);
  });

  describe('U2: skipMarketplaceSync', () => {
    it('true on an eBay-listed item: no push call with fields, a SKIPPED_HELD record, hold columns set, held fields are the real changes', async () => {
      arrange(ebayListed({ title: 'Lamp', price: 20 }));
      const res = await run({ title: 'New', price: '25', skipMarketplaceSync: true });
      expect(res.body.marketplacePlan.ebay).toEqual({ willPush: false, fields: ['title', 'price'], reason: 'held' });
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush.mock.calls[0][0]).toMatchObject({ hold: true, trigger: 'SAVE', fields: ['title', 'price'] });
      const data = writtenData();
      expect(data.ebaySyncHeldAt).toBeInstanceOf(Date);
      expect(data.ebayHeldFields).toEqual(['title', 'price']);
      expect(data.ebayContentDirtyAt).toBeInstanceOf(Date);
    });

    it('the held fields are a union across saves', async () => {
      arrange(ebayListed({ title: 'Lamp', price: 20, ebaySyncHeldAt: new Date('2026-10-03'), ebayHeldFields: ['title'] }));
      await run({ price: '25' }); // no skip flag: the item is already held, so it stays held
      expect(writtenData().ebayHeldFields).toEqual(['title', 'price']);
      expect(writtenData().ebaySyncHeldAt).toEqual(new Date('2026-10-03')); // the original hold time is kept
      expect(mockPush.mock.calls[0][0]).toMatchObject({ hold: true });
    });

    it.each([['"true"', 'true'], ['1', 1], ['"yes"', 'yes'], ['object', { a: 1 }], ['array', [true]], ['"TRUE"', 'TRUE']])(
      'a truthy non-boolean (%s) is ignored: the save pushes normally and no hold is written',
      async (_label, value) => {
        arrange(ebayListed({ title: 'Lamp' }));
        await run({ title: 'New', skipMarketplaceSync: value });
        expect(writtenData()).not.toHaveProperty('ebaySyncHeldAt');
        expect(writtenData()).not.toHaveProperty('ebayHeldFields');
        expect(mockPush.mock.calls[0][0].hold).toBeUndefined();
        expect(mockPush.mock.calls[0][0].fields).toEqual(['title']);
      }
    );

    it('false is not a hold either', async () => {
      arrange(ebayListed({ title: 'Lamp' }));
      await run({ title: 'New', skipMarketplaceSync: false });
      expect(writtenData()).not.toHaveProperty('ebaySyncHeldAt');
    });

    it('on an item that is not on eBay the flag sets no hold', async () => {
      arrange(saleItem({ title: 'Lamp' }));
      await run({ title: 'New', skipMarketplaceSync: true });
      expect(writtenData()).not.toHaveProperty('ebaySyncHeldAt');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('hold columns and the dirty flag cannot be set through the request body', async () => {
      arrange(ebayListed({ title: 'Lamp' }));
      await run({
        description: 'A lamp', // nothing really changes
        ebaySyncHeldAt: '2020-01-01T00:00:00Z',
        ebayHeldFields: ['title', 'price'],
        ebayContentDirtyAt: '2020-01-01T00:00:00Z',
        lastEditedAt: '2020-01-01T00:00:00Z',
      });
      const data = writtenData();
      expect(data).not.toHaveProperty('ebaySyncHeldAt');
      expect(data).not.toHaveProperty('ebayHeldFields');
      expect(data).not.toHaveProperty('ebayContentDirtyAt');
      expect(data).not.toHaveProperty('lastEditedAt');
    });

    it('a body that smuggles the hold columns next to a real change cannot choose their values', async () => {
      arrange(ebayListed({ title: 'Lamp' }));
      await run({ title: 'New', ebayContentDirtyAt: null, ebaySyncHeldAt: null, ebayHeldFields: ['everything'] });
      const data = writtenData();
      expect(data.ebayContentDirtyAt).toBeInstanceOf(Date); // set by the server from the real change
      expect(data).not.toHaveProperty('ebaySyncHeldAt');
      expect(data).not.toHaveProperty('ebayHeldFields');
    });
  });

  describe('U2: ebayContentDirtyAt', () => {
    it('set when title, description or condition really change on an eBay-listed item', async () => {
      for (const body of [{ title: 'New' }, { description: 'New text' }, { condition: 'NEW' }]) {
        mockPrisma.item.update.mockReset();
        arrange(ebayListed({ title: 'Lamp', description: 'A lamp', condition: 'USED' }));
        await run(body);
        expect(writtenData().ebayContentDirtyAt).toBeInstanceOf(Date);
      }
    });

    it('not set for a price-only change, an unchanged resave, or an item that is not on eBay', async () => {
      arrange(ebayListed({ price: 20 }));
      await run({ price: '25' });
      expect(writtenData()).not.toHaveProperty('ebayContentDirtyAt');
      mockPrisma.item.update.mockReset();
      arrange(ebayListed({ title: 'Lamp' }));
      await run({ title: 'Lamp' });
      expect(writtenData()).not.toHaveProperty('ebayContentDirtyAt');
      mockPrisma.item.update.mockReset();
      arrange(saleItem({ title: 'Lamp' }));
      await run({ title: 'Changed' });
      expect(writtenData()).not.toHaveProperty('ebayContentDirtyAt');
    });

    it('the push call carries the dirty flag as it was before the save (so a partial success cannot clear an older edit)', async () => {
      const earlier = new Date('2026-10-01');
      arrange(ebayListed({ title: 'Lamp', ebayContentDirtyAt: earlier }));
      await run({ title: 'New' });
      expect(mockPush.mock.calls[0][0].dirtyBefore).toEqual(earlier);
    });
  });

  describe('U4: condition and grade coercion on update', () => {
    it.each([
      ['LIKE_NEW', 'USED', 'A'],
      ['EXCELLENT', 'USED', 'A'],
      ['GOOD', 'NEW', null], // existing NEW, GOOD means USED: a real change
      ['like new', 'USED', 'A'],
      ['parts', 'USED', null],
    ])('%s coerces without a 400', async (sent, existing, hint) => {
      arrange(saleItem({ condition: existing, conditionGrade: null }));
      const res = await run({ condition: sent });
      expect(res.statusCode).toBe(200);
      const data = writtenData();
      const expectedCondition = sent.toLowerCase() === 'parts' ? 'PARTS_OR_REPAIR' : 'USED';
      if (existing === expectedCondition) expect(data).not.toHaveProperty('condition'); // already means the same: untouched
      else expect(data.condition).toBe(expectedCondition);
      if (hint) expect(data.conditionGrade).toBe(hint);
      else expect(data).not.toHaveProperty('conditionGrade');
    });

    it('a legacy hint grade never overrides a grade the row or the request already has', async () => {
      arrange(saleItem({ condition: 'USED', conditionGrade: 'C' }));
      await run({ condition: 'LIKE_NEW' });
      expect(writtenData()).not.toHaveProperty('conditionGrade');
      mockPrisma.item.update.mockReset();
      arrange(saleItem({ condition: 'USED', conditionGrade: null }));
      await run({ condition: 'LIKE_NEW', conditionGrade: 'b' });
      expect(writtenData().conditionGrade).toBe('B');
    });

    it('an unrecognized condition is logged and ignored (existing value kept), never a 400', async () => {
      arrange(saleItem({ condition: 'USED' }));
      const res = await run({ condition: 'banana' });
      expect(res.statusCode).toBe(200);
      expect(writtenData()).not.toHaveProperty('condition');
      expect(console.warn).toHaveBeenCalled();
    });

    it('empty or null clears the condition; a canonical value passes through', async () => {
      arrange(saleItem({ condition: 'USED' }));
      await run({ condition: null });
      expect(writtenData().condition).toBeNull();
      mockPrisma.item.update.mockReset();
      arrange(saleItem({ condition: 'USED' }));
      await run({ condition: 'REFURBISHED' });
      expect(writtenData().condition).toBe('REFURBISHED');
    });

    it('grade: case-insensitive S to D kept, unknown ignored, empty clears', async () => {
      arrange(saleItem());
      await run({ conditionGrade: 'a' });
      expect(writtenData().conditionGrade).toBe('A');
      mockPrisma.item.update.mockReset();
      arrange(saleItem({ conditionGrade: 'B' }));
      const res = await run({ conditionGrade: 'Z' });
      expect(res.statusCode).toBe(200);
      expect(writtenData()).not.toHaveProperty('conditionGrade');
      mockPrisma.item.update.mockReset();
      arrange(saleItem({ conditionGrade: 'B' }));
      await run({ conditionGrade: '' });
      expect(writtenData().conditionGrade).toBeNull();
    });

    it('a grade change that moves the eBay enum is planned as a condition push', async () => {
      arrange(ebayListed({ condition: 'USED', conditionGrade: 'C' }));
      const res = await run({ conditionGrade: 'A' });
      expect(res.body.marketplacePlan.ebay).toEqual({ willPush: true, fields: ['condition'] });
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('createItem: U4 condition coercion', () => {
  const create = async (body: Record<string, unknown>) => {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org_sale', organizer: { userId: OWNER_USER } });
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org_sale', subscriptionTier: 'PRO' });
    mockPrisma.item.create.mockImplementation(async ({ data }: any) => ({ id: 'new1', ...data }));
    const res = makeRes();
    await createItem({ user: { ...asUser(OWNER_USER), organizer: { id: 'org_sale' } }, body: { saleId: 's1', title: 'T', ...body }, files: [] }, res);
    return res;
  };
  const data = () => mockPrisma.item.create.mock.calls[0][0].data;

  it('legacy values coerce: LIKE_NEW becomes USED with grade A, GOOD becomes USED; never a 400', async () => {
    const a = await create({ condition: 'LIKE_NEW' });
    expect(a.statusCode).toBe(201);
    expect(data().condition).toBe('USED');
    expect(data().conditionGrade).toBe('A');
    mockPrisma.item.create.mockClear();
    await create({ condition: 'GOOD' });
    expect(data().condition).toBe('USED');
    expect(data()).not.toHaveProperty('conditionGrade');
  });

  it('an explicit grade wins over the hint, is uppercased, and an unknown grade is dropped', async () => {
    await create({ condition: 'LIKE_NEW', conditionGrade: 'c' });
    expect(data().conditionGrade).toBe('C');
    mockPrisma.item.create.mockClear();
    await create({ condition: 'USED', conditionGrade: 'nope' });
    expect(data()).not.toHaveProperty('conditionGrade');
  });

  it('unknown or empty condition is stored as null; canonical values are untouched', async () => {
    await create({ condition: 'banana' });
    expect(data().condition).toBeNull();
    mockPrisma.item.create.mockClear();
    await create({});
    expect(data().condition).toBeNull();
    mockPrisma.item.create.mockClear();
    await create({ condition: 'PARTS_OR_REPAIR' });
    expect(data().condition).toBe('PARTS_OR_REPAIR');
  });
});

// ---------------------------------------------------------------------------------------------
describe('new marketplace handlers: 403/404 matrix', () => {
  const HANDLERS: Array<{ name: string; fn: () => any; method: string }> = [
    { name: 'GET marketplace-status', fn: () => getItemMarketplaceStatusHandler, method: 'GET' },
    { name: 'POST marketplace-push/ack', fn: () => acknowledgeItemMarketplacePush, method: 'POST' },
    { name: 'POST ebay-repush', fn: () => repushItemToEbay, method: 'POST' },
    { name: 'POST ebay-hold/release', fn: () => releaseEbayHold, method: 'POST' },
  ];

  const call = async (fn: any, item: any, userId: string, body: any = {}, user: any = asUser(userId)) => {
    mockPrisma.item.findUnique.mockResolvedValue(item);
    const res = makeRes();
    await fn({ user, params: { id: 'i1' }, body }, res);
    return res;
  };

  for (const h of HANDLERS) {
    describe(h.name, () => {
      for (const c of MATRIX) {
        it(`${c.label}: ${c.owns ? 'allowed' : '404 Item not found'}`, async () => {
          mockPrisma.organizer.findUnique.mockResolvedValue({ ebayConnection: null, shopifyEnabled: false, subscriptionTier: 'PRO', pausedMarketplaces: [], marketplaceAccounts: [] });
          mockPrisma.itemMarketplacePush.findMany.mockResolvedValue([]);
          mockPrisma.itemMarketplacePush.count.mockResolvedValue(0);
          mockPrisma.itemMarketplacePush.updateMany.mockResolvedValue({ count: 0 });
          mockPrisma.etsyListing.findFirst.mockResolvedValue(null);
          mockPrisma.itemCard.findUnique.mockResolvedValue(null);
          mockPrisma.item.update.mockResolvedValue({});
          const res = await call(h.fn(), c.item(), c.userId);
          if (c.owns) {
            expect(res.statusCode).toBe(200);
          } else {
            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ message: 'Item not found' });
            expect(mockPrisma.item.update).not.toHaveBeenCalled();
            expect(mockPrisma.itemMarketplacePush.updateMany).not.toHaveBeenCalled();
            expect(mockPush).not.toHaveBeenCalled();
          }
        });
      }

      it('a missing item is the same 404', async () => {
        const res = await call(h.fn(), null, OWNER_USER);
        expect(res.statusCode).toBe(404);
        expect(res.body).toEqual({ message: 'Item not found' });
      });

      it('an inventory item with no organizerId is denied for everyone (never fails open)', async () => {
        const res = await call(h.fn(), inventoryItem({ organizerId: null }), OWNER_USER);
        expect(res.statusCode).toBe(404);
      });

      it('a user without the organizer role gets 403 and no item lookup', async () => {
        const res = await call(h.fn(), saleItem(), OWNER_USER, {}, asUser(OWNER_USER, ['SHOPPER']));
        expect(res.statusCode).toBe(403);
        expect(mockPrisma.item.findUnique).not.toHaveBeenCalled();
      });
    });
  }

  it('GET marketplace-status returns the composed status for the owner and never another organizer data', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ ebayConnection: { id: 'c' }, shopifyEnabled: false, subscriptionTier: 'PRO', pausedMarketplaces: [], marketplaceAccounts: [] });
    mockPrisma.itemMarketplacePush.findMany.mockResolvedValue([
      { id: 'p1', trigger: 'SAVE', status: 'FAILED', fieldsAttempted: ['price'], fieldsPushed: [], errorCode: 'HTTP_400', errorMessage: 'bad', startedAt: new Date(), finishedAt: new Date(), acknowledgedAt: null, organizerId: 'org_sale' },
    ]);
    mockPrisma.itemMarketplacePush.count.mockResolvedValue(1);
    mockPrisma.etsyListing.findFirst.mockResolvedValue(null);
    mockPrisma.itemCard.findUnique.mockResolvedValue(null);
    const res = await call(getItemMarketplaceStatusHandler, ebayListed({ ebaySyncHeldAt: new Date('2026-10-04') }), OWNER_USER);
    expect(res.statusCode).toBe(200);
    expect(res.body.platforms.ebay.status).toBe('paused');
    expect(res.body.failedUnacknowledgedPushCount).toBe(1);
    expect(res.body.platforms.ebay.lastPush).toMatchObject({ id: 'p1', status: 'FAILED' });
    // Every push / etsy read is scoped to the RESOLVED owner organizer id, nothing from the request.
    expect(mockPrisma.itemMarketplacePush.findMany.mock.calls[0][0].where.organizerId).toBe('org_sale');
    expect(mockPrisma.organizer.findUnique.mock.calls[0][0].where).toEqual({ id: 'org_sale' });
  });

  it('ack only touches the resolved owner own FAILED/PARTIAL rows, whatever the body says', async () => {
    mockPrisma.itemMarketplacePush.updateMany.mockResolvedValue({ count: 2 });
    const res = await call(acknowledgeItemMarketplacePush, inventoryItem(), OWNER_USER, { organizerId: 'org_victim', itemId: 'other', all: true });
    expect(res.body).toEqual({ acknowledged: 2 });
    const where = mockPrisma.itemMarketplacePush.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ itemId: 'i1', organizerId: 'org_inv', platform: 'EBAY', status: { in: ['FAILED', 'PARTIAL'] }, acknowledgedAt: null });
    expect(mockPrisma.itemMarketplacePush.updateMany.mock.calls[0][0].data.acknowledgedAt).toBeInstanceOf(Date);
  });

  it('release clears all three hold columns without pushing', async () => {
    mockPrisma.item.update.mockResolvedValue({});
    const res = await call(releaseEbayHold, ebayListed({ ebaySyncHeldAt: new Date(), ebayHeldFields: ['title'], ebayContentDirtyAt: new Date() }), OWNER_USER);
    expect(res.body).toEqual({ released: true, ebayHold: { heldAt: null, heldFields: [], contentDirtyAt: null } });
    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { ebaySyncHeldAt: null, ebayHeldFields: [], ebayContentDirtyAt: null },
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  describe('ebay-repush', () => {
    it('inventory (saleless) item: a message only, no eBay call (default D8)', async () => {
      const res = await call(repushItemToEbay, inventoryItem({ ebayOfferId: 'o', ebayListingId: 'l' }), OWNER_USER);
      expect(res.statusCode).toBe(200);
      expect(res.body.outcome).toBeNull();
      expect(res.body.message).toMatch(/inventory items/);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('a held sale item: REPUSH pushes the held fields only, and returns the outcome and the hold state', async () => {
      mockPush.mockResolvedValue({ status: 'SUCCESS', fieldsAttempted: ['price'], fieldsPushed: ['price'], errorCode: null, errorMessage: null });
      mockPrisma.item.findUnique
        .mockResolvedValueOnce(ebayListed({ ebaySyncHeldAt: new Date(), ebayHeldFields: ['price'] }))
        .mockResolvedValueOnce({ ebaySyncHeldAt: null, ebayHeldFields: [], ebayContentDirtyAt: null });
      const res = makeRes();
      await repushItemToEbay({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: {} }, res);
      expect(mockPush).toHaveBeenCalledWith({ itemId: 'i1', organizerId: 'org_sale', trigger: 'REPUSH', fields: ['price'] });
      expect(res.body.outcome.status).toBe('SUCCESS');
      expect(res.body.ebayHold).toEqual({ heldAt: null, heldFields: [], contentDirtyAt: null });
      expect(res.body.message).toBe('eBay is up to date.');
    });

    it('nothing held and nothing dirty: a full push of title, description, condition and price', async () => {
      mockPrisma.item.findUnique.mockResolvedValueOnce(ebayListed()).mockResolvedValueOnce({ ebaySyncHeldAt: null, ebayHeldFields: [], ebayContentDirtyAt: null });
      const res = makeRes();
      await repushItemToEbay({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: {} }, res);
      expect(mockPush.mock.calls[0][0].fields.sort()).toEqual(['condition', 'description', 'price', 'title']);
    });

    it('retry: true retries only what the newest failed push left undone, as a RETRY; truthy strings are ignored', async () => {
      mockPrisma.itemMarketplacePush.findFirst.mockResolvedValue({ fieldsAttempted: ['price', 'title'], fieldsPushed: ['price'] });
      mockPrisma.item.findUnique.mockResolvedValueOnce(ebayListed()).mockResolvedValueOnce({ ebaySyncHeldAt: null, ebayHeldFields: [], ebayContentDirtyAt: null });
      const res = makeRes();
      await repushItemToEbay({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: { retry: true } }, res);
      expect(mockPush.mock.calls[0][0]).toEqual({ itemId: 'i1', organizerId: 'org_sale', trigger: 'RETRY', fields: ['title'] });
      expect(mockPrisma.itemMarketplacePush.findFirst.mock.calls[0][0].where).toMatchObject({ itemId: 'i1', organizerId: 'org_sale' });

      mockPush.mockClear();
      mockPrisma.item.findUnique.mockResolvedValueOnce(ebayListed()).mockResolvedValueOnce({});
      await repushItemToEbay({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: { retry: 'true' } }, makeRes());
      expect(mockPush.mock.calls[0][0].trigger).toBe('REPUSH');
    });

    it('a failed push is reported, not thrown', async () => {
      mockPush.mockResolvedValue({ status: 'FAILED', fieldsAttempted: ['title'], fieldsPushed: [], errorCode: 'NO_TOKEN', errorMessage: 'x' });
      mockPrisma.item.findUnique.mockResolvedValueOnce(ebayListed()).mockResolvedValueOnce({ ebaySyncHeldAt: new Date(), ebayHeldFields: ['title'], ebayContentDirtyAt: null });
      const res = makeRes();
      await repushItemToEbay({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: {} }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.outcome.status).toBe('FAILED');
      expect(res.body.message).toBe('eBay could not be updated.');
      expect(res.body.ebayHold.heldFields).toEqual(['title']); // the hold persists
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('getItemForEdit: U3 extra select', () => {
  it('adds reverbListingId and the hold state to the owner-only select', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await getItemForEdit({ user: asUser(OWNER_USER), params: { id: 'i1' } }, res);
    const select = mockPrisma.item.findUnique.mock.calls[0][0].select;
    expect(select.reverbListingId).toBe(true);
    expect(select.ebaySyncHeldAt).toBe(true);
    expect(select.ebayHeldFields).toBe(true);
    expect(select.ebayContentDirtyAt).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('getDraftItemsBySaleId: failed-push badge count (one batched query, no N+1)', () => {
  const draftRow = (id: string) => ({
    id, saleId: 's1', title: id, description: '', category: null, ebayCategoryId: null, ebayCategoryName: null, condition: 'USED',
    conditionGrade: null, price: 5, photoUrls: [], draftStatus: 'PUBLISHED', tags: [], status: 'AVAILABLE', ebayListingId: null,
    ebayOfferId: null, discogsListingId: null, reverbListingId: null, shopifyListing: null, tagColor: null, createdAt: new Date(), updatedAt: new Date(),
  });

  it('returns marketplacePushFailedCount per item from a single groupBy, scoped to the sale organizer', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org_sale', organizer: { userId: OWNER_USER } });
    mockPrisma.item.findMany.mockResolvedValue(['a', 'b', 'c'].map(draftRow));
    mockPrisma.organizerWorkspace.findFirst.mockResolvedValue(null);
    mockPrisma.organizer.findUnique.mockResolvedValue({ ebayConnection: null, shopifyEnabled: false, subscriptionTier: 'PRO', marketplaceAccounts: [] });
    mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([]);
    mockPrisma.itemMarketplacePush.groupBy.mockResolvedValue([{ itemId: 'a', _count: { _all: 2 } }, { itemId: 'c', _count: { _all: 1 } }]);
    const res = makeRes();
    await getDraftItemsBySaleId({ user: asUser(OWNER_USER), query: { saleId: 's1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(Object.fromEntries(res.body.map((i: any) => [i.id, i.marketplacePushFailedCount]))).toEqual({ a: 2, b: 0, c: 1 });
    expect(mockPrisma.itemMarketplacePush.groupBy).toHaveBeenCalledTimes(1);
    expect(mockPrisma.itemMarketplacePush.groupBy.mock.calls[0][0].where).toMatchObject({
      itemId: { in: ['a', 'b', 'c'] }, organizerId: 'org_sale', acknowledgedAt: null, status: { in: ['FAILED', 'PARTIAL'] },
    });
    // No per-item reads of the push table anywhere.
    expect(mockPrisma.itemMarketplacePush.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.itemMarketplacePush.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.itemMarketplacePush.count).not.toHaveBeenCalled();
  });

  it('a failure loading the counts hides the badge but never fails the list', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org_sale', organizer: { userId: OWNER_USER } });
    mockPrisma.item.findMany.mockResolvedValue([draftRow('a')]);
    mockPrisma.organizerWorkspace.findFirst.mockResolvedValue(null);
    mockPrisma.organizer.findUnique.mockResolvedValue({ ebayConnection: null, shopifyEnabled: false, subscriptionTier: 'PRO', marketplaceAccounts: [] });
    mockPrisma.itemMarketplacePush.groupBy.mockRejectedValue(new Error('no table'));
    const res = makeRes();
    await getDraftItemsBySaleId({ user: asUser(OWNER_USER), query: { saleId: 's1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body[0].marketplacePushFailedCount).toBe(0);
  });
});


// ---------------------------------------------------------------------------------------------
// Wave 2 hacker pass: regression tests for the fixes.
describe('hacker pass: ebay-repush per-item in-flight guard', () => {
  const settled = { ebaySyncHeldAt: null, ebayHeldFields: [], ebayContentDirtyAt: null };

  it('a second click while the first update is still running gets 409 and makes no second eBay call', async () => {
    let finishFirst: (v: unknown) => void = () => undefined;
    mockPush.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    mockPrisma.item.findUnique.mockResolvedValue(ebayListed());

    const first = repushItemToEbay({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: {} }, makeRes());
    await flush(); // the first request is now parked inside pushItemToEbay
    const second = makeRes();
    await repushItemToEbay({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: {} }, second);
    expect(second.statusCode).toBe(409);
    expect(second.body.message).toMatch(/already running/);
    expect(mockPush).toHaveBeenCalledTimes(1);

    finishFirst({ status: 'SUCCESS', fieldsAttempted: ['price'], fieldsPushed: ['price'], errorCode: null, errorMessage: null });
    await first;
  });

  it('the guard is released afterwards (success, and also when the push throws), so a later click works', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ebayListed());
    mockPush.mockRejectedValueOnce(new Error('boom'));
    const failed = makeRes();
    await repushItemToEbay({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: {} }, failed);
    expect(failed.statusCode).toBe(500);

    mockPrisma.item.findUnique.mockResolvedValueOnce(ebayListed()).mockResolvedValueOnce(settled);
    const again = makeRes();
    await repushItemToEbay({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: {} }, again);
    expect(again.statusCode).toBe(200);
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('the guard is per item: a different item is not blocked by a running one', async () => {
    let finishFirst: (v: unknown) => void = () => undefined;
    mockPush.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    mockPrisma.item.findUnique.mockResolvedValue(ebayListed());
    const first = repushItemToEbay({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: {} }, makeRes());
    await flush();
    mockPrisma.item.findUnique.mockResolvedValue(ebayListed({ id: 'i2' }));
    const other = makeRes();
    await repushItemToEbay({ user: asUser(OWNER_USER), params: { id: 'i2' }, body: {} }, other);
    expect(other.statusCode).toBe(200);
    finishFirst({ status: 'SUCCESS', fieldsAttempted: [], fieldsPushed: [], errorCode: null, errorMessage: null });
    await first;
  });

  it('a non-owner never reaches the guard or the push (404, nothing recorded as in flight)', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(ebayListed());
    const res = makeRes();
    await repushItemToEbay({ user: asUser(OTHER_USER), params: { id: 'i1' }, body: {} }, res);
    expect(res.statusCode).toBe(404);
    expect(mockPush).not.toHaveBeenCalled();
    mockPrisma.item.findUnique.mockResolvedValueOnce(ebayListed()).mockResolvedValueOnce(settled);
    const owner = makeRes();
    await repushItemToEbay({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: {} }, owner);
    expect(owner.statusCode).toBe(200);
  });

  it('a sold item reports it is no longer for sale (not "not listed on eBay")', async () => {
    mockPush.mockResolvedValue({ status: 'SKIPPED_NOT_LISTED', fieldsAttempted: ['price'], fieldsPushed: [], errorCode: 'ITEM_NOT_ACTIVE', errorMessage: 'x' });
    mockPrisma.item.findUnique.mockResolvedValueOnce(ebayListed({ status: 'SOLD' })).mockResolvedValueOnce(settled);
    const res = makeRes();
    await repushItemToEbay({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: {} }, res);
    expect(res.body.message).toBe('This item is no longer for sale, so eBay was not changed.');
  });
});

describe('hacker pass: the repush route is rate limited per user, after authentication', () => {
  it('routes/items.ts mounts ebayRepushLimiter between authenticate and the handler', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../routes/items.ts'), 'utf8');
    expect(src).toMatch(/router\.post\('\/:id\/ebay-repush', authenticate, ebayRepushLimiter, repushItemToEbay\)/);
  });

  it('allows 6 requests a minute per user, then 429 with a JSON message; another user has their own budget', async () => {
    const express = require('express');
    const http = require('http');
    const { ebayRepushLimiter } = jest.requireActual('../middleware/rateLimiter');
    const app = express();
    app.post('/x', (req: any, _res: any, next: any) => { req.user = { id: req.headers['x-user'] }; next(); }, ebayRepushLimiter, (_req: any, res: any) => res.json({ ok: true }));
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as any).port;
    const hit = (user: string) => new Promise<{ status: number; body: any }>((resolve, reject) => {
      const rq = http.request({ port, path: '/x', method: 'POST', headers: { 'x-user': user } }, (rs: any) => {
        let data = '';
        rs.on('data', (c: any) => (data += c));
        rs.on('end', () => resolve({ status: rs.statusCode, body: JSON.parse(data) }));
      });
      rq.on('error', reject);
      rq.end();
    });
    try {
      for (let i = 0; i < 6; i++) expect((await hit('limiter-u1')).status).toBe(200);
      const blocked = await hit('limiter-u1');
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toMatch(/Too many eBay update requests/);
      expect((await hit('limiter-u2')).status).toBe(200);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});

describe('hacker pass: publishItem coerces the condition (no arbitrary string reaches Item.condition)', () => {
  const draft = () => ({
    id: 'i1', saleId: 's1', organizerId: 'org_sale', draftStatus: 'PENDING_REVIEW', optimisticLockVersion: 0, category: 'Home',
    tags: [], price: 20, card: null, rarity: 'COMMON', createdAt: new Date(),
    sale: { organizer: saleOrganizer() },
  });
  const publish = async (body: Record<string, unknown>) => {
    mockPrisma.item.findUnique.mockResolvedValue(draft());
    mockPrisma.item.update.mockResolvedValue({ id: 'i1', saleId: 's1', title: 'Lamp', draftStatus: 'PUBLISHED', organizerId: 'org_sale' });
    const res = makeRes();
    await publishItem({ user: { ...asUser(OWNER_USER), organizer: { id: 'org_sale' } }, params: { itemId: 'i1' }, body }, res);
    await flush();
    return res;
  };
  const writtenCondition = () => {
    const call = mockPrisma.item.update.mock.calls.find((c: any) => c[0]?.data?.draftStatus === 'PUBLISHED');
    return call ? call[0].data : undefined;
  };

  it('a recognized legacy value is stored canonical; a canonical value is stored as is', async () => {
    expect((await publish({ condition: 'like-new' })).statusCode).toBe(200);
    expect(writtenCondition().condition).toBe('USED');
    mockPrisma.item.update.mockClear();
    await publish({ condition: 'refurbished' });
    expect(writtenCondition().condition).toBe('REFURBISHED');
  });

  it('an arbitrary or hostile string is never written (the stored value is left alone)', async () => {
    for (const hostile of ['<script>alert(1)</script>', 'NEW; DROP TABLE "Item"', 'x'.repeat(5000), { $ne: null }, ['NEW']]) {
      mockPrisma.item.update.mockClear();
      const res = await publish({ condition: hostile });
      expect(res.statusCode).toBe(200); // never a 400
      expect('condition' in writtenCondition()).toBe(false);
      expect(writtenCondition().userEditedFields).toBeUndefined(); // not recorded as an organizer edit either
    }
  });

  it('an empty condition clears it', async () => {
    await publish({ condition: '' });
    expect(writtenCondition().condition).toBeNull();
  });
});


// ---------------------------------------------------------------------------------------------
// 2026-10-08: Add Items expanded row needs stock / cost / consignor / markdown fields from GET /items/drafts.
describe('getDraftItemsBySaleId: stock, cost basis, consignor and markdown fields (2026-10-08)', () => {
  const FIELDS = ['stockTotal', 'stockSold', 'costBasis', 'consignorId', 'excludeFromMarkdown', 'originalPrice', 'markdownTierApplied'];

  const arrange = (rows: any[]) => {
    mockPrisma.sale.findUnique.mockResolvedValue({ id: 's1', organizerId: 'org_sale', organizer: { userId: OWNER_USER } });
    mockPrisma.item.findMany.mockResolvedValue(rows);
    mockPrisma.organizerWorkspace.findFirst.mockResolvedValue(null);
    mockPrisma.organizer.findUnique.mockResolvedValue({ ebayConnection: null, shopifyEnabled: false, subscriptionTier: 'PRO', marketplaceAccounts: [] });
    mockPrisma.marketplaceListingJob.findMany.mockResolvedValue([]);
    mockPrisma.itemMarketplacePush.groupBy.mockResolvedValue([]);
  };
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'a', saleId: 's1', title: 'Lamp', description: '', category: null, ebayCategoryId: null, ebayCategoryName: null, condition: 'USED',
    conditionGrade: null, price: 5, photoUrls: [], draftStatus: 'PUBLISHED', tags: [], status: 'AVAILABLE', ebayListingId: null,
    ebayOfferId: null, discogsListingId: null, reverbListingId: null, shopifyListing: null, tagColor: null, createdAt: new Date(), updatedAt: new Date(),
    ...over,
  });

  it('selects every field the expanded row round-trips, including the consignor id and name', async () => {
    arrange([row()]);
    const res = makeRes();
    await getDraftItemsBySaleId({ user: asUser(OWNER_USER), query: { saleId: 's1' } }, res);
    expect(res.statusCode).toBe(200);
    const select = mockPrisma.item.findMany.mock.calls[0][0].select;
    for (const f of FIELDS) expect(select[f]).toBe(true);
    expect(select.consignor).toEqual({ select: { id: true, name: true } });
  });

  it('passes the real stock, cost and consignor values through in the JSON response', async () => {
    arrange([row({
      stockTotal: 12, stockSold: 3, costBasis: 4.5, consignorId: 'c1', consignor: { id: 'c1', name: 'Pat' },
      excludeFromMarkdown: true, originalPrice: 9, markdownTierApplied: 1,
    })]);
    const res = makeRes();
    await getDraftItemsBySaleId({ user: asUser(OWNER_USER), query: { saleId: 's1' } }, res);
    expect(res.body[0]).toMatchObject({
      stockTotal: 12, stockSold: 3, costBasis: 4.5, consignorId: 'c1', consignor: { id: 'c1', name: 'Pat' },
      excludeFromMarkdown: true, originalPrice: 9, markdownTierApplied: 1,
    });
  });

  it('a row with no consignor is returned with consignorId and consignor null', async () => {
    arrange([row({ stockTotal: 1, stockSold: 0, costBasis: null, consignorId: null, consignor: null, excludeFromMarkdown: false })]);
    const res = makeRes();
    await getDraftItemsBySaleId({ user: asUser(OWNER_USER), query: { saleId: 's1' } }, res);
    expect(res.body[0].consignorId).toBeNull();
    expect(res.body[0].consignor).toBeNull();
    expect(res.body[0].costBasis).toBeNull();
  });
});
