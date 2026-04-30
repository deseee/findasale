/**
 * eBay Adapter — Sold listings + asking prices
 * Wraps existing fetchEbayPriceComps
 */

import { PricingAdapter } from './base';
import { PricingRequest, SourceResult } from '../types';

export class EbayAdapter implements PricingAdapter {
  sourceId = 'ebay';
  tier: 1 | 2 | 3 = 1;
  isAskingPrice = true; // Fallback to asking prices, apply 0.6x

  async fetch(request: PricingRequest): Promise<SourceResult[]> {
    // Phase 1: Stub implementation
    // TODO: Integrate with existing fetchEbayPriceComps, add filterBySold parameter
    throw new Error('eBay adapter not yet implemented — enable in registry when ready');
  }

  isConfigured(): boolean {
    // TODO: Check if eBay API is configured
    // Returns false to prevent fetch() from being called
    return false;
  }

  async getRateLimitStatus() {
    return { usedToday: 0, remainingToday: 5000 };
  }
}
