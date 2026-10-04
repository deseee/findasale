/**
 * gradeFactor (item editor unification, Wave 1.0A, B3). NOT EXECUTED when written (jest cannot run on the
 * authoring device); CI is the first real run. Pure functions, no mocks needed.
 */
import { GRADE_FACTORS, applyGradeFactor, gradeFactorFor } from '../gradeFactor';

describe('GRADE_FACTORS', () => {
  it('is the disclosed table', () => {
    expect({ ...GRADE_FACTORS }).toEqual({ A: 1.1, B: 1.0, C: 0.85, D: 0.65 });
  });
});

describe('gradeFactorFor', () => {
  it.each([
    ['A', 1.1],
    ['B', 1.0],
    ['C', 0.85],
    ['D', 0.65],
  ] as Array<[string, number]>)('USED grade %s -> factor %p, applied', (grade: string, factor: number) => {
    expect(gradeFactorFor('USED', grade)).toEqual({ factor, applied: true, grade });
  });

  it('treats grade S as A for used goods', () => {
    expect(gradeFactorFor('USED', 'S')).toEqual({ factor: 1.1, applied: true, grade: 'A' });
  });

  it('is case-insensitive and trims the grade', () => {
    expect(gradeFactorFor('USED', ' c ')).toEqual({ factor: 0.85, applied: true, grade: 'C' });
  });

  it('NEW, REFURBISHED and PARTS_OR_REPAIR get factor 1, not applied, whatever the grade', () => {
    for (const condition of ['NEW', 'REFURBISHED', 'PARTS_OR_REPAIR']) {
      for (const grade of ['S', 'A', 'B', 'C', 'D', null]) {
        expect(gradeFactorFor(condition, grade)).toEqual({ factor: 1, applied: false });
      }
    }
  });

  it('recognizes legacy spellings of the non-graded conditions', () => {
    expect(gradeFactorFor('new_other', 'D')).toEqual({ factor: 1, applied: false });
    expect(gradeFactorFor('SELLER_REFURBISHED', 'A')).toEqual({ factor: 1, applied: false });
    expect(gradeFactorFor('POOR', 'A')).toEqual({ factor: 1, applied: false });
  });

  it('missing or unknown grade gives factor 1, not applied', () => {
    for (const grade of [null, undefined, '', '  ', 'Z', 'AA', 'good']) {
      expect(gradeFactorFor('USED', grade)).toEqual({ factor: 1, applied: false });
    }
  });

  it('a null or unknown condition is decided by the grade (used-goods path)', () => {
    expect(gradeFactorFor(null, 'D')).toEqual({ factor: 0.65, applied: true, grade: 'D' });
    expect(gradeFactorFor(undefined, 'B')).toEqual({ factor: 1, applied: true, grade: 'B' });
    expect(gradeFactorFor('SOMETHING_ELSE', 'A')).toEqual({ factor: 1.1, applied: true, grade: 'A' });
    expect(gradeFactorFor(null, null)).toEqual({ factor: 1, applied: false });
  });

  it('a legacy LIKE_NEW condition supplies grade A only when no grade is stored', () => {
    expect(gradeFactorFor('LIKE_NEW', null)).toEqual({ factor: 1.1, applied: true, grade: 'A' });
    expect(gradeFactorFor('LIKE_NEW', 'C')).toEqual({ factor: 0.85, applied: true, grade: 'C' });
  });

  it('returns a fresh object each call (callers cannot corrupt shared state)', () => {
    const first = gradeFactorFor('NEW', 'A');
    first.factor = 99;
    expect(gradeFactorFor('NEW', 'A').factor).toBe(1);
  });
});

