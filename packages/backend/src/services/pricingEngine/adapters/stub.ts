/**
 * Stub Adapter — Placeholder for disabled sources
 * Returns empty results; throws "Not implemented" if called
 */

import { PricingAdapter } from './base';
import { PricingRequest, SourceResult } from '../types';

export class StubAdapter implements PricingAdapter {
  sourceId: string;
  tier: 1 | 2 | 3 = 1;
  isAskingPrice = false;

  constructor(sourceId: string) {
    this.sourceId = sourceId;
  }

  async fetch(_request: PricingRequest): Promise<SourceResult[]> {
    throw new Error(`Adapter not implemented: ${this.sourceId} — enable via PricingSourceConfig`);
  }

  isConfigured(): boolean {
    return false; // Always unconfigured; prevents use
  }

  async getRateLimitStatus() {
    return { usedToday: 0, remainingToday: 0 };
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}
