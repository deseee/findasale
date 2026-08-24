/**
 * Discogs Adapter — Vinyl records, CDs, cassettes, and albums
 */

import { PricingAdapter } from './base';
import { PricingRequest, SourceResult } from '../types';
import { resetFailureCounter, recordAdapterFailure, checkQuota, recordApiUsage } from '../circuit-breaker';
import { prisma } from '../../../lib/prisma';
import axios from 'axios';

/**
 * Standalone audio-format detector (records/vinyl/CD/cassette), exported so
 * other callers (e.g. cloudAIService.ts's photo-scan pricing finalize step)
 * can check "is this a record?" without needing a full DiscogsAdapter
 * instance. DiscogsAdapter.isAudioFormat below delegates to this function.
 */
export function isAudioFormatMatch(request: Pick<PricingRequest, 'title' | 'category'>): boolean {
  const categoryLower = request.category?.toLowerCase() || '';
  const titleLower = request.title?.toLowerCase() || '';

  // Check category for audio-related keywords
  const categoryMatch = /vinyl|cd|compact disc|cassette|tape|album|record|music/.test(
    categoryLower
  );

  // Check title for audio-related keywords
  const titleMatch = /vinyl|cd|compact disc|cassette|tape|album|record|music/.test(
    titleLower
  );

  return categoryMatch || titleMatch;
}

export class DiscogsAdapter implements PricingAdapter {
  sourceId = 'discogs';
  tier: 1 | 2 | 3 = 1;
  // Fixed 2026-08-24: lowest_price is a live marketplace asking price (current for-sale
  // listings), not a confirmed sold transaction -- see the fetch() fix below. Flagging this
  // true keeps this class self-consistent with ebay.ts/keepa.ts, which also carry asking data.
  isAskingPrice = true;

  private isAudioFormat(request: PricingRequest): boolean {
    return isAudioFormatMatch(request);
  }

  async fetch(request: PricingRequest): Promise<SourceResult[]> {
    try {
      // Check if this is an audio format (vinyl, CD, cassette, album)
      if (!this.isAudioFormat(request)) {
        return [];
      }

      // Check quota
      const quota = await checkQuota(this.sourceId);
      if (!quota.hasQuota) {
        console.warn(`[Discogs] Quota exceeded: ${quota.message}`);
        return [];
      }

      // Determine format param based on category/title
      let formatParam = 'Vinyl'; // default
      if (request.category?.toLowerCase().includes('cd') || request.title?.toLowerCase().includes('cd')) {
        formatParam = 'CD';
      } else if (
        request.category?.toLowerCase().includes('cassette') ||
        request.title?.toLowerCase().includes('cassette')
      ) {
        formatParam = 'Cassette';
      }

      // Search Discogs API
      const searchUrl = `https://api.discogs.com/database/search?q=${encodeURIComponent(request.title)}&type=release&format=${encodeURIComponent(formatParam)}&token=${process.env.DISCOGS_TOKEN || ''}`;

      const response = await axios.get(searchUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'FindA.Sale/1.0 +https://finda.sale',
        },
      });

      const data = response.data;
      const results: SourceResult[] = [];

      // Process search results
      if (data.results && Array.isArray(data.results)) {
        for (const item of data.results.slice(0, 5)) {
          if (!item.id || !item.title) continue;

          try {
            // BUGFIX 2026-08-24 (found during live QA of the charm-pricing/Discogs-comp-wiring
            // fix): the release ${id}/stats endpoint does NOT return a `marketplace` object at
            // all -- confirmed live, it returns only `{"is_offensive":false}`. The real
            // marketplace pricing fields (`num_for_sale`, `lowest_price`) live on the base
            // release detail endpoint instead -- confirmed live against release 12294520
            // (Loggins & Messina "Full Sail"): num_for_sale=9, lowest_price=8.11. This is why
            // PricingSourceConfig.apiUsedToday for 'discogs' stayed at 0 all day even though the
            // adapter was enabled, had quota, and threw no errors -- every lookup silently found
            // zero usable results. `lowest_price` is a live asking price across current listings,
            // not a confirmed sold price, so isSoldPrice is false below (weighting.ts applies the
            // standard 0.6x asking-to-sold discount for that).
            const releaseUrl = `https://api.discogs.com/releases/${item.id}`;
            const releaseResponse = await axios.get(releaseUrl, {
              timeout: 10000,
              headers: {
                'User-Agent': 'FindA.Sale/1.0 +https://finda.sale',
              },
            });

            const release = releaseResponse.data;

            // Extract lowest current asking price, only if copies are actually for sale.
            let price: number | null = null;
            if (
              release.num_for_sale > 0 &&
              release.lowest_price !== undefined &&
              release.lowest_price !== null
            ) {
              price = Math.round(parseFloat(release.lowest_price) * 100); // convert to cents
            }

            if (price && price > 0) {
              results.push({
                sourceId: 'discogs',
                price,
                isSoldPrice: false, // lowest_price is an asking price, not a confirmed sale
                saleDate: new Date(), // Discogs provides live marketplace data, treated as current
                confidence: 0.85, // Discogs marketplace is reliable
                comparabilityScore: 0.8, // Direct format match
              });
            }
          } catch (itemErr) {
            // Skip this item on error
            continue;
          }
        }
      }

      if (results.length > 0) {
        await resetFailureCounter(this.sourceId);
        await recordApiUsage(this.sourceId, results.length);
      }

      return results;
    } catch (error) {
      console.error('[Discogs] Error:', error);
      await recordAdapterFailure(this.sourceId);
      return [];
    }
  }

  isConfigured(): boolean {
    // Discogs is free (no API key required, but token can be provided for higher rate limits)
    return true;
  }

  async getRateLimitStatus() {
    const config = await prisma.pricingSourceConfig.findUnique({
      where: { sourceId: 'discogs' },
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
