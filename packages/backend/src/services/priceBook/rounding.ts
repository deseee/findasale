/**
 * Integer cent arithmetic and the rounding modes of ADR-140 section 6.5. Pure: no clock, no env, no imports besides types.
 *
 * TIERED is implemented here on its own (not imported from cardPriceSuggestionService) so the price book engine has no
 * dependency on the legacy service; a parity test proves TIERED with direction NEAREST equals roundSuggestedCents for
 * every cent from 0 to 20,000.
 */
import type { RoundingDirection, RoundingMode } from './vocabulary';

/** Half up integer division of a non-negative numerator by a positive denominator. */
export function roundHalfUp(numerator: number, denominator: number): number {
  if (!(numerator > 0) || !(denominator > 0)) return 0;
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** cents x bps / 10000, half up. 10000 bps is 100 percent. */
export function mulBps(cents: number, bps: number): number {
  return roundHalfUp(cents * bps, 10000);
}

/** Step of the TIERED mode for an unrounded value: 5 cents under $5.00, 25 cents up to $50.00, 100 cents above. */
export function tieredStepCents(cents: number): number {
  const safe = Math.max(0, cents);
  if (safe < 500) return 5;
  if (safe <= 5000) return 25;
  return 100;
}

export interface RoundResult {
  cents: number;
  /** The grid spacing used, for the plain words label. Null for NONE. */
  stepCents: number | null;
}

/**
 * Candidates are base + k * step for k >= 0. A value at or below the base gives the base (the mode minimum).
 * NEAREST rounds half up; UP is the ceiling; DOWN is the floor but never below the base.
 */
function snap(value: number, base: number, step: number, direction: RoundingDirection): number {
  if (value <= base) return base;
  const k = Math.floor((value - base) / step);
  const lo = base + k * step;
  if (value === lo) return lo;
  const hi = lo + step;
  if (direction === 'UP') return hi;
  if (direction === 'DOWN') return lo;
  return (value - lo) * 2 >= step ? hi : lo;
}

export function roundCents(cents: number, mode: RoundingMode, direction: RoundingDirection): RoundResult {
  const value = Math.max(0, Math.round(Number.isFinite(cents) ? cents : 0));
  switch (mode) {
    case 'NONE':
      return { cents: value, stepCents: null };
    case 'TIERED': {
      const step = tieredStepCents(value);
      return { cents: Math.max(5, snap(value, 0, step, direction)), stepCents: step };
    }
    case 'NEAREST_5C':
      return { cents: snap(value, 0, 5, direction), stepCents: 5 };
    case 'NEAREST_25C':
      return { cents: snap(value, 0, 25, direction), stepCents: 25 };
    case 'NEAREST_DOLLAR':
      return { cents: snap(value, 0, 100, direction), stepCents: 100 };
    case 'ENDING_99':
      return { cents: snap(value, 99, 100, direction), stepCents: 100 };
    case 'KEYSTONE_49_99':
      return { cents: snap(value, 49, 50, direction), stepCents: 50 };
    default:
      return { cents: value, stepCents: null };
  }
}
