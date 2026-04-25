/**
 * Weighting Model — Recency decay, sample size boost, weighted median
 * Phase 1: Core weighting calculations
 */

import { SourceResult, SignalResult } from './types';

/**
 * Apply all weighting adjustments to source results
 * Order: base weight → asking price → recency decay → sample size boost → trend multiplier
 */
export function applyWeighting(
  results: SourceResult[],
  signals: SignalResult
): SourceResult[] {
  return results.map(result => {
    let weight = 1.0;

    // 1. Base weight (confidence × comparability)
    weight *= result.confidence * result.comparabilityScore;

    // 2. Asking price adjustment
    if (!result.isSoldPrice) {
      weight *= 0.6; // 40% discount for asking→sold
      result.askingPriceAdjustment = 0.6;
    }

    // 3. Recency decay: e^(-λ × daysSinceSale)
    const daysSinceSale = (Date.now() - result.saleDate.getTime()) / (1000 * 60 * 60 * 24);
    let lambda = 0.03; // default: half-life ≈ 23 days

    // Faster decay for electronics, slower for collectibles
    if (daysSinceSale > 30) {
      lambda = 0.05; // accelerate decay for old comps
    }

    const recencyDecay = Math.exp(-lambda * daysSinceSale);
    weight *= recencyDecay;
    result.recencyDecayFactor = recencyDecay;

    // 4. Sample size boost: log(sampleSize + 1) / log(10 + 1)
    const sampleBoost = Math.log(result.sampleSize + 1) / Math.log(11);
    weight *= sampleBoost;
    result.sampleSizeBoost = sampleBoost;

    // 5. Trend multiplier (applied later in orchestrator)
    // Don't apply here; let orchestrator decide when to apply signals

    result.finalWeight = weight;
    return result;
  });
}

/**
 * Calculate weighted median
 * Sorts by price, accumulates weights, returns price at 50% weight threshold
 */
export function calculateWeightedMedian(
  prices: number[],
  weights: number[]
): number {
  if (prices.length === 0) return 0;
  if (prices.length === 1) return prices[0];

  // Pair prices with weights and sort by price
  const pairs = prices.map((price, i) => ({ price, weight: weights[i] || 1.0 }));
  pairs.sort((a, b) => a.price - b.price);

  // Calculate total weight
  const totalWeight = pairs.reduce((sum, p) => sum + p.weight, 0);
  const targetWeight = totalWeight / 2;

  // Accumulate weights until we reach 50%
  let accumulatedWeight = 0;
  for (let i = 0; i < pairs.length; i++) {
    accumulatedWeight += pairs[i].weight;
    if (accumulatedWeight >= targetWeight) {
      // Linear interpolation between this and previous point
      if (i === 0) {
        return pairs[i].price;
      }

      const prevWeight = accumulatedWeight - pairs[i].weight;
      const prevPrice = pairs[i - 1].price;
      const currPrice = pairs[i].price;

      const fraction = (targetWeight - prevWeight) / pairs[i].weight;
      return prevPrice + fraction * (currPrice - prevPrice);
    }
  }

  return pairs[pairs.length - 1].price;
}

/**
 * Calculate confidence level based on sources, tier, and signals
 */
export function calculateConfidence(
  results: SourceResult[],
  tier: 1 | 2 | 3,
  signals: SignalResult
): 'HIGH' | 'MEDIUM' | 'LOW' | 'FLOOR' {
  if (results.length === 0) return 'FLOOR';

  // Tier 1 with multiple high-confidence sources = HIGH
  if (tier === 1 && results.length >= 2) {
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    if (avgConfidence >= 0.85) return 'HIGH';
    if (avgConfidence >= 0.70) return 'MEDIUM';
  }

  // Tier 1 with single high-confidence source = MEDIUM
  if (tier === 1 && results.length === 1 && results[0].confidence >= 0.85) {
    return 'MEDIUM';
  }

  // Tier 2 = MEDIUM at best
  if (tier === 2) return 'MEDIUM';

  // Tier 3 = LOW or FLOOR
  if (tier === 3) {
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    return avgConfidence >= 0.50 ? 'LOW' : 'FLOOR';
  }

  return 'LOW';
}
