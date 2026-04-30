/**
 * PriceCharting Adapter — Collectibles, games, trading cards
 * Wraps existing priceChartingService
 */

import { PricingAdapter } from './base';
import { PricingRequest, SourceResult } from '../types';

export class PriceChartingAdapter implements PricingAdapter {
  sourceId = 'pricecharting';
  tier: 1 | 2 | 3 = 1;
  isAskingPrice = false;

  async fetch(request: PricingRequest): Promise<SourceResult[]> {
    // Phase 1: Stub implementation
    // TODO: Integrate with existing priceChartingService
    throw new Error('PriceCharting adapter not yet implemented — enable in registry when ready');
  }

  isConfigured(): boolean {
    // TODO: Check if priceChartingService is available
    // Returns false to prevent fetch() from being called
    return false;
  }

  async getRateLimitStatus() {
    return { usedToday: 0, remainingToday: 1000 };
  }
}
