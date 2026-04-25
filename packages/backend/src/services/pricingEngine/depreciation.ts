/**
 * Depreciation Module — Category-based depreciation curves
 * Phase 1: Exponential and linear curves
 */

import { SourceResult } from './types';
import prisma from '@findasale/database';

export interface DepreciationCurve {
  category: string;
  baseAgeYears: number;
  baseRetentionRate: number;
  curve: 'EXPONENTIAL' | 'LINEAR' | 'STEPPED';
  minRetentionRate: number;
}

/**
 * Get depreciation curve for a category
 */
export async function getDepreciationCurve(
  category: string
): Promise<DepreciationCurve | null> {
  const curve = await prisma.categoryDepreciation.findUnique({
    where: { category },
  });

  if (!curve) return null;

  return {
    category: curve.category,
    baseAgeYears: curve.baseAgeYears,
    baseRetentionRate: curve.baseRetentionRate,
    curve: curve.curve as 'EXPONENTIAL' | 'LINEAR' | 'STEPPED',
    minRetentionRate: curve.minRetentionRate,
  };
}

/**
 * Apply depreciation to a comp price based on age and category
 * If saleDate is provided, depreciate from that date
 * If not provided, assume item is new/current
 */
export function applyDepreciation(
  results: SourceResult[],
  itemAcquiredDate: Date,
  category: string,
  curve?: DepreciationCurve
): SourceResult[] {
  if (!curve) return results;

  const ageInYears = getItemAge(itemAcquiredDate);

  return results.map(result => {
    // Comps from recent sales might also need depreciation if they're old
    // But typically we use the comp price as-is and depreciate from current date
    // This function is meant to depreciate the comp's reference price backward
    // to account for how much value the item has lost since the comp sale

    const compAgeYears = getItemAge(result.saleDate);
    const retentionRate = calculateRetentionRate(compAgeYears, curve);

    // Apply retention rate: new_price = original_price * retention_rate
    result.price = Math.round(result.price * retentionRate);

    return result;
  });
}

/**
 * Calculate retention rate for a given age using the curve
 */
function calculateRetentionRate(ageYears: number, curve: DepreciationCurve): number {
  if (ageYears <= 0) return 1.0;

  let rate: number;

  if (curve.curve === 'LINEAR') {
    // Linear: retention = base - (base - min) * (age / reference_age)
    const decline = curve.baseRetentionRate - curve.minRetentionRate;
    rate = curve.baseRetentionRate - decline * (ageYears / curve.baseAgeYears);
  } else if (curve.curve === 'STEPPED') {
    // Stepped: decay faster in early years, slower later
    const steps = [
      { year: 0.5, rate: 0.95 },
      { year: 1, rate: curve.baseRetentionRate },
      { year: 2, rate: curve.baseRetentionRate * 0.85 },
      { year: 5, rate: curve.baseRetentionRate * 0.65 },
      { year: 10, rate: curve.baseRetentionRate * 0.40 },
    ];

    for (let i = 0; i < steps.length; i++) {
      if (ageYears <= steps[i].year) {
        if (i === 0) return steps[i].rate;

        const prevStep = steps[i - 1];
        const currStep = steps[i];
        const fraction =
          (ageYears - prevStep.year) / (currStep.year - prevStep.year);

        rate = prevStep.rate + (currStep.rate - prevStep.rate) * fraction;
        break;
      }
    }

    if (ageYears > steps[steps.length - 1].year) {
      rate = curve.minRetentionRate;
    }
  } else {
    // EXPONENTIAL (default): e^(-k * age)
    // Calibrate k so that at baseAgeYears, we get baseRetentionRate
    const k = -Math.log(curve.baseRetentionRate) / curve.baseAgeYears;
    rate = Math.exp(-k * ageYears);
  }

  // Apply floor
  return Math.max(rate, curve.minRetentionRate);
}

/**
 * Get item age in years from acquisition date to now
 */
function getItemAge(acquiredDate: Date): number {
  const now = Date.now();
  const ageMs = now - acquiredDate.getTime();
  return ageMs / (1000 * 60 * 60 * 24 * 365.25);
}

/**
 * Apply condition factor to a price
 * Conditions: NEW, USED, REFURBISHED, PARTS_OR_REPAIR
 */
export function applyConditionFactor(
  price: number,
  condition: string | undefined
): number {
  if (!condition) return price;

  const factors: Record<string, number> = {
    NEW: 1.0,
    'LIKE_NEW': 0.95,
    REFURBISHED: 0.85,
    USED: 0.70,
    'FAIR': 0.50,
    'PARTS_OR_REPAIR': 0.30,
  };

  const factor = factors[condition.toUpperCase()] ?? 0.70;
  return Math.round(price * factor);
}
