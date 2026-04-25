/**
 * Pricing Engine Orchestrator — 15-step pricing cascade
 * Phase 1: Core logic, tier-based fallback, result finalization
 */

import {
  PricingRequest,
  PricingResult,
  SignalResult,
  SourceResult,
} from './types';
import { analyzeItem } from './signals';
import { applyWeighting, calculateWeightedMedian, calculateConfidence } from './weighting';
import { getDepreciationCurve, applyDepreciation } from './depreciation';
import { adapterRegistry } from './adapters/registry';
import prisma from '@findasale/database';

/**
 * Main entry point: Estimate price for an item
 * Implements 15-step cascade as per spec
 */
export async function estimatePrice(request: PricingRequest): Promise<PricingResult> {
  // 1. Validate request
  if (!request.title && !request.category) {
    throw new Error('Title or category required for pricing estimate');
  }

  // 2. Analyze signals (trends, brand exceptions, sleepers)
  const signals = await analyzeItem(request);

  // 3. Get depreciation curve for category
  const depreciationCurve =
    request.category && !signals.isBrandPremium
      ? await getDepreciationCurve(request.category)
      : null;

  // 4. Fetch from Tier 1 sources
  const tier1Results = await fetchFromTier(1, request);

  if (tier1Results.length > 0) {
    return finalizeResult(
      tier1Results,
      1,
      request,
      signals,
      depreciationCurve,
      []
    );
  }

  // 5. Fetch from Tier 2 sources
  const tier2Results = await fetchFromTier(2, request);

  if (tier2Results.length > 0) {
    return finalizeResult(
      tier2Results,
      2,
      request,
      signals,
      depreciationCurve,
      []
    );
  }

  // 6. Fetch from Tier 3 sources (including Salvation Army baseline)
  let tier3Results = await fetchFromTier(3, request);

  if (tier3Results.length === 0) {
    // Absolute fallback: Salvation Army
    const saAdapter = adapterRegistry.getAdapter('salvationArmy');
    if (saAdapter) {
      tier3Results = await saAdapter.fetch(request);
    }
  }

  return finalizeResult(
    tier3Results,
    3,
    request,
    signals,
    depreciationCurve,
    []
  );
}

/**
 * Fetch comps from all enabled sources in a tier
 */
async function fetchFromTier(
  tier: 1 | 2 | 3,
  request: PricingRequest
): Promise<SourceResult[]> {
  const configs = await prisma.pricingSourceConfig.findMany({
    where: { tier, enabled: true },
  });

  const allResults: SourceResult[] = [];

  // Use Promise.allSettled so one failure doesn't crash the batch
  const promises = configs.map(config => {
    const adapter = adapterRegistry.getAdapter(config.sourceId);
    if (!adapter || !adapter.isConfigured()) {
      return Promise.resolve({ status: 'fulfilled' as const, value: [] });
    }

    return adapter
      .fetch(request)
      .then(results => ({ status: 'fulfilled' as const, value: results }))
      .catch(error => {
        console.error(`[${config.sourceId}] Fetch error:`, error);
        return { status: 'rejected' as const, reason: error };
      });
  });

  const results = await Promise.allSettled(promises);

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value.value) {
      allResults.push(...result.value.value);
    }
  }

  return allResults;
}

/**
 * Finalize pricing result with weighting, depreciation, confidence, and caching
 */
