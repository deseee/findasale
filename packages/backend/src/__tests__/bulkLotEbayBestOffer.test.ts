/**
 * 2026-10-29: the bulk lot reprice (bulkLotEbayWiring.ts reviseOnEbay) uses bulkUpdatePriceQuantity, which cannot
 * carry Best Offer thresholds. When a lot's new price drops to or below the offer's existing auto-accept or
 * auto-decline amount, the offer is first updated (updateOffer PUT) with thresholds made valid for the new price
 * (sanitizeOfferBestOfferTerms). Offers whose thresholds are still valid get no extra call.
 */

const mockPrisma = {
  item: { findUnique: jest.fn(), update: jest.fn() },
  sale: { findUnique: jest.fn() },
  organizer: { findUnique: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

let mockRateLimited = false;
const mockTrack = jest.fn();
jest.mock('../lib/ebayRateLimiter', () => ({
  isEbayRateLimited: () => mockRateLimited,
  trackEbayCall: () => mockTrack(),
}));
jest.mock('../services/ebayHttp', () => ({
  ebayProxyHeaders: () => ({}),
  ebayProxyUrl: (p: string) => 'https://ebay.test/' + decodeURIComponent(p),
  ebayUserHeaders: (t: string) => ({ Authorization: 'Bearer ' + t }),
  refreshEbayAccessToken: jest.fn(async () => 'tok'),
}));
jest.mock('../controllers/ebayController', () => ({
  buildCustomLabel: () => 'SKU-1',
  endEbayListingIfExists: jest.fn(),
  pushItemsToEbayLive: jest.fn(),
}));

import { realBundleOps, buildBulkLotBestOfferRepairOffer } from '../services/bulkLot/bulkLotEbayWiring';

type Call = { url: string; method: string; body: any };

function liveOffer(accept: string | null, decline: string | null, price = '100.00'): Record<string, any> {
  return {
    offerId: 'OFF1',
    sku: 'SKU-1',
    status: 'PUBLISHED',
    marketplaceId: 'EBAY_US',
    listing: { listingId: '123' },
    format: 'FIXED_PRICE',
    availableQuantity: 5,
    categoryId: '183454',
    listingPolicies: { fulfillmentPolicyId: 'F1' },
    pricingSummary: { price: { currency: 'USD', value: price } },
    bestOfferTerms: {
      bestOfferEnabled: true,
      ...(accept ? { autoAcceptPrice: { currency: 'USD', value: accept } } : {}),
      ...(decline ? { autoDeclinePrice: { currency: 'USD', value: decline } } : {}),
    },
  };
}

function setupFetch(offer: Record<string, any>, opts: { putStatus?: number; putBody?: string } = {}): Call[] {
  const calls: Call[] = [];
  (global as any).fetch = jest.fn(async (url: string, init: any = {}) => {
    const method = init.method || 'GET';
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : undefined });
    const res = (status: number, body: string) => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });
    if (method === 'GET') return res(200, JSON.stringify(offer));
    if (method === 'PUT') return res(opts.putStatus ?? 204, opts.putBody ?? '');
    return res(200, JSON.stringify({ responses: [{ statusCode: 200, sku: 'SKU-1', offers: [{ offerId: 'OFF1', statusCode: 200 }] }] }));
  });
  return calls;
}

beforeEach(() => {
  mockRateLimited = false;
  mockTrack.mockClear();
  mockPrisma.item.findUnique.mockResolvedValue({ ebayOfferId: 'OFF1', saleId: null, organizerId: 'org1', createdAt: new Date(), costBasis: null, roomTag: null });
  mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', skuAppendDate: false, skuAppendCost: false, skuAppendLocation: false, ebayConnection: { organizerId: 'org1' } });
  mockPrisma.item.update.mockReset();
  mockPrisma.item.update.mockResolvedValue({});
});

