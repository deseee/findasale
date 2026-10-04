/**
 * Condition grade factor for the price estimate (item editor unification, Wave 1.0A, B3, Patrick D1 default A).
 *
 * Deterministic and disclosed: A 1.10, B 1.00, C 0.85, D 0.65. The factor applies to used goods only. Items
 * whose condition is NEW, REFURBISHED or PARTS_OR_REPAIR get factor 1 and no grade adjustment. Grade S is
 * retired for used goods and treated as A. A missing or unknown grade gets factor 1 (not applied).
 *
 * Additive in Wave 1.0A: nothing calls this yet. The estimate orchestrator (Wave 1D) will apply it and report
 * flags.gradeFactorApplied. Pure, no side effects, no service imports (utils/conditionMapping is pure too).
 *
 * UNITS: the pricing engine works in integer CENTS (PricingResult.estimatedPrice and priceRange are cents), so
 * applyGradeFactor rounds to whole units by default (decimals = 0). Pass { decimals: 2 } for dollar amounts.
 * Charm pricing is NOT applied here: the orchestrator should charm-price and then re-assert the range
 * invariant, since charm rounding can move the estimate by a few cents.
 */

import { normalizeCondition, normalizeGrade } from '../../utils/conditionMapping';

export const GRADE_FACTORS = { A: 1.1, B: 1.0, C: 0.85, D: 0.65 } as const;
export type GradeFactorGrade = keyof typeof GRADE_FACTORS;

export type GradeFactorResult = {
  /** Multiplier to apply to the estimate and its range (1 when no grade factor applies). */
  factor: number;
  /** True when a grade of a priced (used-goods) item was recognized and consulted. Grade B is applied with factor 1. */
  applied: boolean;
  /** The grade the factor came from, after S is treated as A. Present only when applied. */
  grade?: GradeFactorGrade;
};

const NOT_APPLIED: GradeFactorResult = { factor: 1, applied: false };

/**
 * The grade factor for an item. Condition NEW, REFURBISHED and PARTS_OR_REPAIR (also legacy spellings, via
 * normalizeCondition) never take a grade factor. For used goods, or an unknown/missing condition, the grade
 * decides: S counts as A; a missing or unknown grade is not applied. A legacy LIKE_NEW or EXCELLENT condition
 * supplies grade A only when no grade is stored.
 */
export function gradeFactorFor(
  condition: string | null | undefined,
  grade: string | null | undefined,
): GradeFactorResult {
  const normalized = normalizeCondition(condition);
  if (
    normalized.condition === 'NEW' ||
    normalized.condition === 'REFURBISHED' ||
    normalized.condition === 'PARTS_OR_REPAIR'
  ) {
    return { ...NOT_APPLIED };
  }

  const effective = normalizeGrade(grade) ?? normalized.hintGrade ?? null;
  if (effective === null) return { ...NOT_APPLIED };

  const priced: GradeFactorGrade = effective === 'S' ? 'A' : effective;
  return { factor: GRADE_FACTORS[priced], applied: true, grade: priced };
}

export type PriceRange = { low: number; high: number };

export type AppliedGradeFactor = {
  estimate: number;
  range: PriceRange;
};

function nonNegativeFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
}

/**
 * Scales an estimate and its range by `factor`, rounds, and enforces low <= estimate <= high.
 *
 * Guards: a factor that is not a finite number above zero is treated as 1. A negative or non-finite estimate
 * becomes 0. A missing/non-finite range bound collapses to the estimate. A reversed range is swapped. If the
 * scaled estimate falls outside the scaled range (for example when the input range was computed from raw comps
 * while the estimate had a trend multiplier applied), the RANGE is widened to contain the estimate; the
 * estimate itself is never moved. Nothing returned is negative.
 *
 * `opts.decimals` (default 0, clamped to 0..6) is the rounding precision: 0 for integer cents.
 */
export function applyGradeFactor(
  estimate: number,
  range: PriceRange | null | undefined,
  factor: number,
  opts?: { decimals?: number },
): AppliedGradeFactor {
  const f = typeof factor === 'number' && Number.isFinite(factor) && factor > 0 ? factor : 1;

  const rawDecimals = opts?.decimals;
  const decimals =
    typeof rawDecimals === 'number' && Number.isFinite(rawDecimals)
      ? Math.min(6, Math.max(0, Math.floor(rawDecimals)))
      : 0;
  const unit = Math.pow(10, decimals);
  const round = (value: number): number => Math.round(value * unit) / unit;

  const baseEstimate = nonNegativeFinite(estimate) ?? 0;
  const scaledEstimate = round(baseEstimate * f);

  const rawLow = nonNegativeFinite(range?.low);
  const rawHigh = nonNegativeFinite(range?.high);
  let low = rawLow === null ? scaledEstimate : round(rawLow * f);
  let high = rawHigh === null ? scaledEstimate : round(rawHigh * f);
  if (low > high) {
    const swap = low;
    low = high;
    high = swap;
  }

  // Invariant: low <= estimate <= high, never negative.
  low = Math.max(0, Math.min(low, scaledEstimate));
  high = Math.max(high, scaledEstimate);

  return { estimate: scaledEstimate, range: { low, high } };
}
