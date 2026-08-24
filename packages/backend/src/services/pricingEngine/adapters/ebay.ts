/**
 * eBay Adapter — Sold listings + asking prices
 * Wraps existing fetchEbayPriceComps (controllers/ebayController.ts) — this is the SAME
 * Browse-API integration jobs/fetchEbayComps.ts already uses. Not a second eBay integration.
 */

import { PricingAdapter } from './base';
import { PricingRequest, SourceResult } from '../types';
import { fetchEbayPriceComps } from '../../../controllers/ebayController';
import { resetFailureCounter, recordAdapterFailure, checkQuota, recordApiUsage } from '../circuit-breaker';

export class EbayAdapter implements PricingAdapter {
  sourceId = 'ebay';
  tier: 1 | 2 | 3 = 1;
  isAskingPrice = true; // Browse API returns active/asking listings, not confirmed sold
  // prices — the Finding API's sold-listings endpoint (findCompletedItems) is still
  // unapproved for production use, see ebayController.ts's own comment on this. weighting.ts
  // applies the standard 0.6x asking-to-sold discount for isAskingPrice sources.

  async fetch(request: PricingRequest): Promise<SourceResult[]> {
    try {
      const quota = await checkQuota(this.sourceId);
      if (!quota.hasQuota) {
        console.warn(`[eBay] Quota exceeded: ${quota.message}`);
        return [];
      }

      const result = await fetchEbayPriceComps({
        title: request.title,
        category: request.category,
        condition: request.condition,
        maxResults: 10,
      });

      // Mandatory mock-data filter: getEbayPriceComps() returns a hardcoded
      // {min:25,max:75,median:45,...,isMockData:true} object on EVERY failure path —
      // missing/invalid credentials, daily quota cap, no OAuth token, non-2xx from eBay,
      // or a thrown error (confirmed 5 separate return sites in ebayController.ts this
      // session). A mock/fabricated comp must never enter the weighted median. This is the
      // same guard jobs/fetchEbayComps.ts already applies (`hasRealPriceSignal`).
      if (result.isMockData) {
        console.warn(`[eBay] Skipping mock/fallback data for "${request.title}": ${result.message || 'no message'}`);
        return [];
      }

      if (!result.listings || result.listings.length === 0) {
        await resetFailureCounter(this.sourceId);
        return [];
      }

      const results: SourceResult[] = result.listings
        .filter(listing => listing.price > 0)
        .map(listing => ({
          sourceId: 'ebay',
          price: Math.round(listing.price * 100), // dollars -> cents
          isSoldPrice: false, // Browse API active/asking listing, not a confirmed sale
          saleDate: new Date(),
          confidence: 0.75,
          comparabilityScore: 0.75,
          sampleSize: result.count,
        }));

      if (results.length > 0) {
        await resetFailureCounter(this.sourceId);
        await recordApiUsage(this.sourceId, results.length);
      }

      return results;
    } catch (error) {
      console.error('[eBay] Error:', error);
      await recordAdapterFailure(this.sourceId);
      return [];
    }
  }

  isConfigured(): boolean {
    // Env vars can be present but the token call can still fail at runtime — isConfigured()
    // is a synchronous interface method (base.ts) and can't itself make a live call. The real
    // functional check happens at fetch-time via the isMockData filter above. Treat a run of
    // all-isMockData:true results post-deploy as "credentials present but stale/invalid", not
    // "wiring broken".
    return !!process.env.EBAY_CLIENT_ID && !!process.env.EBAY_CLIENT_SECRET;
  }

  async getRateLimitStatus() {
    return { usedToday: 0, remainingToday: 5000 };
  }
}
