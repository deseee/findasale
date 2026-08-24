/**
 * Etsy Adapter — Vintage, handmade, collectibles, art, jewelry, and craft items
 *
 * Real endpoint: GET https://openapi.etsy.com/v3/application/listings/active
 * (api.etsy.com/v3 is an equivalent alias per Etsy's own docs — openapi.etsy.com used here).
 * Auth: public/keys-only — header `x-api-key: <bare keystring>` from a free developer.etsy.com
 * signup ("Your Apps" -> keystring). This is deliberately the BARE keystring, NOT the
 * colon-joined `keystring:sharedsecret` format used elsewhere in Etsy's docs for shop-management
 * (OAuth-scoped) endpoints — findAllListingsActive is a public marketplace search, no OAuth
 * token or shared-secret needed. Do not "fix" this into the colon-joined format.
 *
 * Rate limit (confirmed via Etsy's own rate-limits doc, 2026-08-25): 10,000 requests/day on a
 * rolling 24h sliding window (not a fixed midnight reset) + 10 queries/second. 429 + retry-after
 * header on exceed.
 *
 * FIELD-NAME VERIFICATION STATUS (IMPORTANT — read before trusting this adapter's output):
 * Unlike gsa.ts's real fix earlier this session (which was tested against a live GSA_API_KEY
 * and corrected from wrong assumed field names), this adapter has NOT been tested against a
 * live Etsy response — we don't have an ETSY_API_KEY yet. The field names below (price as an
 * object with amount/divisor/currency_code) are Etsy v3's long-documented Listing resource
 * shape per third-party references, but were not independently confirmed via a real API call
 * the way GSA's were. The gsa.ts lesson (docs looked right, real API used different field names
 * entirely, adapter silently returned [] for ~1 day) applies here too. Before trusting this in
 * production: get a real ETSY_API_KEY (developer.etsy.com signup, free), make one real request,
 * and confirm the parsing logic below against the actual response shape — do NOT assume this is
 * correct just because it compiles and matches documentation. This is a CODE-ONLY build per
 * CLAUDE.md §9 until that live verification happens.
 *
 * Data-quality note: like Discogs' lowest_price and GSA's highBidAmount, Etsy's API only
 * exposes active/asking listing prices — there is no sold-price or completed-sale data
 * anywhere in this API. isAskingPrice=true applies the standard 0.6x asking-to-sold discount.
 */

import { PricingAdapter } from './base';
import { PricingRequest, SourceResult } from '../types';
import { resetFailureCounter, recordAdapterFailure, checkQuota, recordApiUsage } from '../circuit-breaker';
import { prisma } from '../../../lib/prisma';
import axios from 'axios';

// Etsy's marketplace skews toward vintage/handmade/craft/collectible inventory — these are
// FindA.Sale's own category vocabulary strings, taken directly from the CategoryDepreciation
// seed (packages/database/prisma/migrations/20260425_add_pricing_engine/migration.sql) rather
// than invented, so this lines up with what getDepreciationCurve(request.category) actually
// looks up. 'Clothing' included because vintage clothing is a major Etsy category.
const ETSY_CATEGORIES = ['Collectibles', 'Art', 'Jewelry', 'Glassware', 'Cast Iron', 'Clothing'];

interface EtsyListingPrice {
  amount?: number;
  divisor?: number;
  currency_code?: string;
}

interface EtsyListingRecord {
  listing_id?: number;
  title?: string;
  description?: string;
  price?: EtsyListingPrice | number | string;
  currency_code?: string;
  quantity?: number;
  state?: string; // expect "active" for this endpoint
  url?: string;
  tags?: string[];
}

interface EtsyListingsResponse {
  count?: number;
  results?: EtsyListingRecord[];
}

