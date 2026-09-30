/**
 * itemController (2026-09-29): two small changes.
 *
 * 1. buildHoldFieldsForViewer used to return the invoice's real total and item count only for a
 *    BUNDLED invoice (more than one item), so a single-item invoice carrying the Crew Invasion
 *    discount showed the list price on the item page. It now returns them for every invoice.
 * 2. analyzeItemTags fetched the stored photoUrls[0] with no host check and followed redirects. It now
 *    refuses anything isSafeFetchUrl rejects (no fetch, no vision, the normal empty-tags fallback) and
 *    spreads SAFE_FETCH_AXIOS_OPTIONS (redirects off) into the request.
 *
 * itemController has dozens of imports; only the ones it touches here get real behaviour, the rest are
 * empty mocks registered before the controller is required.
 */

const mockPrisma: any = { item: { findUnique: jest.fn() } };
const mockAxiosGet = jest.fn();
const mockAnalyze = jest.fn();
const mockRetrieveSession = jest.fn();
const mockIncrement = jest.fn();

jest.mock('../index', () => ({ prisma: mockPrisma }));
jest.mock('axios', () => ({ __esModule: true, default: { get: (...a: unknown[]) => mockAxiosGet(...a) } }));
jest.mock('../services/cloudAIService', () => ({
  analyzeItemImage: (...a: unknown[]) => mockAnalyze(...a),
  isCloudAIAvailable: () => true,
}));
jest.mock('../lib/aiTagsQuotaTracker', () => ({
  checkAiTagQuota: jest.fn().mockResolvedValue({ exceeded: false, used: 0, limit: 100, remaining: 100 }),
  incrementAiTagCount: (...a: unknown[]) => mockIncrement(...a),
}));
jest.mock('../utils/expireCheckoutSession', () => ({
  retrieveCheckoutSessionAcrossAccounts: (...a: unknown[]) => mockRetrieveSession(...a),
}));
[
  'csv-parse', '../middleware/auth', '../utils/markdownSticker', '../utils/cloudinaryWatermark', 'cloudinary',
  '../services/ebayRateEstimateService', 'form-data', '../lib/socket', '../services/webhookService',
  '../services/marketplace/autoFanoutDispatcher', '../services/priceDropService', '../services/liveFeedService',
  '../helpers/itemQueries', '../services/publicItemIndexService', '../utils/listingHealthScore',
  '../services/commandCenterService', '../utils/ebayShippingClassifier', '../lib/tierEnforcement',
  '../utils/getClientIp', '../services/notificationService', '../services/auctionService', '../lib/placesService',
  '../controllers/uploadController', '../utils/highValueFlagging', '../services/xpService', '../utils/rankUtils',
  '../jobs/fetchEbayComps', '../services/marketplace/marketplacePosterService', '../controllers/ebayController',
  '../services/descriptionMerger', '../services/achievementService', '../services/facebookNudgeService',
  '../services/saleAlertEmailService', '../services/ebayPublishService', '../services/checkoutGuard',
  '../services/itemSaleGuard', '../services/shopifyService', '../services/marketplace/discogsListingConnector',
  '../services/marketplace/reverbConnector', '../services/nativeShippingSuggestionService',
  '../services/shippingLabelService', '../services/itemChannelStatusService', '../utils/actingOrganizer',
  '../services/itemCsvImport',
].forEach((p) => jest.mock(p, () => ({})));

// Required AFTER the mocks above (imports are hoisted, so a plain import would load the real modules first).
const { buildHoldFieldsForViewer, analyzeItemTags } = require('../controllers/itemController');

const inHour = () => new Date(Date.now() + 60 * 60 * 1000);

