/**
 * POST /api/ebay/shipping-preview, custom-override branch: the response additively carries
 * customPolicyId / customPolicyName / customPolicyDescription. The name lookup is best-effort and
 * reads only the caller's own organizer's eBay fulfillment policies. The existing message and every
 * other field stay unchanged.
 *
 * Everything the controller touches is a jest mock. No network, no database, no eBay call.
 */

const mockPrisma: any = {
  item: { findFirst: jest.fn() },
  organizer: { findUnique: jest.fn() },
};
const mockRefresh = jest.fn();
const mockResolve = jest.fn();
const mockCheapest = jest.fn();
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
jest.mock('../lib/ebayListingFeeCheck', () => ({ checkEbayListingFee: jest.fn() }));
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
  resolveCoinConditionOverride: jest.fn(),
  ebayPublishWithSelfHeal: jest.fn(),
  toConditionDescriptorPayload: jest.fn(),
}));
jest.mock('../services/productEnrichment', () => ({ resolveBookIsbn: jest.fn() }));
jest.mock('../utils/cloudinaryWatermark', () => ({
  getWatermarkedUrl: (u: string) => u,
  getWatermarkedUrlWithQR: (u: string) => u,
  ensureQrCodeAsset: jest.fn(),
}));
jest.mock('../utils/watermarkPolicy', () => ({ canRemoveWatermark: () => false }));
jest.mock('../utils/ebayShippingClassifier', () => ({ classifyEbayShipping: jest.fn() }));
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
  ensureCalculatedFulfillmentPolicy: jest.fn(),
  ensureCalculatedPolicyWithHandling: jest.fn(),
}));
jest.mock('../services/ebayFlatRatePolicyService', () => ({ ensureFvfFlatRatePolicy: jest.fn() }));
jest.mock('../services/ebayRateEstimateService', () => ({
  computeCheapestForOrigin: (...a: any[]) => mockCheapest(...a),
  classifyPackageSurchargeTrigger: jest.fn(),
  USPS_RATE_EFFECTIVE_DATE: 'x',
  UPS_RATE_EFFECTIVE_DATE: 'x',
  FEDEX_RATE_EFFECTIVE_DATE: 'x',
  ShippingHardBlockError: class ShippingHardBlockError extends Error {},
  EBAY_STANDARD_ENVELOPE_MAX_WEIGHT_OZ: 3,
  EBAY_STANDARD_ENVELOPE_MAX_PRICE_USD: 20,
}));
jest.mock('../services/ebayShippingResolver', () => ({ resolveItemShipping: (...a: any[]) => mockResolve(...a) }));
jest.mock('../services/ebayNetProceedsService', () => ({ computeNetProceeds: jest.fn(), suggestPriceForMargin: jest.fn() }));
jest.mock('../services/ebayPackageEstimateService', () => ({
  estimatePackageProfile: jest.fn(),
  isNeverShippableItem: jest.fn(),
}));
jest.mock('../services/ebayCatalogLookup', () => ({ modelTokenFrom: () => null }));
jest.mock('../services/ebayStoreSubscriptionService', () => ({ fetchAndCacheEbayStoreSubscription: jest.fn() }));
jest.mock('../utils/csvSafe', () => ({ csvCell: (v: unknown) => String(v) }));

import { getShippingNetPreview } from '../controllers/ebayController';

const USER = 'user_1';
const ORG = 'org_1';
const CUSTOM_MESSAGE = 'Custom eBay policy selected. Buyer shipping is set by your eBay policy.';

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

const itemRow = (overrideId: string | null) => ({
  price: 25,
  ebayFulfillmentPolicyOverrideId: overrideId,
  packageWeightOz: 16,
  packageLengthIn: 10,
  packageWidthIn: 8,
  packageHeightIn: 6,
  packageType: null,
  ebayCategoryId: '1234',
  ebayShippingClassification: 'SHIPPABLE',
  sale: { zip: '49064' },
});

const policiesResponse = (policies: any[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ fulfillmentPolicies: policies, accessTokenEcho: 'should-never-leak' }),
});

function policyFetchCalls() {
  return mockFetch.mock.calls.filter((c: any[]) => String(c[0]).includes('/sell/account/v1/fulfillment_policy'));
}

