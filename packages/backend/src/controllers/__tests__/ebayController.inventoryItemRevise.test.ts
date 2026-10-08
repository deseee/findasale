jest.mock('sanitize-html', () => ({ __esModule: true, default: (x: string) => x }), { virtual: true });
jest.mock('express', () => ({ __esModule: true, default: {}, Router: () => ({}) }), { virtual: true });
jest.mock('../../middleware/auth', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../services/bulkLot/bulkLotConfig', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../services/bulkLot/bulkLotService', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../services/bulkLot/bulkLotEbayConfig', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../services/bulkLot/bulkLotEbayPushAdapter', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../lib/ebayListingFeeCheck', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../utils/ebayConditionImport', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../utils/ebayEnrichPlan', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../utils/conditionMapping', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../services/ebayLiveListingsService', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../lib/ebayInsertionsQuotaTracker', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../services/ebayPublishService', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../config/cardEbayCategories', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../services/ebayCardAspects', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../services/productEnrichment', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../utils/cloudinaryWatermark', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../utils/watermarkPolicy', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../utils/ebayShippingClassifier', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../lib/socket', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../lib/aiCostTracker', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../constants/tierLimits', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../config/ebayCategories', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../services/ebayNetProceedsService', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../services/ebayPackageEstimateService', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../services/ebayCatalogLookup', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../services/ebayStoreSubscriptionService', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../utils/csvSafe', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
jest.mock('../../utils/itemOwner', () => new Proxy({}, { get: (_t, k) => k === '__esModule' ? false : jest.fn() }));
const mockItem: any = {
  id: 'cmuq9frvzag7flabnn9', ebayListingId: '136593712980', ebayOfferId: null, ebayFulfillmentPolicyId: null,
  ebayShippingAmountCents: null, packageWeightOz: 8, packageLengthIn: 11, packageWidthIn: 8, packageHeightIn: 1,
  packageType: 'PACKAGE_THICK_ENVELOPE', packageConfirmedByOrganizer: true, ebayShippingClassification: 'UNKNOWN',
  ebayCategoryId: null, category: 'Comics', ebayShippingOverride: null, ebayFulfillmentPolicyOverrideId: null, price: 7.49,
  sale: { zip: '49079', organizer: { id: 'org1', lat: 42.2, lng: -85.8, ebayPolicyMapping: { shippingMode: 'FLAT_TIERS', unknownPolicyId: 'LOCALPICKUP' } } },
};
const prismaMock: any = {
  item: { findUnique: jest.fn(async () => mockItem), update: jest.fn(async () => ({})) },
  organizer: { findUnique: jest.fn(async () => ({ id: 'org1', lat: 42.2, lng: -85.8, ebayDefaultShippingPolicyId: null, ebayConnection: { returnPolicyId: 'R', paymentPolicyId: 'P', accessToken: 't' }, ebayPolicyMapping: { shippingMode: 'FLAT_TIERS', unknownPolicyId: 'LOCALPICKUP', defaultReturnPolicyId: 'R', defaultPaymentPolicyId: 'P' } })) },
};
jest.mock('../../lib/prisma', () => ({ prisma: prismaMock, Prisma: {} }));
jest.mock('../../index', () => ({ prisma: prismaMock }));
jest.mock('../../services/ebayHttp', () => ({ ebayProxyUrl: (s: string) => s, ebayProxyHeaders: () => ({}), ebayUserHeaders: () => ({}), getEbayAccessToken: jest.fn(), refreshEbayAccessToken: jest.fn(async () => 'tok'), getEbayNotificationPublicKey: jest.fn() }));
jest.mock('../../services/ebayFlatRatePolicyService', () => ({ ensureFvfFlatRatePolicy: jest.fn(async () => ({ policyId: 'FLAT', flatRate: 9.99 })) , computeFvfFlatRate: (r:number)=>r, roundUpToBucket:(r:number)=>r, applyCharmPricing:(r:number)=>r, zone9TierForPackage:()=>'T1', buildFlatPolicyName:()=>'n', priceBasisFromCheapest:()=>null }));
jest.mock('../../services/ebayCalculatedPolicyService', () => ({ ensureCalculatedFulfillmentPolicy: jest.fn(), ensureCalculatedPolicyWithHandling: jest.fn(), computeCalculatedWithHandling: (r:number)=>({bucketedRate:r,handlingCost:1}) }));
import { reviseNativeListingShippingPolicy } from '../ebayController';
/**
 * Regression (2026-10-08): inventory-only eBay listings (Item.saleId NULL, owner = Item.organizerId)
 * were silently skipped with reason 'no-organizer' by reviseNativeListingShippingPolicy because it
 * only read item.sale?.organizer. They must resolve through Item.organizerId and re-pin.
 */
describe('reviseNativeListingShippingPolicy -- inventory item without a sale', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ fulfillmentPolicies: [] }), text: async () => '<Ack>Success</Ack>' }));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    prismaMock.item.update.mockClear();
    prismaMock.organizer.findUnique.mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  it('re-pins an inventory item (saleId null) via Item.organizerId', async () => {
    Object.assign(mockItem, { saleId: null, organizerId: 'org1', sale: null });
    const r = await reviseNativeListingShippingPolicy('cmuq9frvzag7flabnn9');
    expect(r).toEqual({ changed: true, reason: 'repinned' });
    expect(prismaMock.item.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ebayFulfillmentPolicyId: 'FLAT' }) }));
  });

  it('still returns no-organizer when there is neither a sale organizer nor Item.organizerId', async () => {
    Object.assign(mockItem, { saleId: null, organizerId: null, sale: null });
    const r = await reviseNativeListingShippingPolicy('cmuq9frvzag7flabnn9');
    expect(r).toEqual({ changed: false, reason: 'no-organizer' });
  });

  it('does not guess an owner for a sale item whose sale organizer failed to load', async () => {
    Object.assign(mockItem, { saleId: 'sale1', organizerId: 'org1', sale: null });
    const r = await reviseNativeListingShippingPolicy('cmuq9frvzag7flabnn9');
    expect(r).toEqual({ changed: false, reason: 'no-organizer' });
  });
});