// Etsy's v3 Listing.price is documented (though not independently live-verified this session)
// as an object { amount, divisor, currency_code } where real price = amount / divisor. Handle
// a couple of plausible shapes defensively rather than assuming only one is correct.
function extractDollarPrice(price: EtsyListingPrice | number | string | undefined): number | null {
  if (price === undefined || price === null) return null;

  if (typeof price === 'number') {
    return price > 0 ? price : null;
  }

  if (typeof price === 'string') {
    const parsed = parseFloat(price);
    return !isNaN(parsed) && parsed > 0 ? parsed : null;
  }

  if (typeof price === 'object') {
    const amount = price.amount;
    const divisor = price.divisor;
    if (typeof amount === 'number' && typeof divisor === 'number' && divisor > 0) {
      const dollars = amount / divisor;
      return dollars > 0 ? dollars : null;
    }
  }

  return null;
}

export class EtsyAdapter implements PricingAdapter {
  sourceId = 'etsy';
  tier: 1 | 2 | 3 = 1;
  // Real marketplace asking price (not a confirmed sale) -- standard 0.6x discount applies,
  // same as discogs.ts's lowest_price and ebay.ts's active-listing comps.
  isAskingPrice = true;

  private isEtsyCategory(request: PricingRequest): boolean {
    return ETSY_CATEGORIES.some(cat => request.category?.includes(cat));
  }

  async fetch(request: PricingRequest): Promise<SourceResult[]> {
    try {
      if (!this.isEtsyCategory(request)) {
        return [];
      }

      if (!this.isConfigured()) {
        // No DEMO_KEY fallback for Etsy (unlike GSA) -- cleanly report unconfigured rather
        // than attempting a request that will just 401.
        return [];
      }

      const quota = await checkQuota(this.sourceId);
      if (!quota.hasQuota) {
        console.warn(`[Etsy] Quota exceeded: ${quota.message}`);
        return [];
      }

      const apiKey = process.env.ETSY_API_KEY as string;
      const url = 'https://openapi.etsy.com/v3/application/listings/active';

      const response = await axios.get<EtsyListingsResponse>(url, {
        timeout: 10000,
        params: {
          keywords: request.title,
          limit: 10,
          sort_on: 'score',
        },
        headers: {
          'x-api-key': apiKey,
          'User-Agent': 'FindA.Sale/1.0 +https://finda.sale',
        },
      });

      await recordApiUsage(this.sourceId);

      const listings = response.data?.results || [];

      const activeListings = listings.filter(l => !l.state || l.state === 'active');

      const results: SourceResult[] = [];
      for (const listing of activeListings.slice(0, 10)) {
        const dollars = extractDollarPrice(listing.price);
        if (!dollars || dollars <= 0) continue;

        results.push({
          sourceId: 'etsy',
          price: Math.round(dollars * 100), // dollars -> cents
          isSoldPrice: false, // active listing asking price, not a confirmed sale
          saleDate: new Date(),
          // Real marketplace listing (not a mid-auction bid like GSA) -- scored close to
          // Discogs' confidence (0.85) since it's a comparable-item asking price from a live
          // marketplace, but comparabilityScore held slightly below Discogs' 0.8 because this
          // is free-text keyword search (no format/taxonomy filter the way Discogs has a
          // structured `format` param) -- a judgment call, revisit once field names are
          // live-verified and we can see real match quality.
          confidence: 0.8,
          comparabilityScore: 0.7,
          sampleSize: activeListings.length,
        });
      }

      if (results.length > 0) {
        await resetFailureCounter(this.sourceId);
      }

      return results;
    } catch (error) {
      console.error('[Etsy] Error:', error);
      await recordAdapterFailure(this.sourceId);
      return [];
    }
  }

  isConfigured(): boolean {
    // Unlike GSA (DEMO_KEY fallback), Etsy has no public fallback key -- a real
    // ETSY_API_KEY from developer.etsy.com is required before this adapter does anything.
    return !!process.env.ETSY_API_KEY;
  }

  async getRateLimitStatus() {
    const config = await prisma.pricingSourceConfig.findUnique({ where: { sourceId: 'etsy' } });
    if (!config?.apiQuotaDaily) return { usedToday: 0, remainingToday: Infinity };
    return {
      usedToday: config.apiUsedToday,
      remainingToday: Math.max(0, config.apiQuotaDaily - config.apiUsedToday),
    };
  }
}
