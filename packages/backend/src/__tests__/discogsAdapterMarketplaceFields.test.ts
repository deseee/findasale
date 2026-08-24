/**
 * Discogs pricing adapter — correct marketplace-price fields (P1 fix, 2026-08-24).
 *
 * WHAT THIS SUITE EXISTS FOR: services/pricingEngine/adapters/discogs.ts's fetch() called
 * `GET /releases/{id}/stats` looking for a `marketplace.last_sold_price` / `marketplace.avg_price`
 * object. Found live during QA of the charm-pricing/Discogs-comp-wiring fix shipped the same day:
 * the `/stats` endpoint does NOT return a `marketplace` object at all -- confirmed directly against
 * the live Discogs API, it returns only `{"is_offensive":false}`. The real marketplace pricing
 * fields (`num_for_sale`, `lowest_price`) live on the base `GET /releases/{id}` detail endpoint --
 * confirmed live against release 12294520 (Loggins & Messina "Full Sail"): num_for_sale=9,
 * lowest_price=8.11. Every Discogs lookup was therefore silently finding zero usable results,
 * all day, every day -- PricingSourceConfig.apiUsedToday for 'discogs' stayed at 0 despite the
 * adapter being enabled, having quota, and throwing no errors (confirmed via a live DB query).
 *
 * Fixed by querying `/releases/{id}` instead of `/releases/{id}/stats` and reading
 * `num_for_sale`/`lowest_price`. Since `lowest_price` is a live asking price (current for-sale
 * listings), not a confirmed sold transaction, `isSoldPrice` is now `false` on the returned
 * SourceResult -- weighting.ts applies its standard 0.6x asking-to-sold discount for that flag,
 * and the class-level `isAskingPrice` was flipped to `true` to match (self-consistent with
 * ebay.ts/keepa.ts, the other asking-price-only adapters).
 */

jest.mock('axios');
jest.mock('../services/pricingEngine/circuit-breaker', () => ({
  checkQuota: jest.fn().mockResolvedValue({ hasQuota: true }),
  resetFailureCounter: jest.fn().mockResolvedValue(undefined),
  recordApiUsage: jest.fn().mockResolvedValue(undefined),
  recordAdapterFailure: jest.fn().mockResolvedValue(undefined),
}));

import axios from 'axios';
import { DiscogsAdapter } from '../services/pricingEngine/adapters/discogs';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DiscogsAdapter — queries the release detail endpoint, not /stats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts lowest_price from GET /releases/{id} (not /stats) and marks it an asking price', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/database/search')) {
        return Promise.resolve({
          data: { results: [{ id: 12294520, title: 'Loggins And Messina - Full Sail' }] },
        });
      }
      // Must hit the release detail endpoint -- NOT /releases/12294520/stats.
      if (url === 'https://api.discogs.com/releases/12294520') {
        return Promise.resolve({ data: { num_for_sale: 9, lowest_price: 8.11 } });
      }
      return Promise.reject(new Error(`Unexpected URL in test: ${url}`));
    });

    const adapter = new DiscogsAdapter();
    const results = await adapter.fetch({
      title: 'Loggins & Messina Full Sail Vinyl LP Record, 1973',
      category: 'Vinyl Records',
    } as any);

    expect(results).toHaveLength(1);
    expect(results[0].price).toBe(811); // $8.11 -> cents
    expect(results[0].isSoldPrice).toBe(false); // asking price, not a confirmed sale
    expect(adapter.isAskingPrice).toBe(true);

    // Confirms the fix: never calls the old, empty /stats endpoint.
    const calledUrls = mockedAxios.get.mock.calls.map(c => c[0]);
    expect(calledUrls.some(u => String(u).includes('/stats'))).toBe(false);
  });

  it('returns no result when the release has zero copies for sale (num_for_sale: 0)', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/database/search')) {
        return Promise.resolve({ data: { results: [{ id: 999, title: 'Obscure Release' }] } });
      }
      if (url === 'https://api.discogs.com/releases/999') {
        // Matches the real, confirmed-live shape of a release nobody currently has for sale.
        return Promise.resolve({ data: { num_for_sale: 0, lowest_price: null } });
      }
      return Promise.reject(new Error(`Unexpected URL in test: ${url}`));
    });

    const adapter = new DiscogsAdapter();
    const results = await adapter.fetch({
      title: 'Some Obscure Vinyl LP Record',
      category: 'Vinyl Records',
    } as any);

    expect(results).toHaveLength(0);
  });
});