describe('applyGradeFactor', () => {
  it('scales the estimate and the range by each grade factor (integer cents)', () => {
    const range = { low: 1000, high: 2000 };
    expect(applyGradeFactor(1500, range, 1.1)).toEqual({ estimate: 1650, range: { low: 1100, high: 2200 } });
    expect(applyGradeFactor(1500, range, 1.0)).toEqual({ estimate: 1500, range: { low: 1000, high: 2000 } });
    expect(applyGradeFactor(1500, range, 0.85)).toEqual({ estimate: 1275, range: { low: 850, high: 1700 } });
    expect(applyGradeFactor(1500, range, 0.65)).toEqual({ estimate: 975, range: { low: 650, high: 1300 } });
  });

  it('keeps low <= estimate <= high for every grade factor', () => {
    const range = { low: 3500, high: 4500 };
    for (const factor of [GRADE_FACTORS.A, GRADE_FACTORS.B, GRADE_FACTORS.C, GRADE_FACTORS.D]) {
      const out = applyGradeFactor(3999, range, factor);
      expect(out.range.low).toBeLessThanOrEqual(out.estimate);
      expect(out.estimate).toBeLessThanOrEqual(out.range.high);
    }
  });

  it('widens the range (never moves the estimate) when the input estimate is below its range', () => {
    // The B3 bug shape: trend multiplier lowered the estimate (3999 x 0.85 = 3399) but the range came from raw comps.
    const out = applyGradeFactor(3399, { low: 3500, high: 4500 }, 1);
    expect(out.estimate).toBe(3399);
    expect(out.range).toEqual({ low: 3399, high: 4500 });
  });

  it('widens the range upward when the input estimate is above its range', () => {
    const out = applyGradeFactor(5000, { low: 3500, high: 4500 }, 1);
    expect(out.estimate).toBe(5000);
    expect(out.range).toEqual({ low: 3500, high: 5000 });
  });

  it('swaps a reversed range', () => {
    const out = applyGradeFactor(1500, { low: 2000, high: 1000 }, 1);
    expect(out.range).toEqual({ low: 1000, high: 2000 });
  });

  it('rounds to whole cents by default', () => {
    // 999 x 0.85 = 849.15 -> 849; 1001 x 0.85 = 850.85 -> 851
    const out = applyGradeFactor(999, { low: 999, high: 1001 }, 0.85);
    expect(out.estimate).toBe(849);
    expect(out.range).toEqual({ low: 849, high: 851 });
    expect(Number.isInteger(out.estimate)).toBe(true);
  });

  it('can round to 2 decimals for dollar amounts', () => {
    const out = applyGradeFactor(9.99, { low: 8.5, high: 12.34 }, 0.85, { decimals: 2 });
    expect(out.estimate).toBe(8.49);
    expect(out.range).toEqual({ low: 7.23, high: 10.49 });
  });

  it('clamps and floors the decimals option', () => {
    expect(applyGradeFactor(100, { low: 100, high: 100 }, 1.01, { decimals: -3 }).estimate).toBe(101);
    expect(applyGradeFactor(100, { low: 100, high: 100 }, 1, { decimals: Number.NaN }).estimate).toBe(100);
  });

  it('treats a factor that is NaN, zero, negative or infinite as 1', () => {
    for (const bad of [Number.NaN, 0, -1.1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(applyGradeFactor(1500, { low: 1000, high: 2000 }, bad)).toEqual({
        estimate: 1500,
        range: { low: 1000, high: 2000 },
      });
    }
    expect(applyGradeFactor(1500, { low: 1000, high: 2000 }, undefined as unknown as number).estimate).toBe(1500);
  });

  it('never returns a negative or non-finite number for a bad estimate', () => {
    for (const bad of [Number.NaN, -500, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const out = applyGradeFactor(bad, { low: 100, high: 200 }, 1.1);
      expect(out.estimate).toBe(0);
      expect(out.range.low).toBe(0);
      expect(out.range.high).toBe(220);
      expect(out.range.low).toBeLessThanOrEqual(out.estimate);
    }
  });

  it('collapses a missing or invalid range onto the estimate', () => {
    expect(applyGradeFactor(1000, null, 1.1)).toEqual({ estimate: 1100, range: { low: 1100, high: 1100 } });
    expect(applyGradeFactor(1000, undefined, 1)).toEqual({ estimate: 1000, range: { low: 1000, high: 1000 } });
    expect(applyGradeFactor(1000, { low: Number.NaN, high: Number.NaN }, 1)).toEqual({
      estimate: 1000,
      range: { low: 1000, high: 1000 },
    });
  });

  it('floors a negative range bound at zero without breaking the invariant', () => {
    const out = applyGradeFactor(1000, { low: -50, high: 2000 }, 1);
    expect(out.range.low).toBe(0);
    expect(out.range.low).toBeLessThanOrEqual(out.estimate);
    expect(out.range.high).toBe(2000);
  });

  it('handles a zero estimate', () => {
    expect(applyGradeFactor(0, { low: 0, high: 0 }, 0.65)).toEqual({ estimate: 0, range: { low: 0, high: 0 } });
  });

  it('does not mutate the input range', () => {
    const range = { low: 1000, high: 2000 };
    applyGradeFactor(1500, range, 0.65);
    expect(range).toEqual({ low: 1000, high: 2000 });
  });
});
