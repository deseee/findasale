/**
 * Multi-Source Pricing Engine — Type Definitions
 * Phase 1: Core orchestrator, adapters, and data structures
 */

export interface PricingRequest {
  itemId?: string; // FK to Item; use null to price arbitrary metadata
  title: string;
  category: string;
  condition?: string; // NEW | USED | REFURBISHED | PARTS_OR_REPAIR
  conditionGrade?: string; // S | A | B | C | D
  brand?: string;
  photoUrls?: string[]; // for sleeper detection
  originalPrice?: number; // if known, for depreciation curve calibration (cents)
  saleDate?: Date; // when item was acquired/entered estate
}

export interface PricingResult {
  estimatedPrice: number; // cents
  priceRange: {
    low: number; // 25th percentile
    high: number; // 75th percentile
  };
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'FLOOR'; // FLOOR = fallback to Salvation Army
  tier: 1 | 2 | 3;
  sourcesConsulted: PricingSourceUsed[];
  flags: {
    isTrending: boolean;
    trendMultiplierApplied: number;
    isBrandPremium: boolean;
    brandPremiumBrand?: string;
    isSleeperDetected: boolean;
    sleeperCategory?: string;
    isAppreciating: boolean;
  };
  deprecationCurveApplied?: string; // category name
  compsFound: number;
  dataFreshness: Date;
  debugInfo?: {
    tier1Results: SourceResult[];
    tier2Results: SourceResult[];
    tier3Results: SourceResult[];
    selectedComps: SourceResult[];
    weightedMedian: number;
    recencyDecayApplied: boolean;
  };
}

export interface PricingSourceUsed {
  sourceId: string;
  sourceName: string;
  enabled: boolean;
  compsReturned: number;
  finalWeight: number; // after all adjustments
}

export interface SourceResult {
  sourceId: string;
  price: number; // cents
  isSoldPrice: boolean;
  saleDate: Date;
  confidence: number; // 0.0-1.0
  comparabilityScore: number; // 0.0-1.0
  askingPriceAdjustment?: number; // 0.6 multiplier if asking price
  recencyDecayFactor?: number; // e^(-λt)
  sampleSizeBoost?: number; // log(n+1)
  finalWeight?: number; // after all adjustments
}

export interface SignalResult {
  isTrending: boolean;
  trendMultiplier: number;
  isBrandPremium: boolean;
  brandPremiumBrand?: string;
  depreciationRate?: number; // custom rate if SLOW_DEPRECIATION
  isSleeperDetected: boolean;
  sleeperCategory?: string;
  sleeperMultiplier?: number;
  isAppreciating: boolean;
}

export interface RawComp {
  price: number; // cents
  saleDate: Date;
  title: string;
  confidence: number; // 0-1
  comparabilityScore: number; // 0-1
  isSoldPrice?: boolean;
  externalListingId?: string;
  externalUrl?: string;
}

export interface FetchResult {
  success: boolean;
  comps: RawComp[];
  error?: string;
}
