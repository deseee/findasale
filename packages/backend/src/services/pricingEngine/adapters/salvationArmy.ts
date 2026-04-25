/**
 * Salvation Army FMV Lookup — Static table, no API
 * Returns floor price for any category based on condition
 */

import { PricingAdapter } from './base';
import { PricingRequest, SourceResult } from '../types';

const SALVATION_ARMY_FMV: Record<string, Record<string, number>> = {
  Furniture: { NEW: 500000, USED: 150000, REFURBISHED: 250000, PARTS_OR_REPAIR: 5000 },
  Kitchenware: { NEW: 300000, USED: 50000, REFURBISHED: 120000, PARTS_OR_REPAIR: 1000 },
  Tools: { NEW: 400000, USED: 120000, REFURBISHED: 200000, PARTS_OR_REPAIR: 3000 },
  Electronics: { NEW: 800000, USED: 200000, REFURBISHED: 400000, PARTS_OR_REPAIR: 5000 },
  Clothing: { NEW: 300000, USED: 30000, REFURBISHED: 80000, PARTS_OR_REPAIR: 1000 },
  Books: { NEW: 50000, USED: 10000, REFURBISHED: 20000, PARTS_OR_REPAIR: 250 },
  Collectibles: { NEW: 500000, USED: 300000, REFURBISHED: 400000, PARTS_OR_REPAIR: 50000 },
  Vinyl: { NEW: 400000, USED: 200000, REFURBISHED: 300000, PARTS_OR_REPAIR: 10000 },
  Glassware: { NEW: 150000, USED: 50000, REFURBISHED: 100000, PARTS_OR_REPAIR: 5000 },
  'Cast Iron': { NEW: 300000, USED: 150000, REFURBISHED: 200000, PARTS_OR_REPAIR: 10000 },
  Art: { NEW: 500000, USED: 250000, REFURBISHED: 350000, PARTS_OR_REPAIR: 50000 },
  Jewelry: { NEW: 600000, USED: 300000, REFURBISHED: 450000, PARTS_OR_REPAIR: 50000 },
  Appliances: { NEW: 600000, USED: 200000, REFURBISHED: 400000, PARTS_OR_REPAIR: 10000 },
  Office: { NEW: 300000, USED: 100000, REFURBISHED: 200000, PARTS_OR_REPAIR: 5000 },
  Decor: { NEW: 200000, USED: 80000, REFURBISHED: 120000, PARTS_OR_REPAIR: 10000 },
  Shoes: { NEW: 100000, USED: 30000, REFURBISHED: 50000, PARTS_OR_REPAIR: 5000 },
};

export class SalvationArmyAdapter implements PricingAdapter {
  sourceId = 'salvationArmy';
  tier: 1 | 2 | 3 = 3;
  isAskingPrice = false;

  async fetch(request: PricingRequest): Promise<SourceResult[]> {
    const category = request.category || 'Other';
    const condition = request.condition || 'USED';

    const fmv = SALVATION_ARMY_FMV[category]?.[condition];

    if (!fmv) {
      // Absolute floor: $0.50 (50 cents)
      return [
        {
          sourceId: 'salvationArmy',
          price: 50,
          isSoldPrice: false,
          saleDate: new Date(),
          confidence: 0.3,
          comparabilityScore: 0.2,
        },
      ];
    }

    return [
      {
        sourceId: 'salvationArmy',
        price: fmv,
        isSoldPrice: false,
        saleDate: new Date(),
        confidence: 0.6,
        comparabilityScore: 0.5,
      },
    ];
  }

  isConfigured(): boolean {
    return true; // Always configured; static data
  }

  async getRateLimitStatus() {
    return { usedToday: 0, remainingToday: Infinity };
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available; static data
  }
}
