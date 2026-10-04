/**
 * Item editor unification, Wave 1 (W1-1E): ebayController owner fixes (B1), the side-effect-free eBay fee
 * check (B2) and the getComps write guard (B4). NOT EXECUTED when written (jest cannot run on the authoring
 * device); CI is the first real run.
 *
 * Everything the controller touches is a jest mock. No network, no database, no eBay call.
 */

const mockPrisma: any = {
  item: { findUnique: jest.fn(), update: jest.fn() },
  organizer: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  sale: { findUnique: jest.fn() },
};
const mockRefresh = jest.fn();
const mockCheckFee = jest.fn();
const mockResolveIsbn = jest.fn();
const mockCoin = jest.fn();
const mockNeverShippable = jest.fn();
const mockEnsureCalculated = jest.fn();
const mockEnsureFlat = jest.fn();
const mockClassify = jest.fn();
const mockFetch = jest.fn();

jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../middleware/auth', () => ({}));
jest.mock('../services/ebayHttp', () => ({
  ebayProxyUrl: (p: string) => p,
  ebayProxyHeaders: () => ({}),
  ebayUserHeaders: () => ({}),
  getEbayAccessToken: async () => 'app-token',
  refreshEbayAccessToken: (...a: any[]) => mockRefresh(...a),
  getEbayNotificationPublicKey: jest.fn(),
}));
jest.mock('../lib/ebayListingFeeCheck', () => ({ checkEbayListingFee: (...a: any[]) => mockCheckFee(...a) }));
jest.mock('../services/ebayLiveListingsService', () => ({
  fetchLiveEbayListings: jest.fn(),
  itemIdFromFasSku: jest.fn(),
  lookupOfferIdForSku: jest.fn(),
}));
jest.mock('../lib/ebayInsertionsQuotaTracker', () => ({ recordFreeEbayInsertion: jest.fn() }));
jest.mock('../services/ebayPublishService', () => ({
  getAcceptedConditionsForCategory: jest.fn(),
  ensureConditionValidForCategory: jest.fn(),
  getRequiredAspectsForCategory: jest.fn(),
  resolveCoinConditionOverride: (...a: any[]) => mockCoin(...a),
  ebayPublishWithSelfHeal: jest.fn(),
  toConditionDescriptorPayload: jest.fn(),
}));
jest.mock('../services/productEnrichment', () => ({ resolveBookIsbn: (...a: any[]) => mockResolveIsbn(...a) }));
jest.mock('../utils/cloudinaryWatermark', () => ({
  getWatermarkedUrl: (u: string) => u,
  getWatermarkedUrlWithQR: (u: string) => u,
  ensureQrCodeAsset: jest.fn(),
}));
jest.mock('../utils/watermarkPolicy', () => ({ canRemoveWatermark: () => false }));
jest.mock('../utils/ebayShippingClassifier', () => ({ classifyEbayShipping: (...a: any[]) => mockClassify(...a) }));
jest.mock('../lib/socket', () => ({ getIO: jest.fn() }));
jest.mock('../lib/ebayRateLimiter', () => ({
  isEbayRateLimited: () => false,
  trackEbayCall: jest.fn(),
  getEbayRateLimitStatus: () => ({ callCount: 0, limit: 5000 }),
}));
jest.mock('../lib/aiCostTracker', () => ({
  canCallEbayPriceComps: async () => true,
  trackEbayPriceComps: async () => undefined,
}));
jest.mock('../utils/ebayPolicyParser', () => ({ parseWeightTiers: jest.fn(), classifyPolicy: jest.fn() }));
jest.mock('../config/ebayCategories', () => ({ domainToL1: jest.fn() }));
jest.mock('../services/ebayCalculatedPolicyService', () => ({
  ensureCalculatedFulfillmentPolicy: (...a: any[]) => mockEnsureCalculated(...a),
  ensureCalculatedPolicyWithHandling: (...a: any[]) => mockEnsureCalculated(...a),
}));
jest.mock('../services/ebayFlatRatePolicyService', () => ({ ensureFvfFlatRatePolicy: (...a: any[]) => mockEnsureFlat(...a) }));
jest.mock('../services/ebayRateEstimateService', () => ({
  computeCheapestForOrigin: jest.fn(),
  classifyPackageSurchargeTrigger: jest.fn(),
  USPS_RATE_EFFECTIVE_DATE: 'x',
  UPS_RATE_EFFECTIVE_DATE: 'x',
  FEDEX_RATE_EFFECTIVE_DATE: 'x',
  ShippingHardBlockError: class ShippingHardBlockError extends Error {},
  EBAY_STANDARD_ENVELOPE_MAX_WEIGHT_OZ: 3,
  EBAY_STANDARD_ENVELOPE_MAX_PRICE_USD: 20,
}));
jest.mock('../services/ebayShippingResolver', () => ({ resolveItemShipping: jest.fn() }));
jest.mock('../services/ebayNetProceedsService', () => ({ computeNetProceeds: jest.fn(), suggestPriceForMargin: jest.fn() }));
jest.mock('../services/ebayPackageEstimateService', () => ({
  estimatePackageProfile: jest.fn(),
  isNeverShippableItem: (...a: any[]) => mockNeverShippable(...a),
}));
jest.mock('../services/ebayCatalogLookup', () => ({ modelTokenFrom: () => null }));
jest.mock('../services/ebayStoreSubscriptionService', () => ({ fetchAndCacheEbayStoreSubscription: jest.fn() }));
jest.mock('../utils/csvSafe', () => ({ csvCell: (v: unknown) => String(v) }));

