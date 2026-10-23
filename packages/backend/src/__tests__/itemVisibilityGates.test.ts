/**
 * Public item visibility (2026-10-13): staff rule, placeBid, getBids, eBay comps, similar items, QR code.
 *  - Staff = any accepted, not grace-removed member of the organizer's workspace (utils/saleStaffAccess
 *    isOrganizerStaff), no TEAMS tier or broadcast_alerts permission needed. Used by GET /items/:id.
 *  - placeBid: an item embargoed for the bidder, a hidden item, or a non-PUBLISHED / deleted sale is a 404.
 *  - getBids, getItemEbayComps, getSimilarItems, getQrCode: same visibility as GET /items/:id
 *    (owner organizer, its staff and admin exempt), hidden is the same 404 as missing.
 *  - publicItemIndexService (GET /items/sitemap) excludes early-access items.
 * Prisma is a plain object of jest.fn()s; itemController's other imports are stubbed like itemControllerOwner.test.ts.
 */

const mockPrisma: any = {
  item: { findUnique: jest.fn(), findMany: jest.fn() },
  organizer: { findUnique: jest.fn(), findFirst: jest.fn() },
  workspaceMember: { findFirst: jest.fn() },
  bid: { findMany: jest.fn() },
  sale: { findUnique: jest.fn() },
};
const mockFetchComps = jest.fn();
const mockAssertCheckout = jest.fn();

jest.mock('../index', () => ({ prisma: mockPrisma }));
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn().mockRejectedValue(new Error('no embedding service in tests')) },
}));
jest.mock('../services/cloudAIService', () => ({ analyzeItemImage: jest.fn(), isCloudAIAvailable: () => false }));
jest.mock('../lib/aiTagsQuotaTracker', () => ({ checkAiTagQuota: jest.fn(), incrementAiTagCount: jest.fn() }));
jest.mock('../utils/expireCheckoutSession', () => ({ retrieveCheckoutSessionAcrossAccounts: jest.fn() }));
jest.mock('../services/ebayRateEstimateService', () => ({ classifyPackageSurchargeTrigger: () => 'SAFE' }));
jest.mock('../utils/ebayShippingClassifier', () => ({ classifyEbayShipping: () => null }));
jest.mock('../services/achievementService', () => ({ checkAndAward: () => Promise.resolve() }));
jest.mock('../services/commandCenterService', () => ({ invalidateCommandCenterCache: () => Promise.resolve() }));
jest.mock('../services/priceDropService', () => ({ notifyPriceDropAlerts: jest.fn() }));
jest.mock('../services/itemSaleGuard', () => {
  class ItemAlreadyCommittedError extends Error {}
  return { commitItemSale: jest.fn(), ItemAlreadyCommittedError };
});
jest.mock('../lib/tierEnforcement', () => ({ checkItemOverPhotoLimit: jest.fn() }));
jest.mock('../services/xpService', () => ({
  getSpendableXp: jest.fn(), spendXp: jest.fn(), awardXp: jest.fn(), applyHuntPassMultiplier: jest.fn(),
  checkMonthlyXpCap: jest.fn(), XP_AWARDS: {},
}));
jest.mock('../services/descriptionMerger', () => ({ composeDescription: jest.fn(), stripShippingPhrases: (t: string) => t }));
jest.mock('../services/webhookService', () => ({ fireWebhooks: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/autoFanoutDispatcher', () => ({ dispatchApiTierAutoFanout: jest.fn() }));
jest.mock('../jobs/fetchEbayComps', () => ({ enqueueFetchEbayComps: jest.fn() }));
jest.mock('../services/marketplace/marketplacePosterService', () => ({ enqueueMarketplacePostJob: jest.fn() }));
jest.mock('../controllers/uploadController', () => ({
  resetRapidDraftDebounce: jest.fn(), rapidfireAIDebounce: new Map(), heldAnalysisItems: new Set(),
}));
jest.mock('../controllers/ebayController', () => ({
  refreshEbayAccessToken: jest.fn(async () => 'tok_test'),
  endEbayListingIfExists: jest.fn(),
  fetchEbayPriceComps: (...a: unknown[]) => mockFetchComps(...a),
}));
// The wash-trade guard runs after the visibility gate: here it always stops the request with a 403, so a 403
// means "the visibility gate let the bid through" and no bid logic runs.
jest.mock('../services/checkoutGuard', () => {
  class CheckoutGuardError extends Error {}
  return { CheckoutGuardError, assertCheckoutAllowed: (...a: unknown[]) => mockAssertCheckout(CheckoutGuardError, ...a) };
});
jest.mock('qrcode', () => ({ toBuffer: jest.fn(async () => Buffer.from('png')) }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn() }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn() }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn() }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn() }));
[
  'csv-parse', '../middleware/auth', '../utils/markdownSticker', 'cloudinary',
  'form-data', '../lib/socket', '../services/liveFeedService',
  '../helpers/itemQueries', '../utils/listingHealthScore',
  '../utils/getClientIp', '../services/notificationService', '../services/auctionService', '../lib/placesService',
  '../utils/highValueFlagging', '../utils/rankUtils',
  '../services/saleAlertEmailService', '../services/ebayPublishService',
  '../services/marketplace/etsyConnector', '../services/nativeShippingSuggestionService',
  '../services/shippingLabelService', '../services/itemChannelStatusService', '../utils/actingOrganizer',
  '../services/itemCsvImport', '../services/itemDeletionService', '../services/ebaySaleReopenService',
].forEach((p) => jest.mock(p, () => ({})));