describe('buildHoldFieldsForViewer: invoice total for the holding shopper', () => {
  const reservation = (invoiceOver: any = {}, over: any = {}) => ({
    id: 'res_1',
    status: 'INVOICE_ISSUED',
    expiresAt: inHour(),
    userId: 'u1',
    user: { name: 'Sam', email: 's@example.com' },
    invoice: {
      expiresAt: inHour(),
      stripeSessionId: 'cs_1',
      stripeAccountId: null,
      status: 'PENDING',
      totalAmount: 1350, // $15.00 item less the 10% crew discount
      itemIds: ['i1'],
      ...invoiceOver,
    },
    ...over,
  });
  const holder = { isOwnerOrAdmin: false, viewerUserId: 'u1' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRetrieveSession.mockResolvedValue({ url: 'https://pay.example/cs_1' });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns the real (discounted) total for a SINGLE-item invoice', async () => {
    const out: any = await buildHoldFieldsForViewer(reservation(), holder);
    expect(out.invoiceTotalAmount).toBe(13.5);
    expect(out.invoiceItemCount).toBe(1);
    expect(out.invoiceCheckoutUrl).toBe('https://pay.example/cs_1');
    expect(out.reservedBy).toBe('u1');
  });

  it('still returns total and count for a bundled invoice', async () => {
    const out: any = await buildHoldFieldsForViewer(reservation({ itemIds: ['i1', 'i2'], totalAmount: 3000 }), holder);
    expect(out.invoiceTotalAmount).toBe(30);
    expect(out.invoiceItemCount).toBe(2);
  });

  it('total is null and count 1 when the hold has no invoice yet', async () => {
    const out: any = await buildHoldFieldsForViewer(reservation({}, { invoice: null }), holder);
    expect(out.invoiceTotalAmount).toBeNull();
    expect(out.invoiceItemCount).toBe(1);
  });

  it('exposes nothing to another shopper or an anonymous visitor', async () => {
    expect(await buildHoldFieldsForViewer(reservation(), { isOwnerOrAdmin: false, viewerUserId: 'someone-else' })).toEqual({});
    expect(await buildHoldFieldsForViewer(reservation(), { isOwnerOrAdmin: false })).toEqual({});
  });

  it('a settled or cancelled hold exposes nothing to anyone', async () => {
    expect(await buildHoldFieldsForViewer(reservation({}, { status: 'COMPLETED' }), holder)).toEqual({});
    expect(await buildHoldFieldsForViewer(null, holder)).toEqual({});
  });

  it('the organizer still gets the owner view (holder identity), not the shopper totals', async () => {
    const out: any = await buildHoldFieldsForViewer(reservation(), { isOwnerOrAdmin: true });
    expect(out.reservationId).toBe('res_1');
    expect(out.reservedByEmail).toBe('s@example.com');
    expect(out.invoiceTotalAmount).toBeUndefined();
  });
});

describe('analyzeItemTags: SSRF guard on the stored photo URL', () => {
  const mkRes = () => {
    const res: any = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  };
  const req = () => ({ user: { id: 'ou1', roles: ['ORGANIZER'] }, params: { id: 'item_1' } } as any);
  const itemWith = (photoUrl: string) => ({
    id: 'item_1',
    photoUrls: [photoUrl],
    tags: [],
    userEditedFields: [],
    sale: { sourceName: null, organizer: { isUnmanagedListing: false, userId: 'ou1', id: 'org_1', subscriptionTier: 'PRO' } },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosGet.mockResolvedValue({ data: Buffer.from('img') });
    mockAnalyze.mockResolvedValue({ tags: ['lamp', 'brass'] });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it.each([
    'http://res.cloudinary.com/demo/image/upload/a.jpg', // not https
    'https://169.254.169.254/latest/meta-data/', // cloud metadata IP literal
    'https://internal.example.com/a.jpg', // host not on the allowlist
    'https://res.cloudinary.com:8443/demo/a.jpg', // non-443 port
    'https://user:pw@res.cloudinary.com/demo/a.jpg', // credentials in the URL
  ])('refuses %s: no fetch, no vision, graceful empty fallback', async (url: string) => {
    mockPrisma.item.findUnique.mockResolvedValue(itemWith(url));
    const res = mkRes();
    await analyzeItemTags(req(), res);
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(mockIncrement).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ suggestedTags: [] });
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it('fetches an allowed Cloudinary URL with redirects disabled, then analyzes it', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(itemWith('https://res.cloudinary.com/demo/image/upload/v1/a.jpg'));
    const res = mkRes();
    await analyzeItemTags(req(), res);
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
    const [url, opts] = mockAxiosGet.mock.calls[0];
    expect(url).toBe('https://res.cloudinary.com/demo/image/upload/v1/a.jpg');
    expect(opts.maxRedirects).toBe(0);
    expect(opts.responseType).toBe('arraybuffer');
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
    expect(mockIncrement).toHaveBeenCalledWith('org_1', 2);
    expect(res.json).toHaveBeenCalledWith({ suggestedTags: ['lamp', 'brass'] });
  });

  it('a redirect response from an allowed host (axios rejects at maxRedirects 0) falls back to empty tags', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(itemWith('https://res.cloudinary.com/demo/image/upload/v1/a.jpg'));
    mockAxiosGet.mockRejectedValue(new Error('Maximum number of redirects exceeded'));
    const res = mkRes();
    await analyzeItemTags(req(), res);
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ suggestedTags: [] });
  });
});