import fs from 'fs';
import path from 'path';
import {
  checkItemEbayFee,
  getComps,
  getEbayPreview,
  setEbayShippingOverride,
} from '../controllers/ebayController';

const USER = 'user_1';
const OTHER_USER = 'user_2';
const ORG = 'org_1';

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headersSent: false };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: unknown) => {
    res.body = b;
    res.headersSent = true;
    return res;
  };
  return res;
}

const organizerRow = (userId: string, id = ORG) => ({
  id,
  userId,
  subscriptionTier: 'PRO',
  lat: null as number | null,
  lng: null as number | null,
});

// Row shape checkItemEbayFee / getComps / getEbayPreview / setEbayShippingOverride load.
const saleItemRow = (ownerUserId = USER, extra: Record<string, unknown> = {}) => ({
  id: 'item_1',
  title: 'Brass desk lamp',
  status: 'AVAILABLE',
  saleId: 'sale_1',
  organizerId: ORG,
  sale: { organizerId: ORG, organizer: organizerRow(ownerUserId) },
  ...extra,
});

const inventoryItemRow = (extra: Record<string, unknown> = {}) => ({
  id: 'item_1',
  title: 'Brass desk lamp',
  status: 'AVAILABLE',
  saleId: null,
  organizerId: ORG,
  sale: null,
  ...extra,
});

// Per-item row pushSaleToEbay loads (fee check path reads a subset of these fields).
const pipelineItem = (extra: Record<string, unknown> = {}) => ({
  id: 'item_1',
  title: 'Brass desk lamp',
  description: '',
  price: 25,
  category: 'Home',
  condition: 'USED',
  conditionGrade: 'B',
  conditionNotes: null,
  photoUrls: [],
  estimatedValue: null,
  aiSuggestedPrice: null,
  tags: [],
  ebayOfferId: 'offer_1',
  ebayListingId: null,
  ebayListedAt: null,
  ebayCategoryId: '1234',
  ebayCategoryName: 'Lamps',
  ebayNeedsReview: false,
  ebayShippingClassification: null,
  packageWeightOz: 16,
  aiPackageWeightOz: null,
  packageLengthIn: 10,
  packageWidthIn: 8,
  packageHeightIn: 6,
  packageType: null,
  packageConfirmedByOrganizer: true,
  aiPackageDimsJson: null,
  aiPackageConfidence: null,
  upc: null,
  ean: null,
  isbn: null,
  mpn: null,
  brand: null,
  ebayEpid: null,
  ebaySubtitle: null,
  ebaySecondaryCategoryId: null,
  allowBestOffer: false,
  bestOfferAutoAcceptAmt: null,
  bestOfferMinimumAmt: null,
  draftStatus: 'PUBLISHED',
  ebayShippingOverride: null,
  ebayFulfillmentPolicyOverrideId: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  costBasis: null,
  roomTag: null,
  stockTotal: 1,
  stockSold: 0,
  qrAssetReady: true,
  card: null,
  ...extra,
});

