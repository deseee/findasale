/**
 * GSA Auctions Adapter — Government auctions for tools/equipment/furniture
 */

import { PricingAdapter } from './base';
import { PricingRequest, SourceResult } from '../types';
import { resetFailureCounter, recordAdapterFailure, checkQuota } from '../circuit-breaker';
import prisma from '@findasale/database';

const GSA_CATEGORIES = ['Tools', 'Equipment', 'Furniture', 'Office'];

export class GsaAdapter implements PricingAdapter {
  sourceId = 'gsa';
  tier: 1 | 2 | 3 = 2;
  isAskingPrice = false;

  async fetch(request: PricingRequest): Promise<SourceResult[]> {
    try {
      // Only for GSA-relevant categories
      if (!GSA_CATEGORIES.some(cat => request.category?.includes(cat))) {
        return [];
      }

      // Check quota
      const quota = await checkQuota(this.sourceId);
      if (!quota.hasQuota) {
        console.warn(`[GSA] Quota exceeded: ${quota.message}`);
        return [];
      }

      // Phase 1: Stub — TODO implement GSA API call
      // const response = await fetch(
      //   `https://api.sam.gov/opportunities/v2/search?api_key=${apiKey}&ptype=a&keyword=${encodeURIComponent(request.category)}`
      // );
      // const data = await response.json();

      console.log('[GSA] API adapter not yet implemented');
      await resetFailureCounter(this.sourceId);
      return [];
    } catch (error) {
      console.error('[GSA] Error:', error);
      await recordAdapterFailure(this.sourceId);
      return [];
    }
  }

  isConfigured(): boolean {
    // GSA has a public DEMO_KEY; can also use GSA_API_KEY env var
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
