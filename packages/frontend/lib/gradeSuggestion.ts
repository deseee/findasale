/**
 * Review page grade-click price suggestion (Wave 3, F3, B3 UI).
 *
 * Clicking a Condition Grade on a Review card asks the pricing engine for a what-if estimate. This module
 * holds the pure parts so they can be unit tested without React:
 *   - buildGradeEstimateBody: the POST /pricing/estimate body. It sends the item's REAL condition (normalized
 *     with lib/conditionModel.ts, never a grade label), the clicked grade as `conditionGrade`, and
 *     `persist: false` so the what-if estimate does not overwrite the saved estimate.
 *   - parseGradeEstimate: turns the response (cents) into a dollars suggestion, with the estimate guaranteed
 *     to sit inside its range, plus the disclosure line when the engine applied a grade factor.
 *   - gradeDisclosure / gradeSuggestionLine: the exact strings shown to the organizer.
 *
 * Nothing here writes a price. The suggestion is tap-to-apply only (the page's "Use $X" button).
 *
 * Pure module: only imports lib/conditionModel.ts. No React, no network.
 */

import { normalizeCondition } from './conditionModel';

export interface GradeEstimateInput {
  itemId: string;
  title: string;
  category: string;
  /** The item's condition as the card shows it (or the stored value). Normalized here. */
  condition: string | null | undefined;
  /** The grade the organizer just clicked. */
  grade: string;
  photoUrls?: string[] | null;
}

export interface GradeEstimateBody {
  itemId: string;
  title: string;
  category: string;
  condition?: string;
  conditionGrade: string;
  photoUrls?: string[];
  persist: false;
}

/**
 * Body for POST /pricing/estimate for a grade click. `condition` is the canonical condition (NEW, USED,
 * REFURBISHED, PARTS_OR_REPAIR) and is omitted when the stored value is blank or unrecognized, so the
 * engine never receives a grade label such as "excellent" in the condition field.
 */
export function buildGradeEstimateBody(input: GradeEstimateInput): GradeEstimateBody {
  const condition = normalizeCondition(input.condition).condition;
  const body: GradeEstimateBody = {
    itemId: input.itemId,
    title: input.title,
    category: input.category,
    conditionGrade: input.grade,
    persist: false,
  };
  if (condition) body.condition = condition;
  if (input.photoUrls && input.photoUrls.length > 0) body.photoUrls = input.photoUrls;
  return body;
}

/** The pricing engine's grade flags, all optional (older responses omit them). */
export interface GradeFlags {
  gradeFactorApplied?: boolean;
  gradeFactor?: number;
  gradeFactorGrade?: string;
}

/** Formats a multiplier without trailing zeros: 0.85 -> "0.85", 1.1 -> "1.1", 1 -> "1". */
export function formatGradeFactor(factor: number): string {
  return String(Number(factor.toFixed(2)));
}

/**
 * 'Adjusted for grade C (x0.85).' when the engine reports it applied a grade factor, otherwise null.
 * Needs a finite factor above zero and the grade the factor came from; without both there is nothing
 * truthful to say, so it returns null.
 */
export function gradeDisclosure(flags: GradeFlags | null | undefined): string | null {
  if (!flags || flags.gradeFactorApplied !== true) return null;
  const factor = Number(flags.gradeFactor);
  const grade = typeof flags.gradeFactorGrade === 'string' ? flags.gradeFactorGrade.trim() : '';
  if (!Number.isFinite(factor) || factor <= 0 || !grade) return null;
  return `Adjusted for grade ${grade} (x${formatGradeFactor(factor)}).`;
}

export interface GradeSuggestion {
  /** Suggested price in dollars. */
  price: number;
  /** Range in dollars with low <= price <= high, or null when the response carried no usable range. */
  range: { low: number; high: number } | null;
  /** Muted disclosure line, or null when no grade factor was applied. */
  disclosure: string | null;
}

/**
 * Turns a /pricing/estimate response (amounts in cents) into a suggestion, or null when there is nothing
 * worth offering: no response, FLOOR confidence (no real comps, a bare $0.49 reads as broken), or a missing
 * or non-positive estimate.
 *
 * The estimate must be inside its range. The engine already guarantees that, but this widens the range to
 * contain the estimate if a response ever arrives otherwise (the estimate itself is never moved), and swaps
 * a reversed range.
 */
export function parseGradeEstimate(data: any): GradeSuggestion | null {
  if (!data || typeof data !== 'object') return null;
  if (data.confidence === 'FLOOR') return null;
  const cents = Number(data.estimatedPrice);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  const price = Math.round(cents) / 100;
  if (!(price > 0)) return null;

  let range: GradeSuggestion['range'] = null;
  const rawLow = data.priceRange ? Number(data.priceRange.low) : NaN;
  const rawHigh = data.priceRange ? Number(data.priceRange.high) : NaN;
  if (Number.isFinite(rawLow) && Number.isFinite(rawHigh) && rawLow >= 0 && rawHigh >= 0) {
    const a = Math.round(rawLow) / 100;
    const b = Math.round(rawHigh) / 100;
    range = { low: Math.min(a, b, price), high: Math.max(a, b, price) };
  }

  return { price, range, disclosure: gradeDisclosure(data.flags) };
}

/**
 * The main suggestion sentence. Shows the range when there is one and it is wider than a single point:
 *   'New suggested price $38.49 (range $30.00 to $45.00). Use it?'
 *   'New suggested price $38.49. Use it?'
 */
export function gradeSuggestionLine(s: GradeSuggestion): string {
  const base = `New suggested price $${s.price.toFixed(2)}`;
  if (s.range && s.range.high > s.range.low) {
    return `${base} (range $${s.range.low.toFixed(2)} to $${s.range.high.toFixed(2)}). Use it?`;
  }
  return `${base}. Use it?`;
}
