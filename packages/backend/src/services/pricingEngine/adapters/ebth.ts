/**
 * EBTH Adapter — Estate sale hammer prices via Cloudflare Worker proxy + cheerio scrape
 */

import { PricingAdapter } from './base';
import { PricingRequest, SourceResult } from '../types';
import { prisma } from '../../../lib/prisma';
import { recordAdapterFailure, resetFailureCounter, checkQuota, recordApiUsage } from '../circuit-breaker';
import axios from 'axios';
import * as cheerio from 'cheerio';

export class EbthAdapter implements PricingAdapter {
  sourceId = 'ebth';
  tier: 1 | 2 | 3 = 1;
  isAskingPrice = false;

  async fetch(request: PricingRequest): Promise<SourceResult[]> {
    try {
      // Check if configured
      if (!this.isConfigured()) {
        console.warn('[EBTH] Not configured — EBTH_WORKER_URL not set');
        return [];
      }

      // Check quota
      const quota = await checkQuota(this.sourceId);
      if (!quota.hasQuota) {
        console.warn(`[EBTH] Quota exceeded: ${quota.message}`);
        return [];
      }

      // Check cache first (24-hour TTL)
      const cacheKey = `${request.title}_${request.category}`;
      const cached = await prisma.pricingComp.findMany({
        where: {
          sourceId: 'ebth',
          externalListingId: cacheKey,
          expireAt: {
            gt: new Date(),
          },
        },
        take: 5,
      });

      if (cached.length > 0) {
        const results = cached.map(c => ({
          sourceId: 'ebth',
          price: Number(c.price),
          isSoldPrice: true,
          saleDate: c.saleDate,
          confidence: c.confidence,
          comparabilityScore: c.comparabilityScore,
        }));

        await resetFailureCounter(this.sourceId);
        return results;
      }

      // Fetch fresh results via Cloudflare Worker proxy
      const searchQuery = `${request.title}${request.category ? ` ${request.category}` : ''}`;
      const workerUrl = process.env.EBTH_WORKER_URL!;
      const proxyUrl = `${workerUrl}?q=${encodeURIComponent(searchQuery)}&page=1`;

      const response = await axios.get(proxyUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'FindA.Sale/1.0 +https://finda.sale',
        },
      });

      const html = response.data;
      const $ = cheerio.load(html);
      const results: SourceResult[] = [];

      // Parse EBTH search results for closed auction items
      // Look for item cards with price information
      $('div.item-card, div.auction-item, li.search-result').each((idx, elem) => {
        if (results.length >= 5) return false;

        try {
          // Extract title
          const title = $(elem).find('h3, .item-card__title, .item-title, a.item-link').text().trim();
          if (!title) return;

          // Extract price (look for $ amounts near "Sold" text)
          let price: number | null = null;
          const priceText = $(elem)
            .find('.item-card__price, .price, .hammer-price, .sold-price')
            .text()
            .trim();

          // Parse price: extract digits and cents
          const priceMatch = priceText.match(/\$[\d,]+(?:\.\d{2})?/);
          if (priceMatch) {
            const cleanPrice = priceMatch[0].replace(/[$,]/g, '');
            price = Math.round(parseFloat(cleanPrice) * 100); // convert to cents
          }

          if (price && price > 0) {
            results.push({
              sourceId: 'ebth',
              price,
              isSoldPrice: true,
              saleDate: new Date(), // EBTH search doesn't always show exact dates, use approximate
              confidence: 0.75, // estate sale comps are less precise than specialized platforms
              comparabilityScore: 0.65, // category match is inferred from search
            });
          }
        } catch (parseErr) {
          // Skip this item on parse error
        }
      });

      if (results.length > 0) {
        await resetFailureCounter(this.sourceId);
        await recordApiUsage(this.sourceId, results.length);
      }

      return results;
    } catch (error) {
      console.error('[EBTH] Error:', error);
      await recordAdapterFailure(this.sourceId);
      return [];
    }
  }

  isConfigured(): boolean {
    return !!process.env.EBTH_WORKER_URL;
  }

  async getRateLimitStatus() {
    const config = await prisma.pricingSourceConfig.findUnique({
      where: { sourceId: 'ebth' },
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