function arrangeFeeCheck(opts: { item?: any; pipeline?: any; organizer?: any; saleItems?: any[] } = {}) {
  mockPrisma.item.findUnique.mockResolvedValue(opts.item ?? saleItemRow());
  mockPrisma.organizer.findFirst.mockResolvedValue(null);
  mockPrisma.organizer.findUnique.mockResolvedValue(
    opts.organizer ?? {
      ...organizerRow(USER),
      ebayPushesThisMonth: 0,
      ebayPushesResetAt: new Date(),
      ebayConnection: { handlingTimeDays: 3 },
    }
  );
  mockPrisma.sale.findUnique.mockResolvedValue({
    id: 'sale_1',
    organizerId: ORG,
    address: '1 Main St',
    city: 'Paw Paw',
    state: 'MI',
    zip: '49079',
    items: opts.saleItems ?? [opts.pipeline ?? pipelineItem()],
  });
}

const runFeeCheck = async (userId: string | null = USER) => {
  const res = makeRes();
  await checkItemEbayFee({ params: { itemId: 'item_1' }, user: userId ? { id: userId } : undefined } as any, res);
  return res;
};

const writeFetchCalls = () =>
  mockFetch.mock.calls.filter((c: any[]) => {
    const init = c[1];
    return init && init.method && init.method !== 'GET';
  });

