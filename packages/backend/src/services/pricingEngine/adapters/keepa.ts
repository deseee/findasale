/**
 * Keepa Adapter — Amazon price history API
 */

import { PricingAdapter } from './base';
import { PricingRequest, SourceResult } from '../types';
import { prisma } from '../../../lib/prisma';
import { recordAdapterFailure, resetFailureCounter, checkQuota } from '../circuit-breaker';

export class KeepaAdapter implements PricingAdapter {
  sourceId = 'keepa';
  tier: 1 | 2 | 3 = 1;
  isAskingPrice = true; // Amazon prices are asking/retail

  async fetch(request: PricingRequest): Promise<SourceResult[]> {
    try {
      // Keepa only works if we have an ASIN
      const asin = await this.resolveASIN(request.title, request.brand);
      if (!asin) return [];

      // Check quota
      const quota = await checkQuota(this.sourceId);
      if (!quota.hasQuota) {
        console.warn(`[Keepa] Quota exceeded: ${quota.message}`);
        return [];
      }

      const apiKey = process.env.KEEPA_API_KEY;
      if (!apiKey) {
        console.warn('[Keepa] API key not configured');
        return [];
      }

      // Phase 1: Stub — TODO implement Keepa API call
      // const response = await fetch(
      //   `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asin}&stats=90`
      // );
      // const data = await response.json();

      console.log('[Keepa] API adapter not yet implemented');
      await resetFailureCounter(this.sourceId);
      return [];
    } catch (error) {
      console.error('[Keepa] Error:', error);
      await recordAdapterFailure(this.sourceId);
      return [];
    }
  }

  private async resolveASIN(_title: string, _brand?: string): Promise<string | null> {
    // Phase 1: Stub
    // TODO: Implement ASIN lookup via UPC or Google API
    return null;
  }

  isConfigured(): boolean {
    return !!process.env.KEEPA_API_KEY;
  }

  async getRateLimitStatus() {
    const config = await prisma.pricingSourceConfig.findUnique({
      where: { sourceId: 'keepa' },
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
