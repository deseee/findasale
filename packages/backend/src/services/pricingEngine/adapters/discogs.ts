/**
 * Discogs Adapter — Vinyl records, CDs, cassettes, and albums
 */

import { PricingAdapter } from './base';
import { PricingRequest, SourceResult } from '../types';
import { resetFailureCounter, recordAdapterFailure, checkQuota, recordApiUsage } from '../circuit-breaker';
import prisma from '@findasale/database';
import axios from 'axios';

export class DiscogsAdapter implements PricingAdapter {
  sourceId = 'discogs';
  tier: 1 | 2 | 3 = 1;
  isAskingPrice = false;

  private isAudioFormat(request: PricingRequest): boolean {
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
            // Fetch marketplace stats for this release
            const statsUrl = `https://api.discogs.com/releases/${item.id}/stats`;
            const statsResponse = await axios.get(statsUrl, {
              timeout: 10000,
              headers: {
                'User-Agent': 'FindA.Sale/1.0 +https://finda.sale',
              },
            });

            const stats = statsResponse.data;
            const marketplace = stats.marketplace || {};

            // Extract price from last sale or average price
            let price: number | null = null;
            if (marketplace.last_sold_price !== undefined && marketplace.last_sold_price !== null) {
              price = Math.round(parseFloat(marketplace.last_sold_price) * 100); // convert to cents
            } else if (
              marketplace.avg_price !== undefined &&
              marketplace.avg_price !== null
            ) {
              price = Math.round(parseFloat(marketplace.avg_price) * 100);
            }

            if (price && price > 0) {
              results.push({
                sourceId: 'discogs',
                price,
                isSoldPrice: true,
                saleDate: new Date(), // Discogs provides marketplace data, treated as current
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