describe('buildBulkLotBestOfferRepairOffer (pure)', () => {
  it('returns null when the stored thresholds are valid for the new price', () => {
    expect(buildBulkLotBestOfferRepairOffer(liveOffer('80.00', '60.00'), 90, 3)).toBeNull();
    expect(buildBulkLotBestOfferRepairOffer(liveOffer(null, null), 10, 3)).toBeNull();
    const noTerms = liveOffer('80.00', '60.00');
    delete noTerms.bestOfferTerms;
    expect(buildBulkLotBestOfferRepairOffer(noTerms, 10, 3)).toBeNull();
  });

  it('auto-accept at the new price: replaces both thresholds, sets price and quantity, strips read-only fields', () => {
    const offer = liveOffer('80.00', '60.00');
    const body = buildBulkLotBestOfferRepairOffer(offer, 80, 4)!;
    expect(body).not.toBeNull();
    expect(body.pricingSummary).toEqual({ price: { currency: 'USD', value: '80.00' } });
    expect(body.availableQuantity).toBe(4);
    expect(body.bestOfferTerms).toEqual({
      bestOfferEnabled: true,
      autoAcceptPrice: { value: '72.00', currency: 'USD' },
      autoDeclinePrice: { value: '54.00', currency: 'USD' },
    });
    for (const ro of ['offerId', 'status', 'listing', 'marketplaceId']) expect(body).not.toHaveProperty(ro);
    expect(body.sku).toBe('SKU-1');
    expect(body.categoryId).toBe('183454');
    // The GET object itself is untouched.
    expect(offer.bestOfferTerms.autoAcceptPrice.value).toBe('80.00');
    expect(offer.status).toBe('PUBLISHED');
  });

  it('auto-decline above the new price (no auto-accept) is repaired too', () => {
    const body = buildBulkLotBestOfferRepairOffer(liveOffer(null, '50.00'), 40, 1)!;
    expect(body.bestOfferTerms.autoAcceptPrice.value).toBe('36.00');
    expect(body.bestOfferTerms.autoDeclinePrice.value).toBe('27.00');
  });

  it('at a price too low for any safe pair, drops the thresholds and keeps Best Offer on', () => {
    const body = buildBulkLotBestOfferRepairOffer(liveOffer('5.00', '3.00'), 0.9, 1)!;
    expect(body.bestOfferTerms).toEqual({ bestOfferEnabled: true });
  });
});

describe('realBundleOps.revise (bulk lot reprice)', () => {
  it('valid thresholds: GET then bulk update only, no extra call', async () => {
    const calls = setupFetch(liveOffer('80.00', '60.00'));
    const r = await realBundleOps.revise({ itemId: 'lot1', quantity: 3, priceCents: 9000 });
    expect(r).toEqual({ ok: true });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST']);
    expect(calls[1].url).toContain('bulk_update_price_quantity');
    expect(calls[1].body.requests[0].offers[0].price.value).toBe('90.00');
  });

  it('price drops to the auto-accept: PUTs the offer with safe thresholds before the bulk update', async () => {
    const calls = setupFetch(liveOffer('80.00', '60.00'));
    const r = await realBundleOps.revise({ itemId: 'lot1', quantity: 2, priceCents: 7500 });
    expect(r).toEqual({ ok: true });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT', 'POST']);
    const put = calls[1];
    expect(put.url).toBe('https://ebay.test//sell/inventory/v1/offer/OFF1');
    expect(put.body.pricingSummary.price.value).toBe('75.00');
    expect(put.body.availableQuantity).toBe(2);
    expect(put.body.bestOfferTerms.autoAcceptPrice.value).toBe('67.50');
    expect(put.body.bestOfferTerms.autoDeclinePrice.value).toBe('50.63');
    expect(put.body).not.toHaveProperty('offerId');
    expect(put.body).not.toHaveProperty('status');
    expect(calls[2].body.requests[0].offers[0].price.value).toBe('75.00');
    expect(mockTrack).toHaveBeenCalledTimes(3);
    expect(mockPrisma.item.update).toHaveBeenCalledWith({ where: { id: 'lot1' }, data: { ebayQuantityAvailable: 2 } });
  });

  it('a failed offer PUT stops before the bulk update and reports it', async () => {
    const calls = setupFetch(liveOffer('80.00', '60.00'), { putStatus: 400, putBody: JSON.stringify({ errors: [{ longMessage: 'Bad offer' }] }) });
    const r = await realBundleOps.revise({ itemId: 'lot1', quantity: 2, priceCents: 7000 });
    expect(r).toEqual({ ok: false, code: 'BEST_OFFER_UPDATE_FAILED', message: 'Bad offer' });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT']);
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it('rate limited after the GET: no PUT and no bulk update, answers RATE_LIMITED so it is retried', async () => {
    const calls = setupFetch(liveOffer('80.00', '60.00'));
    mockTrack.mockImplementation(() => {
      mockRateLimited = true; // the GET used the last call of the day
    });
    const r = await realBundleOps.revise({ itemId: 'lot1', quantity: 2, priceCents: 7000 });
    mockTrack.mockReset();
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe('RATE_LIMITED');
    expect(calls.map((c) => c.method)).toEqual(['GET']);
  });

  it('an unpublished offer is still NOT_LIVE and is never PUT', async () => {
    const offer = liveOffer('80.00', '60.00');
    offer.status = 'UNPUBLISHED';
    const calls = setupFetch(offer);
    const r = await realBundleOps.revise({ itemId: 'lot1', quantity: 2, priceCents: 7000 });
    expect((r as any).code).toBe('NOT_LIVE');
    expect(calls.map((c) => c.method)).toEqual(['GET']);
  });
});
