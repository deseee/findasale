/**
 * Adapter Base Interface and Types
 * All pricing sources implement this interface
 */

import { PricingRequest, SourceResult } from '../types';

export interface PricingAdapter {
  sourceId: string;
  tier: 1 | 2 | 3;
  isAskingPrice: boolean; // true = multiply by 0.6; false = use as-is

  /**
   * Fetch comps for a pricing request
   * Should handle failures gracefully and return empty array
   */
  fetch(request: PricingRequest): Promise<SourceResult[]>;

  /**
   * Check if adapter is configured (API key exists, etc.)
   */
  isConfigured(): boolean;

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): Promise<{
    usedToday: number;
    remainingToday: number;
  }>;

  /**
   * Check if source is currently available
   * (network check, API status check, etc.)
   */
  isAvailable?(): Promise<boolean>;
}