async function callPreview(overrideId: string | null) {
  mockPrisma.item.findFirst.mockResolvedValue(itemRow(overrideId));
  mockResolve.mockResolvedValue({
    fulfillmentPolicyId: overrideId,
    buyerAmountCents: 0,
    policyName: null,
    source: 'custom-override',
  });
  const res = makeRes();
  await getShippingNetPreview({ user: { id: USER }, body: { itemId: 'item_1' } } as any, res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  (global as any).fetch = mockFetch;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: ORG, userId: USER, lat: null, lng: null, ebayPolicyMapping: null });
  mockRefresh.mockResolvedValue('user-access-token');
  mockCheapest.mockResolvedValue({ rate: 7.5, carrier: 'USPS', basis: 'actual', surcharge: 0, surchargeType: null });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('shipping preview, custom-override branch: policy name', () => {
  it('resolves the name and description from the organizer own policy list', async () => {
    mockFetch.mockResolvedValue(
      policiesResponse([
        { fulfillmentPolicyId: 'pol_other', name: 'Something else', description: 'nope' },
        { fulfillmentPolicyId: 'pol_1', name: 'Guitar freight', description: 'Freight for guitars', categoryTypes: [] },
      ])
    );
    const res = await callPreview('pol_1');
    expect(res.statusCode).toBe(200);
    expect(res.body.customPolicy).toBe(true);
    expect(res.body.customPolicyId).toBe('pol_1');
    expect(res.body.customPolicyName).toBe('Guitar freight');
    expect(res.body.customPolicyDescription).toBe('Freight for guitars');
    expect(res.body.message).toBe(CUSTOM_MESSAGE);
    expect(mockRefresh).toHaveBeenCalledWith(ORG);
    // No tokens or raw eBay payload in the response.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('user-access-token');
    expect(serialized).not.toContain('should-never-leak');
    expect(serialized).not.toContain('categoryTypes');
  });

  it('keeps every other existing field unchanged', async () => {
    mockFetch.mockResolvedValue(policiesResponse([{ fulfillmentPolicyId: 'pol_1', name: 'Guitar freight' }]));
    const res = await callPreview('pol_1');
    expect(res.body).toMatchObject({
      buyerShipping: null,
      net: null,
      breakdown: null,
      flatPolicy: null,
      customPolicy: true,
      message: CUSTOM_MESSAGE,
      customPolicyDescription: null,
      shippingEstimate: { rate: 7.5, source: 'custom_policy', netToSeller: null, labelCost: 7.5 },
    });
  });

  it('fetcher failure yields a null name and the response is still 200 with the message', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    const res = await callPreview('pol_1');
    expect(res.statusCode).toBe(200);
    expect(res.body.customPolicy).toBe(true);
    expect(res.body.customPolicyId).toBe('pol_1');
    expect(res.body.customPolicyName).toBeNull();
    expect(res.body.customPolicyDescription).toBeNull();
    expect(res.body.message).toBe(CUSTOM_MESSAGE);
  });

  it('a non-200 from eBay and a missing token also yield a null name', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    let res = await callPreview('pol_1');
    expect(res.statusCode).toBe(200);
    expect(res.body.customPolicyName).toBeNull();

    mockFetch.mockReset();
    mockRefresh.mockResolvedValue(null);
    res = await callPreview('pol_1');
    expect(res.statusCode).toBe(200);
    expect(res.body.customPolicyName).toBeNull();
    expect(policyFetchCalls()).toHaveLength(0);
  });

  it('a hung policy fetch times out to a null name instead of blocking the preview', async () => {
    jest.useFakeTimers();
    try {
      mockFetch.mockReturnValue(new Promise(() => undefined));
      const pending = callPreview('pol_1');
      await jest.advanceTimersByTimeAsync(3500);
      const res = await pending;
      expect(res.statusCode).toBe(200);
      expect(res.body.customPolicyName).toBeNull();
      expect(res.body.message).toBe(CUSTOM_MESSAGE);
    } finally {
      jest.useRealTimers();
    }
  });

  it('no override id on the item means no lookup and all three fields null', async () => {
    const res = await callPreview(null);
    expect(res.statusCode).toBe(200);
    expect(res.body.customPolicy).toBe(true);
    expect(res.body.customPolicyId).toBeNull();
    expect(res.body.customPolicyName).toBeNull();
    expect(res.body.customPolicyDescription).toBeNull();
    expect(res.body.message).toBe(CUSTOM_MESSAGE);
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('a policy id that is not in this organizer own list is not found and yields null', async () => {
    // The list is fetched with the caller organizer id only; another organizer's policy id is absent.
    mockFetch.mockResolvedValue(
      policiesResponse([{ fulfillmentPolicyId: 'pol_mine', name: 'My policy', description: 'mine' }])
    );
    const res = await callPreview('pol_of_other_organizer');
    expect(res.statusCode).toBe(200);
    expect(res.body.customPolicyId).toBe('pol_of_other_organizer');
    expect(res.body.customPolicyName).toBeNull();
    expect(res.body.customPolicyDescription).toBeNull();
    expect(res.body.message).toBe(CUSTOM_MESSAGE);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledWith(ORG);
    expect(mockPrisma.item.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'item_1', sale: { organizerId: ORG } } })
    );
  });
});
