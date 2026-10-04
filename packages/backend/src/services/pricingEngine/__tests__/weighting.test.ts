/**
 * Weighted median pairing (item editor unification, Wave 1D, B3). NOT EXECUTED when written (jest cannot run on
 * the authoring device); CI is the first real run. Pure functions, no mocks needed.
 *
 * Regression: the orchestrator used to sort `prices` and hand the still-unsorted `weights` to the median, so each
 * weight was matched to the wrong price.
 */
import { calculateWeightedMedian, calculateWeightedMedianFromPairs } from '../weighting';

describe('calculateWeightedMedianFromPairs', () => {
  it('returns 0 for no pairs and the price for a single pair', () => {
    expect(calculateWeightedMedianFromPairs([])).toBe(0);
    expect(calculateWeightedMedianFromPairs([{ price: 42, weight: 3 }])).toBe(42);
  });

  it('keeps each weight attached to its own price whatever order the pairs arrive in', () => {
    // Sorted by price: (10, 0.1), (20, 1), (100, 5). Total 6.1, target 3.05, crossed inside the 100 pair:
    // 20 + ((3.05 - 1.1) / 5) * (100 - 20) = 51.2
    const expected = 51.2;
    const a = calculateWeightedMedianFromPairs([
      { price: 10, weight: 0.1 },
      { price: 100, weight: 5 },
      { price: 20, weight: 1 },
    ]);
    const b = calculateWeightedMedianFromPairs([
      { price: 100, weight: 5 },
      { price: 20, weight: 1 },
      { price: 10, weight: 0.1 },
    ]);
    expect(a).toBeCloseTo(expected, 6);
    expect(b).toBeCloseTo(expected, 6);
  });

  it('does not mutate its input', () => {
    const input = [
      { price: 30, weight: 1 },
      { price: 10, weight: 1 },
    ];
    calculateWeightedMedianFromPairs(input);
    expect(input).toEqual([
      { price: 30, weight: 1 },
      { price: 10, weight: 1 },
    ]);
  });

  it('treats a missing, zero or non-finite weight as 1', () => {
    const withBadWeights = calculateWeightedMedianFromPairs([
      { price: 10, weight: 0 },
      { price: 20, weight: Number.NaN },
      { price: 30, weight: 1 },
    ]);
    const withOnes = calculateWeightedMedianFromPairs([
      { price: 10, weight: 1 },
      { price: 20, weight: 1 },
      { price: 30, weight: 1 },
    ]);
    expect(withBadWeights).toBe(withOnes);
  });
});

describe('calculateWeightedMedian (parallel arrays)', () => {
  it('pairs prices[i] with weights[i] in the order given, so UNSORTED parallel arrays give the paired answer', () => {
    expect(calculateWeightedMedian([10, 100, 20], [0.1, 5, 1])).toBeCloseTo(51.2, 6);
  });

  it('shows the old failure mode: sorting only the prices changes the answer (documents why the caller must not)', () => {
    const paired = calculateWeightedMedian([10, 100, 20], [0.1, 5, 1]);
    const priceOnlySorted = calculateWeightedMedian([10, 20, 100], [0.1, 5, 1]);
    expect(priceOnlySorted).toBeCloseTo(15.9, 6);
    expect(priceOnlySorted).not.toBeCloseTo(paired, 1);
  });

  it('returns 0 for empty input and the single price for one comp', () => {
    expect(calculateWeightedMedian([], [])).toBe(0);
    expect(calculateWeightedMedian([77], [9])).toBe(77);
  });
});
