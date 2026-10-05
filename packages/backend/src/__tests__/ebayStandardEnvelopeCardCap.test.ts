/**
 * ADR-137 part C (roadmap #660): a raw card priced at or above $20 never gets eBay's Standard Envelope (which is untracked)
 * and falls back to a tracked option under the existing shipping defaults.
 *
 * Covers the rate engine (real estimateCheapestRate), the price ceiling inside matchStandardEnvelopePolicy for a policy
 * whose name states no cap, the price-crossing helper that makes a price edit re-resolve a live offer's shipping policy,
 * and a drift guard that fails when the three copies of the $20 figure disagree.
 * The resolver path with a misbehaving rate engine is in ebayStandardEnvelopeCardCapResolver.test.ts.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));

import { EBAY_STANDARD_ENVELOPE_MAX_PRICE_USD, estimateCheapestRate } from '../services/ebayRateEstimateService';
import {
  CARD_STANDARD_ENVELOPE_MAX_PRICE_USD,
  PINNED_CARD_CATEGORY_IDS,
  standardEnvelopePriceCrossing,
} from '../config/cardEbayCategories';
import { STANDARD_ENVELOPE_MAX_PRICE_USD, matchStandardEnvelopePolicy } from '../utils/ebayPolicyParser';

const base = { weightOz: 1, zone: 'z5' as const, dims: { length: 6, width: 4, height: 0.2 } as any };

describe('the $20 ceiling is one number everywhere', () => {
  it('has the same value in the rate engine, the policy parser and the card helper', () => {
    expect(EBAY_STANDARD_ENVELOPE_MAX_PRICE_USD).toBe(20);
    expect(STANDARD_ENVELOPE_MAX_PRICE_USD).toBe(EBAY_STANDARD_ENVELOPE_MAX_PRICE_USD);
    expect(CARD_STANDARD_ENVELOPE_MAX_PRICE_USD).toBe(EBAY_STANDARD_ENVELOPE_MAX_PRICE_USD);
  });
});

describe('estimateCheapestRate for a raw card (every pinned card category)', () => {
  const categories = [...PINNED_CARD_CATEGORY_IDS];

  it('knows the three pinned card categories', () => {
    expect(categories.sort()).toEqual(['183050', '183454', '261328']);
  });

  describe.each(categories)('category %s', (categoryId) => {
    it.each([0.5, 5, 19.99])('at $%s a one ounce card can use the Standard Envelope', (priceUsd) => {
      expect(estimateCheapestRate({ ...base, categoryId, priceUsd }).basis).toBe('standard_envelope');
    });

    it.each([20, 20.01, 25, 29.99, 30, 75, 500])('at $%s it never uses the Standard Envelope and falls back to a tracked parcel rate', (priceUsd) => {
      const r = estimateCheapestRate({ ...base, categoryId, priceUsd });
      expect(r.basis).not.toBe('standard_envelope');
      // Every carrier the engine models is a tracked service, and the cheapest of them costs more than the envelope's top rate.
      expect(r.rate).toBeGreaterThan(1.36);
    });

    it('fails closed when the price is unknown', () => {
      expect(estimateCheapestRate({ ...base, categoryId, priceUsd: null }).basis).not.toBe('standard_envelope');
      expect(estimateCheapestRate({ ...base, categoryId }).basis).not.toBe('standard_envelope');
    });

    it('fails closed over the 3 oz weight limit even when the price is low', () => {
      expect(estimateCheapestRate({ ...base, categoryId, weightOz: 3.5, priceUsd: 5 }).basis).not.toBe('standard_envelope');
    });
  });
});

describe('matchStandardEnvelopePolicy has its own ceiling', () => {
  // A policy whose NAME states no price cap used to match at any price when the caller forgot to gate it.
  const UNCAPPED = [
    { fulfillmentPolicyId: 'env-1', name: '1oz Std Env $1.03' },
    { fulfillmentPolicyId: 'env-3', name: '3oz Std Env $1.65' },
  ];

  it('matches below $20', () => {
    expect(matchStandardEnvelopePolicy(1, 19.99, UNCAPPED)?.policyId).toBe('env-1');
  });

  it.each([20, 20.01, 25, 29.99, 30])('never matches at $%s, even for a policy that states no cap', (price) => {
    expect(matchStandardEnvelopePolicy(1, price, UNCAPPED)).toBeNull();
  });

  it('still honors a lower cap stated in the policy name', () => {
    const capped = [{ fulfillmentPolicyId: 'env-10', name: '1oz under $10 Std Env $1.03' }];
    expect(matchStandardEnvelopePolicy(1, 9.99, capped)?.policyId).toBe('env-10');
    expect(matchStandardEnvelopePolicy(1, 10, capped)).toBeNull();
  });
});

describe('standardEnvelopePriceCrossing', () => {
  it('is true when a price rises to the ceiling or above, and when it falls back under', () => {
    expect(standardEnvelopePriceCrossing(15, 25)).toBe(true);
    expect(standardEnvelopePriceCrossing(19.99, 20)).toBe(true);
    expect(standardEnvelopePriceCrossing(25, 15)).toBe(true);
    expect(standardEnvelopePriceCrossing(20, 19.99)).toBe(true);
  });

  it('is false while the price stays on the same side', () => {
    expect(standardEnvelopePriceCrossing(5, 15)).toBe(false);
    expect(standardEnvelopePriceCrossing(25, 40)).toBe(false);
    expect(standardEnvelopePriceCrossing(20, 20)).toBe(false);
  });

  it('treats a missing price as not under the ceiling', () => {
    expect(standardEnvelopePriceCrossing(null, 15)).toBe(true);
    expect(standardEnvelopePriceCrossing(15, null)).toBe(true);
    expect(standardEnvelopePriceCrossing(null, undefined)).toBe(false);
    expect(standardEnvelopePriceCrossing(null, 40)).toBe(false);
  });

  it('accepts numeric strings and Decimal-like values', () => {
    expect(standardEnvelopePriceCrossing('15.00', '25.00')).toBe(true);
    expect(standardEnvelopePriceCrossing({ valueOf: () => '15.5', toString: () => '15.5' }, 30)).toBe(true);
    expect(standardEnvelopePriceCrossing('abc', 15)).toBe(true);
  });
});
