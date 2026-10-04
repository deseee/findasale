/**
 * itemController owner resolution (item editor unification, Wave 1A: B1, B5, B6, U7).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 *
 * Matrix per handler: sale owner / other organizer on a sale item / inventory owner / other organizer on an
 * inventory item (saleId null). Ownership is DEFAULT DENY: only the resolved owner gets through.
 * Also covers: rarity is recomputed only when the price really changed (or the row still holds the default),
 * rarity assignment at publish, the price-change guards, userEditedFields real-change diff, and the
 * lastEditedAt stamps added in this wave.
 */

const mockPrisma: any = {
  item: { findUnique: jest.fn(), update: jest.fn() },
  itemCompLookup: { findUnique: jest.fn() },
  itemCard: { findUnique: jest.fn() },
  organizer: { findUnique: jest.fn(), findFirst: jest.fn() },
  sale: { findUnique: jest.fn() },
  priceOverrideLog: { create: jest.fn() },
  photo: { create: jest.fn() },
  bid: { findMany: jest.fn() },
  $transaction: jest.fn(),
};
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
jest.mock('../services/ebayRateEstimateService', () => ({ classifyPackageSurchargeTrigger: () => 'SAFE' }));
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
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn().mockResolvedValue(undefined) }));
[
  'csv-parse', '../middleware/auth', '../utils/markdownSticker', 'cloudinary',
  'form-data', '../lib/socket', '../services/liveFeedService',
  '../helpers/itemQueries', '../services/publicItemIndexService', '../utils/listingHealthScore',
  '../utils/getClientIp', '../services/notificationService', '../services/auctionService', '../lib/placesService',
  '../utils/highValueFlagging', '../utils/rankUtils',
  '../services/saleAlertEmailService', '../services/ebayPublishService', '../services/checkoutGuard',
  '../services/marketplace/etsyConnector', '../services/nativeShippingSuggestionService',
  '../services/shippingLabelService', '../services/itemChannelStatusService', '../utils/actingOrganizer',
  '../services/itemCsvImport', '../services/itemDeletionService', '../services/ebaySaleReopenService',
].forEach((p) => jest.mock(p, () => ({})));

