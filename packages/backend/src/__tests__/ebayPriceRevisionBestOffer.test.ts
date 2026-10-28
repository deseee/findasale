/**
 * reviseEbayOfferPrice and Best Offer thresholds (2026-10-28). The offer GET echoes the
 * listing's existing thresholds; a markdown can leave them at or above the new price. The
 * first PUT must already carry valid thresholds, and the original repair retry must still
 * run (with the same safe pair) if eBay rejects for a threshold reason anyway.
 *
 * No network, no database: eBay calls go through a mocked ebayFetch.
 */

const mockEbayFetch = jest.fn();

jest.mock('../lib/prisma', () => ({ prisma: { item: { findUnique: jest.fn(async () => null) }, itemBulkLot: { findMany: jest.fn(async () => []) } } }));
jest.mock('../services/ebayHttp', () => ({ ebayProxyUrl: (p: string) => p, ebayProxyHeaders: () => ({}) }));
jest.mock('../lib/ebayRateLimiter', () => ({ isEbayRateLimited: () => false, trackEbayCall: () => undefined }));
jest.mock('../services/reanalyzeService', () => ({ reanalyzeItem: jest.fn() }));
jest.mock('../services/bulkLot/bulkLotService', () => ({ findBulkLotItemIds: jest.fn(async () => new Set()) }));
jest.mock('../services/bulkLot/bulkLotConfig', () => ({ isBulkLotsEnabled: () => false }));
jest.mock('../services/ebayPublishService', () => ({
  ebayFetch: (...a: unknown[]) => mockEbayFetch(...a),
  getRequiredAspectsForCategory: jest.fn(),
  parseMissingRequiredAspectNames: jest.fn(),
  pickSafeAspectDefault: jest.fn(),
  resolveCoinConditionOverride: jest.fn(),
  toConditionDescriptorPayload: jest.fn(),
  buildTradingConditionDescriptorsXml: jest.fn(),
}));

import { reviseEbayOfferPrice } from '../services/ebayPriceRevisionService';

const offerWith = (bestOfferTerms?: Record<string, unknown>) => ({
  offerId: 'offer_1',
  sku: 'FAS-item_1',
  status: 'PUBLISHED',
  pricingSummary: { price: { value: '35.00', currency: 'USD' } },
  packageWeightAndSize: { weight: { value: 16, unit: 'OUNCE' } },
  ...(bestOfferTerms ? { bestOfferTerms } : {}),
});

const res = (ok: boolean, status: number, body: unknown = {}) => ({
  ok,
  status,
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

const puts = () => mockEbayFetch.mock.calls.filter((c: any[]) => c[2]?.method === 'PUT').map((c: any[]) => c[2].body);

beforeEach(() => {
  mockEbayFetch.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('reviseEbayOfferPrice: Best Offer thresholds', () => {
  it('first PUT already carries the safe pair when the echoed thresholds sit above the new price', async () => {
    mockEbayFetch.mockImplementation(async (_p: string, _t: string, init: any) =>
      init?.method === 'PUT'
        ? res(true, 204)
        : res(true, 200, offerWith({ bestOfferEnabled: true, autoAcceptPrice: { value: '30.00', currency: 'USD' }, autoDeclinePrice: { value: '26.00', currency: 'USD' } }))
    );
    const r = await reviseEbayOfferPrice('offer_1', 25, 'tok');
    expect(r).toMatchObject({ ok: true, method: 'inventory-api' });
    expect(puts()).toHaveLength(1);
    expect(puts()[0].pricingSummary.price.value).toBe('25.00');
    expect(puts()[0].bestOfferTerms).toEqual({
      bestOfferEnabled: true,
      autoAcceptPrice: { value: '22.50', currency: 'USD' },
      autoDeclinePrice: { value: '16.88', currency: 'USD' },
    });
  });

  it('valid echoed thresholds are sent back unchanged', async () => {
    const terms = { bestOfferEnabled: true, autoAcceptPrice: { value: '20.00', currency: 'USD' } };
    mockEbayFetch.mockImplementation(async (_p: string, _t: string, init: any) =>
      init?.method === 'PUT' ? res(true, 204) : res(true, 200, offerWith(terms))
    );
    await reviseEbayOfferPrice('offer_1', 25, 'tok');
    expect(puts()[0].bestOfferTerms).toEqual(terms);
  });

  it('an offer with no Best Offer gets no bestOfferTerms added', async () => {
    mockEbayFetch.mockImplementation(async (_p: string, _t: string, init: any) =>
      init?.method === 'PUT' ? res(true, 204) : res(true, 200, offerWith())
    );
    await reviseEbayOfferPrice('offer_1', 25, 'tok');
    expect(puts()[0].bestOfferTerms).toBeUndefined();
  });

  it('the original repair retry still runs with the same safe pair if eBay rejects for a threshold reason', async () => {
    let n = 0;
    mockEbayFetch.mockImplementation(async (_p: string, _t: string, init: any) => {
      if (init?.method !== 'PUT') return res(true, 200, offerWith());
      n += 1;
      return n === 1 ? res(false, 400, 'The Best Offer Auto Accept price must be less than the price') : res(true, 204);
    });
    const r = await reviseEbayOfferPrice('offer_1', 25, 'tok');
    expect(r).toMatchObject({ ok: true, repaired: true, repairMethod: 'best-offer-threshold' });
    expect(puts()).toHaveLength(2);
    expect(puts()[1].bestOfferTerms).toEqual({
      bestOfferEnabled: true,
      autoAcceptPrice: { value: '22.50', currency: 'USD' },
      autoDeclinePrice: { value: '16.88', currency: 'USD' },
    });
  });
});