async function finalizeResult(
  results: SourceResult[],
  tier: 1 | 2 | 3,
  request: PricingRequest,
  signals: SignalResult,
  depreciationCurve: any,
  _debugInfo: any[]
): Promise<PricingResult> {
  if (results.length === 0) {
    // Return FLOOR confidence with minimum price
    return {
      estimatedPrice: 50, // $0.50 floor
      priceRange: { low: 50, high: 50 },
      confidence: 'FLOOR',
      tier: 3,
      sourcesConsulted: [],
      flags: {
        isTrending: false,
        trendMultiplierApplied: 1.0,
        isBrandPremium: false,
        isSleeperDetected: false,
        isAppreciating: false,
      },
      compsFound: 0,
      dataFreshness: new Date(),
    };
  }

  // 7. Apply weighting
  const weighted = applyWeighting(results, signals);

  // 8. Apply depreciation (unless brand exception)
  let pricedComps = weighted;
  if (!signals.isBrandPremium && depreciationCurve) {
    pricedComps = applyDepreciation(weighted, request.saleDate || new Date(), request.category, depreciationCurve);
  }

  // 9. Calculate weighted median
  const prices = pricedComps.map(p => p.price).sort((a, b) => a - b);
  const weights = pricedComps.map(p => p.finalWeight || 1.0);
  const median = calculateWeightedMedian(prices, weights);

  // 10. Apply trend multiplier
  let estimatedPrice = median;
  if (signals.isTrending) {
    estimatedPrice = Math.round(estimatedPrice * signals.trendMultiplier);
  }

  // 11. Apply sleeper multiplier
  if (signals.isSleeperDetected && signals.sleeperMultiplier) {
    estimatedPrice = Math.round(estimatedPrice * signals.sleeperMultiplier);
  }

  // 12. Calculate confidence
  const confidence = calculateConfidence(weighted, tier, signals);

  // 13. Build result
  const result: PricingResult = {
    estimatedPrice,
    priceRange: {
      low: Math.min(...prices),
      high: Math.max(...prices),
    },
    confidence,
    tier,
    sourcesConsulted: weighted.map(w => {
      const config = adapterRegistry.getAdapter(w.sourceId);
      return {
        sourceId: w.sourceId,
        sourceName: adapterRegistry.getSourceName(w.sourceId),
        enabled: true,
        compsReturned: results.filter(r => r.sourceId === w.sourceId).length,
        finalWeight: w.finalWeight || 0,
      };
    }),
    flags: {
      isTrending: signals.isTrending,
      trendMultiplierApplied: signals.trendMultiplier,
      isBrandPremium: signals.isBrandPremium,
      brandPremiumBrand: signals.brandPremiumBrand,
      isSleeperDetected: signals.isSleeperDetected,
      sleeperCategory: signals.sleeperCategory,
      isAppreciating: signals.isAppreciating,
    },
    deprecationCurveApplied: request.category,
    compsFound: weighted.length,
    dataFreshness: new Date(),
  };

  // 14. Cache result
  if (request.itemId) {
    await prisma.itemCompLookup.upsert({
      where: { itemId: request.itemId },
      update: {
        pricingResultJson: result,
        estimatedPrice: BigInt(result.estimatedPrice),
        priceConfidence: result.confidence,
        tierUsed: result.tier,
        sourcesConsulted: result.sourcesConsulted.map(s => s.sourceId),
        isTrending: result.flags.isTrending,
        trendMultiplier: result.flags.trendMultiplierApplied,
        isBrandPremium: result.flags.isBrandPremium,
        brandPremiumName: result.flags.brandPremiumBrand,
        isSleeperDetected: result.flags.isSleeperDetected,
        sleeperCategory: result.flags.sleeperCategory,
        isAppreciating: result.flags.isAppreciating,
        compsFound: result.compsFound,
        dataFreshness: result.dataFreshness,
      },
      create: {
        itemId: request.itemId,
        pricingResultJson: result,
        estimatedPrice: BigInt(result.estimatedPrice),
        priceConfidence: result.confidence,
        tierUsed: result.tier,
        sourcesConsulted: result.sourcesConsulted.map(s => s.sourceId),
        isTrending: result.flags.isTrending,
        trendMultiplier: result.flags.trendMultiplierApplied,
        isBrandPremium: result.flags.isBrandPremium,
        brandPremiumName: result.flags.brandPremiumBrand,
        isSleeperDetected: result.flags.isSleeperDetected,
        sleeperCategory: result.flags.sleeperCategory,
        isAppreciating: result.flags.isAppreciating,
        compsFound: result.compsFound,
        dataFreshness: result.dataFreshness,
      },
    });
  }

  // 15. Return result
  return result;
}