const {
  getItemById, placeBid, getBids, getItemEbayComps, getSimilarItems, getQrCode, isItemPubliclyViewable,
} = require('../controllers/itemController');
const { isOrganizerStaff } = require('../utils/saleStaffAccess');
const { listPublicItemIds } = jest.requireActual('../services/publicItemIndexService');

function makeRes() {
  const res: any = {
    statusCode: 200, body: undefined, sent: false,
    status(code: number) { if (!this.sent) this.statusCode = code; return this; },
    json(body: any) { if (!this.sent) { this.body = body; this.sent = true; } return this; },
    set() { return this; },
    send(body: any) { if (!this.sent) { this.body = body; this.sent = true; } return this; },
  };
  return res;
}

const OWNER = { id: 'owner_user', role: 'ORGANIZER', roles: ['ORGANIZER'] };
const STAFF = { id: 'staff_user', role: 'USER', roles: ['USER'] };
const SHOPPER = { id: 'shopper_user', role: 'USER', roles: ['USER'] };
const ADMIN = { id: 'admin_user', role: 'ADMIN', roles: ['ADMIN'] };
const HOUR = 3600000;

function item(over: Record<string, any> = {}, saleOver: Record<string, any> = {}): any {
  return {
    id: 'i1', saleId: 's1', organizerId: 'org_owner', title: 'Brass lamp', category: 'Home', conditionGrade: 'GOOD',
    isActive: true, status: 'AVAILABLE', draftStatus: 'PUBLISHED', listingType: 'AUCTION',
    createdAt: new Date(Date.now() - 48 * HOUR), rarity: 'COMMON', earlyAccessUntil: null,
    isLegendary: false, legendaryVisibleAt: null, auctionClosed: false, auctionEndTime: null,
    currentBid: null, auctionReservePrice: null, maxBids: [], photoUrls: [], reservation: null, checkoutAttempts: [],
    sale: {
      id: 's1', status: 'PUBLISHED', deletedAt: null, organizerId: 'org_owner', address: '123 Maple St', city: 'Grand Rapids',
      startDate: new Date('2099-06-01T00:00:00Z'), lat: 42.963795, lng: -85.670006,
      organizer: { id: 'org_owner', userId: 'owner_user', timezone: 'America/Detroit', subscriptionTier: 'SIMPLE', lat: null, lng: null },
      ...saleOver,
    },
    ...over,
  };
}
const EMBARGOED = { earlyAccessUntil: new Date(Date.now() + 24 * HOUR) };