beforeEach(() => {
  jest.clearAllMocks();
  for (const model of Object.values(mockPrisma) as any[]) {
    for (const fn of Object.values(model) as any[]) (fn as jest.Mock).mockReset();
  }
  mockRefresh.mockReset().mockResolvedValue('tok');
  mockCheckFee.mockReset().mockResolvedValue({ status: 'free' });
  mockResolveIsbn.mockReset().mockResolvedValue(null);
  mockCoin.mockReset().mockResolvedValue({ status: 'not_applicable' });
  mockNeverShippable.mockReset().mockReturnValue(false);
  mockEnsureCalculated.mockReset();
  mockEnsureFlat.mockReset();
  mockClassify.mockReset().mockReturnValue('SHIPPABLE');
  mockFetch.mockReset();
  (global as any).fetch = mockFetch;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('checkItemEbayFee: ownership (B1)', () => {
  it('401 when unauthenticated', async () => {
    const res = await runFeeCheck(null);
    expect(res.statusCode).toBe(401);
  });

  it('404 when the item does not exist', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(null);
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(404);
  });

  it('403 for a sale item owned by someone else, and the push pipeline never runs', async () => {
    arrangeFeeCheck({ item: saleItemRow(OTHER_USER) });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.sale.findUnique).not.toHaveBeenCalled();
  });

  it('403 for an inventory item owned by someone else (looked up by id AND userId)', async () => {
    arrangeFeeCheck({ item: inventoryItemRow({ organizerId: 'org_other' }) });
    mockPrisma.organizer.findFirst.mockResolvedValue(null);
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.organizer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'org_other', userId: USER } })
    );
    expect(mockPrisma.sale.findUnique).not.toHaveBeenCalled();
  });

  it('inventory owner gets 200 ready:false ITEM_NOT_IN_SALE (no crash, no writes, no eBay call)', async () => {
    arrangeFeeCheck({ item: inventoryItemRow() });
    mockPrisma.organizer.findFirst.mockResolvedValue(organizerRow(USER));
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.reasons).toEqual([
      { code: 'ITEM_NOT_IN_SALE', message: 'Add this item to a sale to see eBay fees' },
    ]);
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('checkItemEbayFee: expected not-ready outcomes answer 200 + reasons', () => {
  it('item that is not AVAILABLE', async () => {
    arrangeFeeCheck({ item: saleItemRow(USER, { status: 'SOLD' }) });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.reasons[0].code).toBe('ITEM_NOT_AVAILABLE');
  });

  it('pipeline answers "No available items to push"', async () => {
    arrangeFeeCheck({ saleItems: [] });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.reasons[0].code).toBe('ITEM_NOT_AVAILABLE');
  });

  it('eBay not connected', async () => {
    arrangeFeeCheck({
      organizer: {
        ...organizerRow(USER),
        ebayPushesThisMonth: 0,
        ebayPushesResetAt: new Date(),
        ebayConnection: null,
      },
    });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.reasons).toEqual([
      { code: 'EBAY_NOT_CONNECTED', message: 'Connect your eBay account to see eBay fees' },
    ]);
  });

  it('unconfirmed package weight', async () => {
    arrangeFeeCheck({ pipeline: pipelineItem({ packageConfirmedByOrganizer: false }) });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.reasons).toEqual([
      { code: 'EBAY_WEIGHT_NOT_CONFIRMED', message: 'Confirm the package weight to see eBay fees' },
    ]);
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('missing package weight', async () => {
    arrangeFeeCheck({ pipeline: pipelineItem({ packageWeightOz: null, packageConfirmedByOrganizer: false }) });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body.reasons[0].code).toBe('EBAY_NO_PACKAGE_WEIGHT');
    expect(res.body.reasons[0].message).toBe('Add a package weight to see eBay fees');
  });

  it('price below the eBay minimum', async () => {
    arrangeFeeCheck({ pipeline: pipelineItem({ price: 0.5 }) });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body.reasons[0].code).toBe('EBAY_PRICE_BELOW_MIN');
  });

  it('card whose condition cannot be resolved (CARD_CONDITION_UNRESOLVED)', async () => {
    mockCoin.mockResolvedValue({ status: 'unresolved', reason: 'no parseable grade' });
    arrangeFeeCheck({
      pipeline: pipelineItem({
        ebayCategoryId: null,
        card: { game: 'POKEMON', productType: 'SINGLE' },
      }),
    });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.reasons[0].code).toBe('CARD_CONDITION_UNRESOLVED');
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('already listed live on eBay: not ready (EBAY_ALREADY_LISTED), no eBay call, no writes', async () => {
    arrangeFeeCheck({ pipeline: pipelineItem({ ebayListingId: '1234567890', ebayOfferId: 'offer_1' }) });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ready: false,
      reasons: [
        {
          code: 'EBAY_ALREADY_LISTED',
          message: 'This item is already listed on eBay. Fees are shown on your eBay listing.',
        },
      ],
    });
    expect(mockCheckFee).not.toHaveBeenCalled();
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(writeFetchCalls()).toHaveLength(0);
  });

  it('no stored eBay offer: reports not ready instead of creating one', async () => {
    arrangeFeeCheck({ pipeline: pipelineItem({ ebayOfferId: null }) });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.reasons[0].code).toBe('EBAY_OFFER_NOT_CREATED');
    expect(mockCheckFee).not.toHaveBeenCalled();
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('checkItemEbayFee: real errors keep their status codes', () => {
  it('SIMPLE tier is still 403', async () => {
    arrangeFeeCheck({
      organizer: {
        ...organizerRow(USER),
        subscriptionTier: 'SIMPLE',
        ebayPushesThisMonth: 0,
        ebayPushesResetAt: new Date(),
        ebayConnection: { handlingTimeDays: 3 },
      },
    });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(403);
    expect(res.body.ready).toBeUndefined();
  });

  it('an unexpected failure while checking is a 500, not a "not ready" 200, with a fixed message', async () => {
    mockCheckFee.mockRejectedValue(new Error('boom secret-detail-123'));
    arrangeFeeCheck();
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.body.message).toBe('Could not check eBay fees right now');
    expect(JSON.stringify(res.body)).not.toContain('boom');
    expect(JSON.stringify(res.body)).not.toContain('secret-detail-123');
  });

  it('the outer catch answers 500 with a fixed message and does not echo the error text', async () => {
    mockPrisma.item.findUnique.mockRejectedValue(new Error('db password=hunter2 detail'));
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to check eBay listing fee' });
    expect(res.body.error).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  it('a monthly push quota refusal is not a 429 for a fee check: 200 ready:false EBAY_TEMPORARILY_UNAVAILABLE', async () => {
    arrangeFeeCheck({
      organizer: {
        ...organizerRow(USER),
        ebayPushesThisMonth: 100000,
        ebayPushesResetAt: new Date(),
        ebayConnection: { handlingTimeDays: 3 },
      },
    });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ready: false,
      reasons: [{ code: 'EBAY_TEMPORARILY_UNAVAILABLE', message: 'eBay is busy right now. Try again in a few minutes.' }],
    });
    expect(mockCheckFee).not.toHaveBeenCalled();
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('checkItemEbayFee: feeCheckOnly is side-effect free (B2)', () => {
  it('success keeps the existing shape, adds ready:true, and writes nothing', async () => {
    mockCheckFee.mockResolvedValue({ status: 'fee', amount: 0.35, currency: 'USD' });
    arrangeFeeCheck();
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ready: true,
      itemId: 'item_1',
      feeCheck: { status: 'fee', amount: 0.35, currency: 'USD' },
    });
    expect(mockCheckFee).toHaveBeenCalledWith('offer_1', 'tok');
    // No Item write of any kind.
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
    // No eBay call from the controller at all (no location, inventory item, offer or policy request).
    expect(mockFetch).not.toHaveBeenCalled();
    expect(writeFetchCalls()).toHaveLength(0);
    expect(mockEnsureCalculated).not.toHaveBeenCalled();
    expect(mockEnsureFlat).not.toHaveBeenCalled();
  });

  it('an unknown fee quote returns a fixed reason, never the raw eBay text', async () => {
    mockCheckFee.mockResolvedValue({
      status: 'unknown',
      reason: 'HTTP 500 \u2014 {"errors":[{"message":"internal token=abc123 detail"}]}',
    });
    arrangeFeeCheck();
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ready: true,
      itemId: 'item_1',
      feeCheck: { status: 'unknown', reason: 'eBay fees could not be confirmed right now' },
    });
    expect(JSON.stringify(res.body)).not.toContain('abc123');
    expect(JSON.stringify(res.body)).not.toContain('HTTP 500');
  });

  it('a never-shippable item is classified in memory only (no ebayShippingOverride write)', async () => {
    mockNeverShippable.mockReturnValue(true);
    arrangeFeeCheck({
      pipeline: pipelineItem({ packageWeightOz: null, packageConfirmedByOrganizer: false, ebayShippingOverride: null }),
    });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('a book without an ISBN looks one up but never saves it', async () => {
    mockResolveIsbn.mockResolvedValue({ isbn: '9780306406157', confidence: 0.9 });
    arrangeFeeCheck({
      pipeline: pipelineItem({ ebayCategoryId: '261186', ebayCategoryName: 'Books', isbn: null }),
    });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(mockResolveIsbn).toHaveBeenCalled();
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('an item with no category stored does not trigger a category cache write', async () => {
    arrangeFeeCheck({ pipeline: pipelineItem({ ebayCategoryId: null, ebayCategoryName: null }) });
    const res = await runFeeCheck();
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('source guard: the merchant location (an eBay create) is only requested outside feeCheckOnly', () => {
    const src = fs.readFileSync(path.join(__dirname, '../controllers/ebayController.ts'), 'utf8');
    const gate = src.search(/if\s*\(\s*!feeCheckOnly\s*\)\s*\{\s*const\s+locationResult\s*=\s*await\s+getOrCreateMerchantLocation/);
    expect(gate).toBeGreaterThan(-1);
    expect(src.split('getOrCreateMerchantLocation(accessToken').length - 1).toBe(1);
  });
});

describe('getComps: ownership (B1) and write guard (B4)', () => {
  const compsPayload = (prices: string[]) => ({
    ok: true,
    status: 200,
    json: async () => ({
      itemSummaries: prices.map((p, i) => ({ title: `Listing ${i}`, price: { value: p }, condition: 'Used', itemWebUrl: 'u' })),
    }),
    text: async () => '',
  });
  // Median of [40,50,60] is 50.
  const arrangeComps = (item: any, title: string) => {
    process.env.EBAY_CLIENT_ID = 'cid';
    process.env.EBAY_CLIENT_SECRET = 'csecret';
    mockPrisma.item.findUnique.mockResolvedValue({ ...item, title });
    mockFetch.mockResolvedValue(compsPayload(['40.00', '50.00', '60.00']));
  };
  const dec = (n: number) => ({ valueOf: () => n, toString: () => String(n) });
  const runComps = async (userId: string | undefined = USER) => {
    const res = makeRes();
    await getComps({ params: { id: 'item_1' }, user: userId ? { id: userId } : undefined } as any, res);
    return res;
  };

  afterAll(() => {
    delete process.env.EBAY_CLIENT_ID;
    delete process.env.EBAY_CLIENT_SECRET;
  });

  it('skips the Item write when the suggested price did not change', async () => {
    arrangeComps(saleItemRow(USER, { aiSuggestedPrice: dec(50), conditionGrade: 'B' }), 'Comps unchanged lamp alpha');
    const res = await runComps();
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(3);
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('skips the Item write when the difference is inside the 0.005 tolerance', async () => {
    arrangeComps(saleItemRow(USER, { aiSuggestedPrice: dec(50.003), conditionGrade: 'B' }), 'Comps tolerance lamp beta');
    await runComps();
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('writes aiSuggestedPrice when it changed, and never touches lastEditedAt', async () => {
    arrangeComps(saleItemRow(USER, { aiSuggestedPrice: dec(49), conditionGrade: 'B' }), 'Comps changed lamp gamma');
    await runComps();
    expect(mockPrisma.item.update).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.item.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'item_1' });
    expect(arg.data).toEqual({ aiSuggestedPrice: 50 });
    expect(Object.keys(arg.data)).not.toContain('lastEditedAt');
  });

  it('writes when there was no stored suggested price', async () => {
    arrangeComps(saleItemRow(USER, { aiSuggestedPrice: null, conditionGrade: 'B' }), 'Comps null lamp delta');
    await runComps();
    expect(mockPrisma.item.update).toHaveBeenCalledTimes(1);
  });

  it('403 for a sale item owned by another organizer, and no eBay call', async () => {
    arrangeComps(saleItemRow(OTHER_USER, { aiSuggestedPrice: null }), 'Comps foreign lamp epsilon');
    const res = await runComps();
    expect(res.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('403 for an inventory item owned by another organizer', async () => {
    arrangeComps(inventoryItemRow({ organizerId: 'org_other', aiSuggestedPrice: null }), 'Comps foreign inv lamp zeta');
    mockPrisma.organizer.findFirst.mockResolvedValue(null);
    const res = await runComps();
    expect(res.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('an inventory owner gets comps (no sale needed)', async () => {
    arrangeComps(inventoryItemRow({ aiSuggestedPrice: dec(50) }), 'Comps inventory lamp eta');
    mockPrisma.organizer.findFirst.mockResolvedValue(organizerRow(USER));
    const res = await runComps();
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(3);
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });
});

describe('getEbayPreview: ownership (B1)', () => {
  const previewRow = (extra: Record<string, unknown> = {}) => ({
    id: 'item_1',
    title: 'Brass desk lamp',
    description: 'A lamp',
    conditionGrade: 'B',
    category: 'Home',
    photoUrls: [],
    aiSuggestedPrice: null,
    estimatedValue: null,
    price: 20,
    tags: [],
    ebayListingId: null,
    ebayCategoryId: '1234',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    costBasis: null,
    roomTag: null,
    card: null,
    saleId: null,
    organizerId: ORG,
    sale: null,
    ...extra,
  });
  const runPreview = async (userId: string | undefined = USER) => {
    const res = makeRes();
    await getEbayPreview({ params: { itemId: 'item_1' }, query: {}, user: userId ? { id: userId } : undefined } as any, res);
    return res;
  };

  it('an inventory owner gets a preview (no sale dereference crash)', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(previewRow());
    mockPrisma.organizer.findFirst.mockResolvedValue(organizerRow(USER));
    mockPrisma.organizer.findUnique.mockResolvedValue({ ...organizerRow(USER) });
    const res = await runPreview();
    expect(res.statusCode).toBe(200);
    expect(res.body.itemId).toBe('item_1');
  });

  it('another organizer is denied for an inventory item', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(previewRow({ organizerId: 'org_other' }));
    mockPrisma.organizer.findFirst.mockResolvedValue(null);
    mockPrisma.organizer.findUnique.mockResolvedValue({ ...organizerRow(USER) });
    const res = await runPreview();
    expect(res.statusCode).toBe(403);
  });

  it('another organizer is denied for a sale item', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      previewRow({ saleId: 'sale_1', sale: { organizerId: ORG, organizer: organizerRow(OTHER_USER) } })
    );
    mockPrisma.organizer.findUnique.mockResolvedValue({ ...organizerRow(USER) });
    const res = await runPreview();
    expect(res.statusCode).toBe(403);
  });
});

describe('setEbayShippingOverride: ownership (B1)', () => {
  const runOverride = async (userId: string | undefined = USER) => {
    const res = makeRes();
    await setEbayShippingOverride(
      { params: { itemId: 'item_1' }, body: { override: 'LOCAL_PICKUP_ONLY' }, user: userId ? { id: userId } : undefined } as any,
      res
    );
    return res;
  };
  const updated = {
    id: 'item_1',
    title: 'Brass desk lamp',
    ebayShippingClassification: null,
    ebayShippingOverride: 'LOCAL_PICKUP_ONLY',
    ebayFulfillmentPolicyOverrideId: null,
    category: 'Home',
    tags: [],
  };

  it('an inventory owner can set the override', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ ...organizerRow(USER) });
    mockPrisma.item.findUnique.mockResolvedValue(inventoryItemRow());
    mockPrisma.organizer.findFirst.mockResolvedValue(organizerRow(USER));
    mockPrisma.item.update.mockResolvedValue(updated);
    const res = await runOverride();
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.item.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.item.update.mock.calls[0][0].data).toEqual({ ebayShippingOverride: 'LOCAL_PICKUP_ONLY' });
  });

  it('another organizer is denied for an inventory item and nothing is written', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ ...organizerRow(USER) });
    mockPrisma.item.findUnique.mockResolvedValue(inventoryItemRow({ organizerId: 'org_other' }));
    mockPrisma.organizer.findFirst.mockResolvedValue(null);
    const res = await runOverride();
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('another organizer is denied for a sale item and nothing is written', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ ...organizerRow(USER) });
    mockPrisma.item.findUnique.mockResolvedValue({
      ...saleItemRow(OTHER_USER),
    });
    const res = await runOverride();
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('the sale owner can still set the override', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ ...organizerRow(USER) });
    mockPrisma.item.findUnique.mockResolvedValue(saleItemRow(USER));
    mockPrisma.item.update.mockResolvedValue(updated);
    const res = await runOverride();
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organizer.findFirst).not.toHaveBeenCalled();
  });
});
