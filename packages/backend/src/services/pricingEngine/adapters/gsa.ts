/**
 * GSA Auctions Adapter — Government auctions for tools/equipment/furniture
 *
 * Real endpoint: GET https://api.gsa.gov/assets/gsaauctions/v2/auctions
 * DEMO_KEY works for testing but rate-limits quickly; GSA_API_KEY (free api.data.gov
 * signup) is used in production once set.
 *
 * FIELD NAMES CORRECTED 2026-08-25: the original build (2026-08-24) was written against
 * gsa.github.io/auctions_api's documented field names (PascalCase: ItemName, AuctionStatus,
 * HighBidAmount, etc, with AuctionStatus values 'A'/'P'/blank) — those docs turned out to be
 * STALE relative to the real v2 API. Confirmed live against a real GSA_API_KEY this session:
 * the actual response is `{"Results": [...]}` (capital R wrapper) with camelCase item fields
 * — itemName, auctionStatus (value is the full word "Active", not "A"), highBidAmount,
 * aucEndDt, lotInfo (HTML description; there is no separate LotDescript field). The adapter
 * below was silently returning [] in production for ~1 day because every field/key it
 * checked did not exist under those names. Never trust third-party API docs over a live
 * response — this is exactly why.
 *
 * IMPORTANT data-quality note (still true): per GSA's own docs, this API returns LIVE data
 * only — there is no confirmed-sold/closed-auction price anywhere in this API. A mid-auction
 * highBidAmount is a much weaker signal than even an asking price (it can be near-zero on
 * day one of a two-week auction), so this adapter is scored well below Discogs/eBay:
 * confidence 0.4, comparabilityScore 0.4 (keyword-only category match — no structured
 * taxonomy field exists to filter on instead), and isAskingPrice=true so weighting.ts's
 * standard 0.6x asking-to-sold discount also applies on top.
 */

import { PricingAdapter } from './base';
import { PricingRequest, SourceResult } from '../types';
import { resetFailureCounter, recordAdapterFailure, checkQuota, recordApiUsage } from '../circuit-breaker';
import { prisma } from '../../../lib/prisma';
import axios from 'axios';

const GSA_CATEGORIES = ['Tools', 'Equipment', 'Furniture', 'Office'];

interface GsaAuctionRecord {
  itemName?: string;
  lotInfo?: string; // HTML-formatted description
  auctionStatus?: string; // "Active" | "Preview" | "Scheduled" (confirmed live, full words — no closed/sold value exists)
  highBidAmount?: number | string;
  reserve?: boolean;
  aucStartDt?: string;
  aucEndDt?: string;
  imageURL?: string;
}

// Strip HTML tags from lotInfo before substring-matching against it.
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
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

      // Real shape (confirmed live 2026-08-25): { Results: [...] } — capital R, not
      // .auctions/.results/a bare array.
      const auctions: GsaAuctionRecord[] = Array.isArray(response.data)
        ? response.data
        : response.data?.Results || response.data?.results || response.data?.auctions || [];

      const searchTerms = GSA_CATEGORIES.filter(cat => request.category?.includes(cat));
      const titleLower = request.title?.toLowerCase() || '';

      const matches = auctions.filter(a => {
        // Live-data-only gate: skip Preview/Scheduled/no-bid-yet rows — they carry zero
        // real price signal (a Preview listing has aucStartDt in the future and no bids).
        if (a.auctionStatus !== 'Active') return false;
        const highBid = typeof a.highBidAmount === 'string' ? parseFloat(a.highBidAmount) : (a.highBidAmount ?? 0);
        if (!highBid || highBid <= 0) return false;

        const haystack = `${a.itemName || ''} ${stripHtml(a.lotInfo || '')}`.toLowerCase();
        const categoryHit = searchTerms.some(term => haystack.includes(term.toLowerCase()));
        const titleHit = titleLower.length > 0 && haystack.includes(titleLower.split(' ')[0].toLowerCase());
        return categoryHit || titleHit;
      });

      const results: SourceResult[] = matches.slice(0, 10).map(a => {
        const highBid = typeof a.highBidAmount === 'string' ? parseFloat(a.highBidAmount) : (a.highBidAmount ?? 0);
        const endDate = a.aucEndDt ? new Date(a.aucEndDt) : new Date();
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