beforeEach(() => {
  for (const model of Object.values(mockPrisma) as any[]) for (const fn of Object.values(model) as any[]) (fn as jest.Mock).mockReset();
  mockFetchComps.mockReset().mockResolvedValue({
    listings: [{ price: 12, condition: 'Used', imageUrl: 'x', url: 'https://ebay.example/1', title: 'Lamp' }],
    isMockData: false, compsRunAt: new Date(),
  });
  mockAssertCheckout.mockReset().mockImplementation(async (Err: any) => { throw new Err('guard reached'); });
  // Staff lookup: only staff_user is an accepted, active member of org_owner's workspace (any role, any tier).
  mockPrisma.organizer.findUnique.mockImplementation(async ({ where }: any) =>
    where.userId === 'owner_user' ? { id: 'org_owner' } : null);
  mockPrisma.workspaceMember.findFirst.mockImplementation(async ({ where }: any) =>
    where.workspace?.ownerId === 'org_owner' && where.OR?.some((c: any) => c.userId === 'staff_user') ? { id: 'wm1' } : null);
  mockPrisma.bid.findMany.mockResolvedValue([
    { id: 'b1', amount: 20, createdAt: new Date(), status: 'ACTIVE', user: { id: 'bu1', name: 'Dana Buyer' } },
  ]);
  mockPrisma.item.findMany.mockResolvedValue([]);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------------------------
describe('1. isOrganizerStaff: any active workspace member of that organizer', () => {
  it('accepted, not grace-removed member: true, with no tier or permission check', async () => {
    await expect(isOrganizerStaff('staff_user', 'org_owner')).resolves.toBe(true);
    const where = mockPrisma.workspaceMember.findFirst.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining({ acceptedAt: { not: null }, graceRemovedAt: null, workspace: { ownerId: 'org_owner' } }));
  });
  it('the organizer itself: true; a shopper or another organizer: false; missing ids: false, no query', async () => {
    await expect(isOrganizerStaff('owner_user', 'org_owner')).resolves.toBe(true);
    await expect(isOrganizerStaff('shopper_user', 'org_owner')).resolves.toBe(false);
    mockPrisma.workspaceMember.findFirst.mockClear();
    await expect(isOrganizerStaff(undefined, 'org_owner')).resolves.toBe(false);
    await expect(isOrganizerStaff('staff_user', null)).resolves.toBe(false);
    expect(mockPrisma.workspaceMember.findFirst).not.toHaveBeenCalled();
  });
  it('a database error denies', async () => {
    mockPrisma.workspaceMember.findFirst.mockRejectedValue(new Error('db down'));
    await expect(isOrganizerStaff('staff_user', 'org_owner')).resolves.toBe(false);
  });
});

describe('1. getItemById: staff without any special permission see the address and early-access items', () => {
  const run = async (row: any, user?: any) => {
    mockPrisma.item.findUnique.mockResolvedValue(row);
    const res = makeRes();
    await getItemById({ params: { id: 'i1' }, user }, res);
    return res;
  };
  it('staff: embargoed item visible, full street address', async () => {
    const res = await run(item(EMBARGOED), STAFF);
    expect(res.statusCode).toBe(200);
    expect(res.body.sale.address).toBe('123 Maple St');
    expect(res.body.sale.addressGate).toEqual({ visible: true });
  });
  it('signed-in shopper: embargoed item is a 404', async () => {
    const res = await run(item(EMBARGOED), SHOPPER);
    expect(res.statusCode).toBe(404);
  });
  it('signed-in shopper before the window: address removed, pin coarse', async () => {
    const res = await run(item(), SHOPPER);
    expect(res.statusCode).toBe(200);
    expect(res.body.sale.address).toBe('');
    expect(res.body.sale.lat).toBe(42.96);
    expect(res.body.sale).not.toHaveProperty('deletedAt');
  });
  it('soft-deleted sale: 404 for a shopper, still visible to the owner', async () => {
    expect((await run(item({}, { deletedAt: new Date() }), SHOPPER)).statusCode).toBe(404);
    expect((await run(item({}, { deletedAt: new Date() }), OWNER)).statusCode).toBe(200);
  });
  it('2026-10-23: an item with no sale is public only once PUBLISHED (an unverified account\'s kit or import stays a draft)', async () => {
    mockPrisma.organizer.findFirst.mockImplementation(async ({ where }: any) =>
      where.id === 'org_owner' && where.userId === 'owner_user' ? { id: 'org_owner' } : null);
    const saleless = (over: Record<string, any> = {}) => item({ saleId: null, sale: null, listingType: 'KIT', ...over });
    for (const draftStatus of ['DRAFT', 'PENDING_REVIEW']) {
      expect((await run(saleless({ draftStatus }))).statusCode).toBe(404);
      expect((await run(saleless({ draftStatus }), SHOPPER)).statusCode).toBe(404);
      expect((await run(saleless({ draftStatus }), OWNER)).statusCode).toBe(200);
      expect((await run(saleless({ draftStatus }), ADMIN)).statusCode).toBe(200);
    }
    expect((await run(saleless({ draftStatus: 'PUBLISHED' }))).statusCode).toBe(200);
    // An anonymous viewer is never the owner of a saleless item (undefined === undefined used to count as ownership).
    expect((await run(saleless({ draftStatus: 'DRAFT', isActive: false }))).statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------------------------
describe('3. placeBid: hidden, embargoed or non-live items are a 404', () => {
  const run = async (row: any, user: any = SHOPPER) => {
    mockPrisma.item.findUnique.mockResolvedValue(row);
    const res = makeRes();
    await placeBid({ params: { id: 'i1' }, body: { maxBidAmount: 50 }, user }, res);
    return res;
  };
  it.each([
    ['DRAFT sale', item({}, { status: 'DRAFT' })],
    ['ENDED sale', item({}, { status: 'ENDED' })],
    ['soft-deleted sale', item({}, { deletedAt: new Date() })],
    ['hidden item', item({ isActive: false })],
    ['DRAFT item', item({ draftStatus: 'DRAFT' })],
    ['grace-locked item', item({ status: 'GRACE_LOCKED' })],
    ['item inside its early-access window', item(EMBARGOED)],
    ['Legendary item before its reveal time', item({ isLegendary: true, legendaryVisibleAt: new Date(Date.now() + HOUR) })],
  ])('%s: 404 Item not found, guard never reached', async (_label, row) => {
    const res = await run(row);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Item not found' });
    expect(mockAssertCheckout).not.toHaveBeenCalled();
  });
  it('staff get no exemption: an embargoed item is still a 404 for a staff bidder', async () => {
    expect((await run(item(EMBARGOED), STAFF)).statusCode).toBe(404);
  });
  it('a visible item on a PUBLISHED sale passes the gate (reaches the wash-trade guard)', async () => {
    const res = await run(item());
    expect(res.statusCode).toBe(403);
    expect(mockAssertCheckout).toHaveBeenCalledTimes(1);
  });
  it('an early-access item passes for a bidder with an active Hunt Pass', async () => {
    const res = await run(item(EMBARGOED), { ...SHOPPER, huntPassActive: true, huntPassExpiry: new Date(Date.now() + 24 * HOUR) });
    expect(res.statusCode).toBe(403);
    expect(mockAssertCheckout).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('4. getBids: anonymized list follows item visibility', () => {
  const run = async (row: any, user?: any) => {
    mockPrisma.item.findUnique.mockResolvedValue(row);
    const res = makeRes();
    await getBids({ params: { id: 'i1' }, user }, res);
    return res;
  };
  it.each([
    ['DRAFT sale', item({}, { status: 'DRAFT' })],
    ['soft-deleted sale', item({}, { deletedAt: new Date() })],
    ['hidden item', item({ isActive: false })],
    ['embargoed item', item(EMBARGOED)],
  ])('%s: 404 for anonymous and shoppers, bids never read', async (_l, row) => {
    expect((await run(row)).statusCode).toBe(404);
    expect((await run(row, SHOPPER)).statusCode).toBe(404);
    expect(mockPrisma.bid.findMany).not.toHaveBeenCalled();
  });
  it('owner, staff and admin still get the list for an embargoed item on a DRAFT sale; only the owner sees names', async () => {
    const row = item(EMBARGOED, { status: 'DRAFT' });
    const owner = await run(row, OWNER);
    expect(owner.statusCode).toBe(200);
    expect(owner.body[0].realBidderName).toBe('Dana Buyer');
    const staff = await run(row, STAFF);
    expect(staff.statusCode).toBe(200);
    expect(staff.body[0].bidderLabel).toBe('Bidder 1');
    expect(staff.body[0]).not.toHaveProperty('realBidderName');
    expect((await run(row, ADMIN)).statusCode).toBe(200);
  });
  it('a visible item on an ENDED sale: anonymized list for anonymous viewers', async () => {
    const res = await run(item({}, { status: 'ENDED' }));
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).not.toHaveProperty('bidderId');
  });
});

// ---------------------------------------------------------------------------------------------
describe('5. public item sub-resources: eBay comps, similar items, QR code', () => {
  const HIDDEN: Array<[string, any]> = [
    ['DRAFT sale', item({}, { status: 'DRAFT' })],
    ['soft-deleted sale', item({}, { deletedAt: new Date() })],
    ['hidden item', item({ isActive: false })],
    ['embargoed item', item(EMBARGOED)],
    ['inventory item (no sale)', item({ saleId: null, sale: null })],
  ];

  describe('getItemEbayComps', () => {
    const run = async (row: any, user?: any) => {
      mockPrisma.item.findUnique.mockResolvedValue(row);
      const res = makeRes();
      await getItemEbayComps({ params: { id: 'i1' }, user }, res);
      return res;
    };
    it.each(HIDDEN)('%s: 404 for anonymous, the title never reaches eBay', async (_l, row) => {
      const res = await run(row);
      expect(res.statusCode).toBe(404);
      expect(res.body.comps).toEqual([]);
      expect(mockFetchComps).not.toHaveBeenCalled();
    });
    it('missing item: 404', async () => {
      expect((await run(null)).statusCode).toBe(404);
    });
    it('visible item: comps for anonymous', async () => {
      const res = await run(item());
      expect(res.statusCode).toBe(200);
      expect(res.body.comps).toHaveLength(1);
    });
    it('embargoed item: comps for owner, staff and admin', async () => {
      for (const u of [OWNER, STAFF, ADMIN]) expect((await run(item(EMBARGOED), u)).statusCode).toBe(200);
    });
    it('the select loads the visibility inputs', async () => {
      await run(item());
      const select = mockPrisma.item.findUnique.mock.calls[0][0].select;
      expect(select).toEqual(expect.objectContaining({ isActive: true, draftStatus: true, earlyAccessUntil: true, sale: expect.any(Object) }));
    });
  });

  describe('getSimilarItems', () => {
    const run = async (row: any, user?: any) => {
      mockPrisma.item.findUnique.mockResolvedValue(row);
      const res = makeRes();
      await getSimilarItems({ params: { id: 'i1' }, user }, res);
      return res;
    };
    it.each(HIDDEN)('%s: 404 for anonymous, no category lookup', async (_l, row) => {
      expect((await run(row)).statusCode).toBe(404);
      expect(mockPrisma.item.findMany).not.toHaveBeenCalled();
    });
    it('visible item: 200; embargoed item for staff: 200', async () => {
      expect((await run(item())).statusCode).toBe(200);
      expect((await run(item(EMBARGOED), STAFF)).statusCode).toBe(200);
    });
  });

  describe('getQrCode', () => {
    const run = async (row: any, user?: any) => {
      mockPrisma.item.findUnique.mockResolvedValue(row);
      const res = makeRes();
      await getQrCode({ params: { itemId: 'i1' }, user }, res);
      return res;
    };
    it.each(HIDDEN)('%s: 404 for anonymous', async (_l, row) => {
      expect((await run(row)).statusCode).toBe(404);
    });
    it('owner prints a code for an unpublished item and an inventory item; visible item works for anyone', async () => {
      expect((await run(item({ draftStatus: 'DRAFT' }), OWNER)).statusCode).toBe(200);
      expect((await run(item({ saleId: null, sale: null }), OWNER)).statusCode).toBe(200);
      expect((await run(item())).statusCode).toBe(200);
    });
  });
});

describe('isItemPubliclyViewable (pure)', () => {
  it('needs a sale in an allowed state', () => {
    expect(isItemPubliclyViewable(item(), ['PUBLISHED'])).toBe(true);
    expect(isItemPubliclyViewable(item({}, { status: 'ENDED' }), ['PUBLISHED'])).toBe(false);
    expect(isItemPubliclyViewable(item({}, { status: 'ENDED' }), ['PUBLISHED', 'ENDED'])).toBe(true);
    expect(isItemPubliclyViewable(item({ listingType: 'CONSIGNOR_TAG' }), ['PUBLISHED'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('6. publicItemIndexService (GET /items/sitemap) excludes early-access items', () => {
  it('the item where includes the anonymous embargo fragment', async () => {
    const now = new Date('2026-10-13T12:00:00Z');
    await listPublicItemIds({ limit: 10, cursorId: null }, now);
    const where = mockPrisma.item.findMany.mock.calls[0][0].where;
    const { notEmbargoedForPublicWhere } = jest.requireActual('../lib/saleLocationPrivacy');
    expect(where.AND).toEqual([notEmbargoedForPublicWhere(now)]);
    expect(where.sale).toEqual(expect.objectContaining({ status: 'PUBLISHED', deletedAt: null }));
  });
});

// ---------------------------------------------------------------------------------------------
describe('getInspirationItems: AVAILABLE is not overwritten by PUBLIC_ITEM_FILTER', () => {
  it('ANDs the public filter, status AVAILABLE and the embargo fragment', async () => {
    const { getInspirationItems } = require('../controllers/itemController');
    const res = makeRes();
    await getInspirationItems({ query: {} }, res);
    const where = mockPrisma.item.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('status');
    expect(where.AND).toEqual(expect.arrayContaining([{ status: 'AVAILABLE' }]));
    expect(where.AND).toHaveLength(3);
    expect(where.sale).toEqual({ status: 'PUBLISHED', deletedAt: null });
  });
});