// Required AFTER the mocks above (imports are hoisted, so a plain import would load the real modules first).
const {
  getCompSummary, publishItem, applyOrganizerDiscount, removeOrganizerDiscount, addItemPhoto, updateItem, appendDescription, getBids,
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
const asUser = (id: string) => ({ id, roles: ['ORGANIZER'], organizer: { id: `org_of_${id}` } });
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

const saleOrganizer = (over: Record<string, unknown> = {}) => ({
  id: 'org_sale', userId: OWNER_USER, subscriptionTier: 'PRO', lat: 42.1, lng: -85.9, ...over,
});
const INVENTORY_ORGANIZER_ROW = { id: 'org_inv', userId: OWNER_USER, subscriptionTier: 'SIMPLE', lat: 42.5, lng: -85.5 };

/** A sale item owned by u1 through its sale's organizer. */
function saleItem(over: Record<string, unknown> = {}): any {
  return {
    id: 'i1', saleId: 's1', organizerId: 'org_sale', title: 'Lamp', description: 'A lamp', price: 20, rarity: 'COMMON',
    category: 'Home', condition: 'USED', tags: [], userEditedFields: [], photoUrls: [], draftStatus: 'PUBLISHED',
    optimisticLockVersion: 0, listingType: 'FIXED', status: 'AVAILABLE', stockSold: 0, vendorBoothId: null,
    ebayOfferId: null, ebayListingId: null, packageWeightOz: null, shippingPrice: null, card: null,
    packageLengthIn: null, packageWidthIn: null, packageHeightIn: null,
    sale: { id: 's1', status: 'PUBLISHED', purchaseModel: 'SUBSCRIPTION', organizerId: 'org_sale', zip: '49000', organizer: saleOrganizer() },
    ...over,
  };
}

/** An inventory item (saleId null) owned by u1 through Item.organizerId. */
function inventoryItem(over: Record<string, unknown> = {}): any {
  return saleItem({ saleId: null, organizerId: 'org_inv', sale: null, ...over });
}

/** The four owner/other cases every owner-guarded handler is run against. */
const MATRIX: Array<{ label: string; item: () => any; userId: string; owns: boolean; hasSale: boolean }> = [
  { label: 'sale owner', item: () => saleItem(), userId: OWNER_USER, owns: true, hasSale: true },
  { label: 'other organizer on a sale item', item: () => saleItem(), userId: OTHER_USER, owns: false, hasSale: true },
  { label: 'inventory owner', item: () => inventoryItem(), userId: OWNER_USER, owns: true, hasSale: false },
  { label: 'other organizer on an inventory item', item: () => inventoryItem(), userId: OTHER_USER, owns: false, hasSale: false },
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
  // Inventory owner lookup: only (org_inv, u1) resolves; any other pair is "not found".
  mockPrisma.organizer.findFirst.mockImplementation(async ({ where }: any) =>
    where && where.id === 'org_inv' && where.userId === OWNER_USER ? INVENTORY_ORGANIZER_ROW : null,
  );
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  mockPrisma.photo.create.mockResolvedValue({});
  spies = (['error', 'log', 'warn'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

// ---------------------------------------------------------------------------------------------
describe('getCompSummary: owner matrix (B1)', () => {
  for (const c of MATRIX) {
    it(`${c.label}: ${c.owns ? '200' : '403'}`, async () => {
      mockPrisma.item.findUnique.mockResolvedValue(c.item());
      mockPrisma.itemCompLookup.findUnique.mockResolvedValue(null);
      const res = makeRes();
      await getCompSummary({ user: asUser(c.userId), params: { id: 'i1' } }, res);
      expect(res.statusCode).toBe(c.owns ? 200 : 403);
      if (c.owns) expect(res.body).toEqual({ sourceCount: 0, medianLow: null, medianHigh: null, lastUpdated: null });
      else expect(mockPrisma.itemCompLookup.findUnique).not.toHaveBeenCalled();
    });
  }

  it('anonymous callers get 401 and no item lookup', async () => {
    const res = makeRes();
    await getCompSummary({ params: { id: 'i1' } }, res);
    expect(res.statusCode).toBe(401);
    expect(mockPrisma.item.findUnique).not.toHaveBeenCalled();
  });

  it('an inventory item with no organizerId is denied for everyone (never fails open)', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(inventoryItem({ organizerId: null }));
    const res = makeRes();
    await getCompSummary({ user: asUser(OWNER_USER), params: { id: 'i1' } }, res);
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------------------------
describe('publishItem: owner matrix (B1)', () => {
  /** publishItem reads the item four ways; answer each by its select shape. */
  function arrangePublish(item: any, storedRarity = 'COMMON') {
    mockPrisma.item.findUnique.mockImplementation(async (args: any) => {
      const sel = args && args.select;
      if (sel && 'rarity' in sel && 'createdAt' in sel) return { rarity: storedRarity, createdAt: new Date() };
      if (sel && 'userEditedFields' in sel) return { userEditedFields: [] };
      if (sel && 'sale' in sel) return { ...item, draftStatus: 'PENDING_REVIEW' };
      return { ...item, draftStatus: 'PENDING_REVIEW' };
    });
    mockPrisma.item.update.mockResolvedValue({ id: 'i1', saleId: item.saleId, title: 'Lamp', draftStatus: 'PUBLISHED' });
  }

  for (const c of MATRIX) {
    it(`${c.label}: ${c.owns ? '200 and stamps lastEditedAt' : '403 and writes nothing'}`, async () => {
      arrangePublish(c.item());
      const res = makeRes();
      await publishItem({ user: asUser(c.userId), params: { itemId: 'i1' }, body: {} }, res);
      await flush();
      expect(res.statusCode).toBe(c.owns ? 200 : 403);
      if (c.owns) {
        expect(mockPrisma.item.update).toHaveBeenCalledTimes(1);
        expect(mockPrisma.item.update.mock.calls[0][0].data.lastEditedAt).toBeInstanceOf(Date);
      } else {
        expect(mockPrisma.item.update).not.toHaveBeenCalled();
      }
    });
  }

  it('B5: a draft-born row at the default rarity is assigned from its price at publish', async () => {
    arrangePublish(saleItem({ price: 120 }), 'COMMON');
    const res = makeRes();
    await publishItem({ user: asUser(OWNER_USER), params: { itemId: 'i1' }, body: {} }, res);
    await flush();
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.item.update.mock.calls[0][0].data.rarity).toBe('RARE');
  });

  it('B5: a price sent in the publish request wins over the stored price for the assignment', async () => {
    arrangePublish(saleItem({ price: 10 }), 'COMMON');
    const res = makeRes();
    await publishItem({ user: asUser(OWNER_USER), params: { itemId: 'i1' }, body: { price: '80' } }, res);
    await flush();
    expect(mockPrisma.item.update.mock.calls[0][0].data.rarity).toBe('RARE');
  });

  it('B5: the assignment happens BEFORE the LEGENDARY early-access check', async () => {
    arrangePublish(saleItem({ price: 600 }), 'COMMON');
    const res = makeRes();
    await publishItem({ user: asUser(OWNER_USER), params: { itemId: 'i1' }, body: {} }, res);
    await flush();
    const data = mockPrisma.item.update.mock.calls[0][0].data;
    expect(data.rarity).toBe('LEGENDARY');
    expect(data.earlyAccessUntil).toBeInstanceOf(Date);
  });

  it('B5: a row that already holds an assigned rarity is left alone', async () => {
    arrangePublish(saleItem({ price: 120 }), 'UNCOMMON');
    const res = makeRes();
    await publishItem({ user: asUser(OWNER_USER), params: { itemId: 'i1' }, body: {} }, res);
    await flush();
    expect(mockPrisma.item.update.mock.calls[0][0].data).not.toHaveProperty('rarity');
  });

  it('B5: a default-rarity row whose price maps to COMMON is not rewritten', async () => {
    arrangePublish(saleItem({ price: 10 }), 'COMMON');
    const res = makeRes();
    await publishItem({ user: asUser(OWNER_USER), params: { itemId: 'i1' }, body: {} }, res);
    await flush();
    expect(mockPrisma.item.update.mock.calls[0][0].data).not.toHaveProperty('rarity');
  });
});

// ---------------------------------------------------------------------------------------------
describe('applyOrganizerDiscount / removeOrganizerDiscount: owner matrix (B1, B6)', () => {
  for (const c of MATRIX) {
    it(`apply, ${c.label}: ${!c.owns ? '403' : c.hasSale ? '200 and stamps' : '400 (needs a sale)'}`, async () => {
      mockPrisma.item.findUnique.mockResolvedValue(c.item());
      mockPrisma.item.update.mockResolvedValue({ id: 'i1' });
      const res = makeRes();
      await applyOrganizerDiscount({ user: asUser(c.userId), params: { itemId: 'i1' }, body: { xpToSpend: 200 } }, res);
      if (!c.owns) {
        expect(res.statusCode).toBe(403);
        expect(mockSpendXp).not.toHaveBeenCalled();
      } else if (c.hasSale) {
        expect(res.statusCode).toBe(200);
        expect(mockSpendXp).toHaveBeenCalledWith(OWNER_USER, 200, 'ORGANIZER_ITEM_DISCOUNT', expect.objectContaining({ saleId: 's1' }));
        expect(mockPrisma.item.update.mock.calls[0][0].data.lastEditedAt).toBeInstanceOf(Date);
      } else {
        expect(res.statusCode).toBe(400);
        expect(mockSpendXp).not.toHaveBeenCalled();
        expect(mockPrisma.item.update).not.toHaveBeenCalled();
      }
    });
  }

  for (const c of MATRIX) {
    it(`remove, ${c.label}: ${c.owns ? '200 and stamps' : '403'}`, async () => {
      mockPrisma.item.findUnique.mockResolvedValue({ ...c.item(), organizerDiscountXp: 200 });
      mockPrisma.item.update.mockResolvedValue({ id: 'i1' });
      const res = makeRes();
      await removeOrganizerDiscount({ user: asUser(c.userId), params: { itemId: 'i1' } }, res);
      expect(res.statusCode).toBe(c.owns ? 200 : 403);
      if (c.owns) expect(mockPrisma.item.update.mock.calls[0][0].data.lastEditedAt).toBeInstanceOf(Date);
      else expect(mockPrisma.item.update).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------------------------
describe('addItemPhoto (via getItemForOrganizer): owner matrix (B1)', () => {
  for (const c of MATRIX) {
    it(`${c.label}: ${c.owns ? '200' : '404'}`, async () => {
      mockPrisma.item.findUnique.mockResolvedValue(c.item());
      mockPrisma.item.update.mockResolvedValue({ photoUrls: ['https://res.cloudinary.com/demo/a.jpg'] });
      const res = makeRes();
      await addItemPhoto({ user: asUser(c.userId), params: { id: 'i1' }, body: { url: 'https://res.cloudinary.com/demo/a.jpg' } }, res);
      expect(res.statusCode).toBe(c.owns ? 200 : 404);
      if (c.owns) {
        expect(res.body).toEqual({ photoUrls: ['https://res.cloudinary.com/demo/a.jpg'] });
        expect(mockPrisma.item.update.mock.calls[0][0].data.lastEditedAt).toBeInstanceOf(Date);
      } else {
        expect(mockPrisma.item.update).not.toHaveBeenCalled();
      }
    });
  }

  it('the photo limit uses the resolved owner tier for an inventory item (no sale lookup)', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(inventoryItem());
    mockPrisma.item.update.mockResolvedValue({ photoUrls: ['u'] });
    await addItemPhoto({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: { url: 'u' } }, makeRes());
    expect(mockPhotoLimit).toHaveBeenCalledWith('i1', 'SIMPLE');
    expect(mockPrisma.sale.findUnique).not.toHaveBeenCalled();
  });

  it('an ala carte sale still gets PRO limits, a normal sale uses the owner tier', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      saleItem({ sale: { id: 's1', status: 'PUBLISHED', purchaseModel: 'ALA_CARTE', organizer: saleOrganizer({ subscriptionTier: 'SIMPLE' }) } }),
    );
    mockPrisma.item.update.mockResolvedValue({ photoUrls: ['u'] });
    await addItemPhoto({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: { url: 'u' } }, makeRes());
    expect(mockPhotoLimit).toHaveBeenLastCalledWith('i1', 'PRO');

    mockPrisma.item.findUnique.mockResolvedValue(saleItem({ sale: { id: 's1', status: 'PUBLISHED', purchaseModel: 'SUBSCRIPTION', organizer: saleOrganizer({ subscriptionTier: 'SIMPLE' }) } }));
    await addItemPhoto({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: { url: 'u' } }, makeRes());
    expect(mockPhotoLimit).toHaveBeenLastCalledWith('i1', 'SIMPLE');
  });
});

// ---------------------------------------------------------------------------------------------
describe('updateItem: B5 rarity, U7 price guards and real-change diff, B6 SOLD stamp', () => {
  const arrange = (item: any) => {
    mockPrisma.item.findUnique.mockResolvedValue(item);
    mockPrisma.item.update.mockResolvedValue({ id: 'i1', title: item.title, price: item.price, ebayOfferId: null, isHighValueLocked: true, saleId: item.saleId });
    mockPrisma.sale.findUnique.mockResolvedValue({ organizerId: 'org_sale' });
  };
  const run = async (body: Record<string, unknown>, userId = OWNER_USER) => {
    const res = makeRes();
    await updateItem({ user: asUser(userId), params: { id: 'i1' }, body }, res);
    await flush();
    return res;
  };
  const writtenData = () => mockPrisma.item.update.mock.calls[0][0].data;

  it('B1: an inventory owner can save, another organizer is denied (403)', async () => {
    arrange(inventoryItem());
    expect((await run({ title: 'New title' })).statusCode).toBe(200);
    mockPrisma.item.update.mockClear();
    arrange(inventoryItem());
    const denied = await run({ title: 'New title' }, OTHER_USER);
    expect(denied.statusCode).toBe(403);
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  describe('B5 rarity', () => {
    it('price unchanged: rarity is left untouched', async () => {
      arrange(saleItem({ price: 100, rarity: 'UNCOMMON' })); // stored rarity deliberately differs from the price tier
      await run({ price: '100' });
      expect(writtenData()).not.toHaveProperty('rarity');
    });

    it('no price in the request: rarity is left untouched', async () => {
      arrange(saleItem({ price: 100, rarity: 'UNCOMMON' }));
      await run({ title: 'Another title' });
      expect(writtenData()).not.toHaveProperty('rarity');
    });

    it('price crosses a tier: rarity changes', async () => {
      arrange(saleItem({ price: 20, rarity: 'COMMON' }));
      await run({ price: '120' });
      expect(writtenData().rarity).toBe('RARE');
    });

    it('price crosses a tier downward: rarity changes', async () => {
      arrange(saleItem({ price: 600, rarity: 'LEGENDARY' }));
      await run({ price: '30' });
      expect(writtenData().rarity).toBe('UNCOMMON');
    });

    it('price changes within the same tier: rarity is not rewritten', async () => {
      arrange(saleItem({ price: 80, rarity: 'RARE' }));
      await run({ price: '90' });
      expect(writtenData()).not.toHaveProperty('rarity');
    });

    it('a row still at the default rarity with a priced tier gets assigned even when the price is unchanged', async () => {
      arrange(saleItem({ price: 47.99, rarity: 'COMMON' }));
      await run({ price: '47.99' });
      expect(writtenData().rarity).toBe('UNCOMMON');
    });

    it('a default-rarity row whose price is COMMON stays untouched', async () => {
      arrange(saleItem({ price: 10, rarity: 'COMMON' }));
      await run({ price: '10' });
      expect(writtenData()).not.toHaveProperty('rarity');
    });
  });

  describe('U7 price-change guards', () => {
    it('same price: no price drop alert and no PriceOverrideLog row', async () => {
      arrange(saleItem({ price: 100, rarity: 'RARE' }));
      await run({ price: '100' });
      expect(mockNotify).not.toHaveBeenCalled();
      expect(mockPrisma.priceOverrideLog.create).not.toHaveBeenCalled();
      expect(mockPrisma.sale.findUnique).not.toHaveBeenCalled();
    });

    it('real price change: the alert and the override log both run', async () => {
      arrange(saleItem({ price: 100, rarity: 'RARE' }));
      await run({ price: '90' });
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockPrisma.priceOverrideLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.priceOverrideLog.create.mock.calls[0][0].data).toMatchObject({ itemId: 'i1', organizerId: 'org_sale', organizerPrice: 90 });
    });

    it('a sub-cent difference counts as unchanged', async () => {
      arrange(saleItem({ price: 100, rarity: 'RARE' }));
      await run({ price: '100.001' });
      expect(mockNotify).not.toHaveBeenCalled();
    });
  });

  describe('U7 userEditedFields only records real changes (D-006)', () => {
    it('a resave that sends every key unchanged records nothing', async () => {
      arrange(saleItem({ price: 100, rarity: 'RARE', category: 'Home', condition: 'USED', brand: null, size: null, color: null, material: null }));
      await run({ title: 'Lamp', description: 'A lamp', price: '100', category: 'Home', condition: 'USED', brand: '', size: '', color: '', material: '' });
      expect(writtenData()).not.toHaveProperty('userEditedFields');
    });

    it('a really edited field is recorded and merged with the existing list', async () => {
      arrange(saleItem({ price: 100, rarity: 'RARE', userEditedFields: ['brand'] }));
      await run({ title: 'New lamp title', description: 'A lamp', price: '100' });
      expect(writtenData().userEditedFields.slice().sort()).toEqual(['brand', 'title']);
    });

    it('a changed price is recorded, an unchanged one is not', async () => {
      arrange(saleItem({ price: 100, rarity: 'RARE' }));
      await run({ price: '120' });
      expect(writtenData().userEditedFields).toEqual(['price']);
    });

    it('clearing a stored value counts as an edit, and blank over null does not', async () => {
      arrange(saleItem({ category: 'Home', brand: null }));
      await run({ category: '', brand: '' });
      expect(writtenData().userEditedFields).toEqual(['category']);
    });
  });

  describe('B6 SOLD stamp', () => {
    it('stamps lastEditedAt when the SOLD commit path ran (updateData has no status)', async () => {
      arrange(saleItem());
      await run({ status: 'SOLD' });
      expect(mockCommit).toHaveBeenCalledTimes(1);
      const data = writtenData();
      expect(data).not.toHaveProperty('status');
      expect(data.lastEditedAt).toBeInstanceOf(Date);
    });

    it('does not stamp a same-value resave of an already SOLD item', async () => {
      arrange(saleItem({ status: 'SOLD' }));
      await run({ status: 'SOLD', title: 'Lamp' });
      expect(mockCommit).not.toHaveBeenCalled();
      expect(writtenData()).not.toHaveProperty('lastEditedAt');
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('appendDescription: B6 dimension-only stamp', () => {
  const run = async (source: 'VOICE' | 'AUTO') => {
    mockPrisma.item.findUnique.mockResolvedValue(saleItem());
    mockPrisma.item.update.mockResolvedValue({});
    const res = makeRes();
    await appendDescription({ user: asUser(OWNER_USER), params: { id: 'i1' }, body: { text: 'a brass lamp', source, weightOz: 16 } }, res);
    return res;
  };

  it('VOICE dimension-only fill stamps lastEditedAt', async () => {
    const res = await run('VOICE');
    expect(res.statusCode).toBe(200);
    const data = mockPrisma.item.update.mock.calls[0][0].data;
    expect(data.packageWeightOz).toBe(16);
    expect(data.lastEditedAt).toBeInstanceOf(Date);
  });

  it('AUTO dimension-only fill never stamps', async () => {
    const res = await run('AUTO');
    expect(res.statusCode).toBe(200);
    const data = mockPrisma.item.update.mock.calls[0][0].data;
    expect(data.packageWeightOz).toBe(16);
    expect(data).not.toHaveProperty('lastEditedAt');
  });
});

describe('getBids: saleless items are private to the owner (hacker pass fix A6)', () => {
  const BIDS = [
    { id: 'b2', amount: 30, createdAt: new Date('2026-01-02'), status: 'ACTIVE', user: { id: 'bu2', name: 'Casey Buyer' } },
    { id: 'b1', amount: 20, createdAt: new Date('2026-01-01'), status: 'OUTBID', user: { id: 'bu1', name: 'Dana Buyer' } },
  ];
  const run = async (item: any, userId?: string) => {
    mockPrisma.item.findUnique.mockResolvedValue(item);
    mockPrisma.bid.findMany.mockResolvedValue(BIDS);
    const res = makeRes();
    await getBids({ params: { id: 'i1' }, user: userId ? asUser(userId) : undefined }, res);
    return res;
  };

  beforeEach(() => {
    mockPrisma.item.findUnique.mockReset();
    mockPrisma.bid.findMany.mockReset();
    mockPrisma.organizer.findFirst.mockReset();
    mockPrisma.organizer.findFirst.mockImplementation(async ({ where }: any) =>
      where.id === 'org_inv' && where.userId === OWNER_USER ? INVENTORY_ORGANIZER_ROW : null);
  });

  it('sale item, another user: still gets the anonymized list', async () => {
    const res = await run(saleItem(), OTHER_USER);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].bidderLabel).toBe('Bidder 1');
    expect(res.body[0]).not.toHaveProperty('realBidderName');
  });

  it('sale item, anonymous caller: still gets the anonymized list', async () => {
    const res = await run(saleItem());
    expect(res.statusCode).toBe(200);
    expect(res.body[1].bidderLabel).toBe('Bidder 2');
    expect(res.body[1]).not.toHaveProperty('bidderId');
  });

  it('sale item, owner: sees real names', async () => {
    const res = await run(saleItem(), OWNER_USER);
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).toEqual(expect.objectContaining({ bidderLabel: 'Casey Buyer', realBidderName: 'Casey Buyer', bidderId: 'bu2' }));
  });

  it('inventory item, owner: 200 with real names', async () => {
    const res = await run(inventoryItem(), OWNER_USER);
    expect(res.statusCode).toBe(200);
    expect(res.body[0].realBidderName).toBe('Casey Buyer');
  });

  it('inventory item, another user: 404 Item not found and bids are never read', async () => {
    const res = await run(inventoryItem(), OTHER_USER);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Item not found' });
    expect(mockPrisma.bid.findMany).not.toHaveBeenCalled();
  });

  it('inventory item, anonymous caller: 404 Item not found and bids are never read', async () => {
    const res = await run(inventoryItem());
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Item not found' });
    expect(mockPrisma.bid.findMany).not.toHaveBeenCalled();
  });

  it('inventory item with no organizerId: 404 for everyone', async () => {
    const res = await run(inventoryItem({ organizerId: null }), OWNER_USER);
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.bid.findMany).not.toHaveBeenCalled();
  });

  it('a missing item keeps its identical 404 body', async () => {
    const res = await run(null, OWNER_USER);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Item not found' });
  });
});
