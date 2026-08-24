/**
 * GSA Auctions Adapter — Government auctions for tools/equipment/furniture
 *
 * Real endpoint (confirmed 2026-08-24 against gsa.github.io/auctions_api docs):
 * GET https://api.gsa.gov/assets/gsaauctions/v2/auctions
 * DEMO_KEY works for testing but rate-limits quickly; production should use a free
 * personal key from api.data.gov/signup (no cost, standard federal API key signup).
 *
 * IMPORTANT data-quality note: per GSA's own docs, this API returns LIVE data only —
 * there is no confirmed-sold/closed-auction price anywhere in this API. AuctionStatus
 * values are A (Active), P (Preview), or blank (Scheduled) — no "closed" status exists.
 * A mid-auction HighBidAmount is a much weaker signal than even an asking price (it can
 * be near-zero on day one of a two-week auction), so this adapter is scored well below
 * Discogs/eBay: confidence 0.4, comparabilityScore 0.4 (keyword-only category match — no
 * structured taxonomy field exists to filter on instead), and isAskingPrice=true so
 * weighting.ts's standard 0.6x asking-to-sold discount also applies on top.
 */

import { PricingAdapter } from './base';
import { PricingRequest, SourceResult } from '../types';
import { resetFailureCounter, recordAdapterFailure, checkQuota, recordApiUsage } from '../circuit-breaker';
import { prisma } from '../../../lib/prisma';
import axios from 'axios';

const GSA_CATEGORIES = ['Tools', 'Equipment', 'Furniture', 'Office'];

interface GsaAuctionRecord {
  ItemName?: string;
  LotDescript?: string;
  AuctionStatus?: string; // 'A' = Active, 'P' = Preview, '' = Scheduled — no closed/sold value exists
  HighBidAmount?: number | string;
  Reserve?: number | string;
  AucStartDt?: string;
  AucEndDt?: string;
  ImageURL?: string;
}

export class GsaAdapter implements PricingAdapter {
  sourceId = 'gsa';
  tier: 1 | 2 | 3 = 2;
  isAskingPrice = true; // live mid-auction bid, not a confirmed sale — gets the 0.6x discount too

  async fetch(request: PricingRequest): Promise<SourceResult[]> {
    try {
      // Only for GSA-relevant categories — no structured category field exists in the API
      // to filter server-side on, so this is a client-side keyword gate before we even call out.
      if (!GSA_CATEGORIES.some(cat => request.category?.includes(cat))) {
        return [];
      }

      const quota = await checkQuota(this.sourceId);
      if (!quota.hasQuota) {
        console.warn(`[GSA] Quota exceeded: ${quota.message}`);
        return [];
      }

      const apiKey = process.env.GSA_API_KEY || 'DEMO_KEY';
      const url = `https://api.gsa.gov/assets/gsaauctions/v2/auctions?api_key=${encodeURIComponent(apiKey)}&format=JSON`;

      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'FindA.Sale/1.0 +https://finda.sale',
        },
      });

      await recordApiUsage(this.sourceId);

      const auctions: GsaAuctionRecord[] = Array.isArray(response.data)
        ? response.data
        : response.data?.auctions || response.data?.results || [];

      const searchTerms = GSA_CATEGORIES.filter(cat => request.category?.includes(cat));
      const titleLower = request.title?.toLowerCase() || '';

      const matches = auctions.filter(a => {
        // Live-data-only gate: skip Preview/Scheduled/no-bid-yet rows — they carry zero
        // real price signal (a Preview listing has AucStartDt in the future and no bids).
        if (a.AuctionStatus !== 'A') return false;
        const highBid = typeof a.HighBidAmount === 'string' ? parseFloat(a.HighBidAmount) : (a.HighBidAmount ?? 0);
        if (!highBid || highBid <= 0) return false;

        const haystack = `${a.ItemName || ''} ${a.LotDescript || ''}`.toLowerCase();
        const categoryHit = searchTerms.some(term => haystack.includes(term.toLowerCase()));
        const titleHit = titleLower.length > 0 && haystack.includes(titleLower.split(' ')[0].toLowerCase());
        return categoryHit || titleHit;
      });

      const results: SourceResult[] = matches.slice(0, 10).map(a => {
        const highBid = typeof a.HighBidAmount === 'string' ? parseFloat(a.HighBidAmount) : (a.HighBidAmount ?? 0);
        const endDate = a.AucEndDt ? new Date(a.AucEndDt) : new Date();
        const saleDate = !isNaN(endDate.getTime()) && endDate.getTime() < Date.now() ? endDate : new Date();
        return {
          sourceId: 'gsa',
          price: Math.round(highBid * 100), // dollars -> cents
          isSoldPrice: false, // live mid-auction high bid, not a closed sale — no closed-auction data exists in this API
          saleDate,
          confidence: 0.4, // below Discogs/eBay — live in-progress bid, not even a listed asking price
          comparabilityScore: 0.4, // keyword-only category match, no structured taxonomy
          sampleSize: matches.length,
        };
      });

      if (results.length > 0) {
        await resetFailureCounter(this.sourceId);
      }

      return results;
    } catch (error) {
      console.error('[GSA] Error:', error);
      await recordAdapterFailure(this.sourceId);
      return [];
    }
  }

  isConfigured(): boolean {
    // GSA has a public DEMO_KEY fallback; can also use GSA_API_KEY env var for a
    // production-rate-limit key from api.data.gov/signup (free, no §0·SPEND concern).
    return true;
  }

  async getRateLimitStatus() {
    const config = await prisma.pricingSourceConfig.findUnique({
      where: { sourceId: 'gsa' },
    });

    if (!config?.apiQuotaDaily) {
      return { usedToday: 0, remainingToday: Infinity };
    }

    return {
      usedToday: config.apiUsedToday,
      remainingToday: Math.max(0, config.apiQuotaDaily - config.apiUsedToday),
    };
  }
}
