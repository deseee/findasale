/**
 * Price book rounding (ADR-140 section 6.5, acceptance AT-2).
 */
import { roundCents, roundHalfUp, mulBps, tieredStepCents } from '../services/priceBook/rounding';
import { roundSuggestedCents } from '../services/cardCatalog/cardPriceSuggestionService';
import { ROUNDING_DIRECTIONS, ROUNDING_MODES } from '../services/priceBook/vocabulary';

describe('integer helpers', () => {
  it('roundHalfUp rounds ties up and never goes negative', () => {
    expect(roundHalfUp(1, 2)).toBe(1);
    expect(roundHalfUp(1, 3)).toBe(0);
    expect(roundHalfUp(2, 3)).toBe(1);
    expect(roundHalfUp(5, 2)).toBe(3);
    expect(roundHalfUp(0, 7)).toBe(0);
    expect(roundHalfUp(-5, 2)).toBe(0);
    expect(roundHalfUp(5, 0)).toBe(0);
  });

  it('mulBps multiplies cents by basis points with a half up tie', () => {
    expect(mulBps(1140, 9000)).toBe(1026);
    expect(mulBps(1200, 9500)).toBe(1140);
    expect(mulBps(1, 5000)).toBe(1);
    expect(mulBps(3, 5000)).toBe(2);
    expect(mulBps(0, 9000)).toBe(0);
    expect(mulBps(100, 10000)).toBe(100);
  });

  it('tieredStepCents uses 5 under $5.00, 25 up to $50.00 and 100 above', () => {
    expect(tieredStepCents(0)).toBe(5);
    expect(tieredStepCents(499)).toBe(5);
    expect(tieredStepCents(500)).toBe(25);
    expect(tieredStepCents(5000)).toBe(25);
    expect(tieredStepCents(5001)).toBe(100);
  });
});

describe('AT-2 TIERED parity with the legacy roundSuggestedCents', () => {
  it('TIERED + NEAREST equals roundSuggestedCents for every integer cent from 0 to 20,000', () => {
    const mismatches: number[] = [];
    for (let c = 0; c <= 20000; c += 1) {
      if (roundCents(c, 'TIERED', 'NEAREST').cents !== roundSuggestedCents(c).cents) mismatches.push(c);
    }
    expect(mismatches).toEqual([]);
  });

  it('TIERED never returns less than 5 cents in any direction', () => {
    for (const direction of ROUNDING_DIRECTIONS) {
      for (let c = 0; c <= 12; c += 1) expect(roundCents(c, 'TIERED', direction).cents).toBeGreaterThanOrEqual(5);
    }
  });

  it('UP and DOWN never cross the step', () => {
    const bad: string[] = [];
    for (let c = 5; c <= 20000; c += 1) {
      const step = tieredStepCents(c);
      const up = roundCents(c, 'TIERED', 'UP').cents;
      const down = roundCents(c, 'TIERED', 'DOWN').cents;
      if (up < c || up - c >= step || up % step !== 0) bad.push(`up ${c} -> ${up}`);
      if (down > c || c - down >= step || down % step !== 0) bad.push(`down ${c} -> ${down}`);
    }
    expect(bad).toEqual([]);
  });

  it('the step reported is the tier step of the unrounded value', () => {
    expect(roundCents(498, 'TIERED', 'NEAREST')).toEqual({ cents: 500, stepCents: 5 });
    expect(roundCents(1026, 'TIERED', 'NEAREST')).toEqual({ cents: 1025, stepCents: 25 });
    expect(roundCents(5050, 'TIERED', 'NEAREST')).toEqual({ cents: 5100, stepCents: 100 });
  });
});

describe('AT-2 ENDING_99 and KEYSTONE_49_99', () => {
  // values: 0.30, 0.99, 1.00, 5.49, 5.50, 49.51, 100.00 as cents; expected [NEAREST, UP, DOWN]
  const ending99: Array<[number, number, number, number]> = [
    [30, 99, 99, 99],
    [99, 99, 99, 99],
    [100, 99, 199, 99],
    [549, 599, 599, 499],
    [550, 599, 599, 499],
    [4951, 4999, 4999, 4899],
    [10000, 9999, 10099, 9999],
  ];
  const keystone: Array<[number, number, number, number]> = [
    [30, 49, 49, 49],
    [99, 99, 99, 99],
    [100, 99, 149, 99],
    [549, 549, 549, 549],
    [550, 549, 599, 549],
    [4951, 4949, 4999, 4949],
    [10000, 9999, 10049, 9999],
  ];

  it.each(ending99)('ENDING_99 of %i cents gives %i / %i / %i', (cents, nearest, up, down) => {
    expect(roundCents(cents, 'ENDING_99', 'NEAREST').cents).toBe(nearest);
    expect(roundCents(cents, 'ENDING_99', 'UP').cents).toBe(up);
    expect(roundCents(cents, 'ENDING_99', 'DOWN').cents).toBe(down);
  });

  it.each(keystone)('KEYSTONE_49_99 of %i cents gives %i / %i / %i', (cents, nearest, up, down) => {
    expect(roundCents(cents, 'KEYSTONE_49_99', 'NEAREST').cents).toBe(nearest);
    expect(roundCents(cents, 'KEYSTONE_49_99', 'UP').cents).toBe(up);
    expect(roundCents(cents, 'KEYSTONE_49_99', 'DOWN').cents).toBe(down);
  });

  it('minimums: ENDING_99 never below 99 and KEYSTONE_49_99 never below 49', () => {
    for (const direction of ROUNDING_DIRECTIONS) {
      for (let c = 0; c <= 60; c += 1) {
        expect(roundCents(c, 'ENDING_99', direction).cents).toBeGreaterThanOrEqual(99);
        expect(roundCents(c, 'KEYSTONE_49_99', direction).cents).toBeGreaterThanOrEqual(49);
      }
    }
  });

  it('every result ends in 99 (or 49 for keystone) for a wide range', () => {
    for (let c = 0; c <= 30000; c += 37) {
      for (const direction of ROUNDING_DIRECTIONS) {
        expect(roundCents(c, 'ENDING_99', direction).cents % 100).toBe(99);
        expect([49, 99]).toContain(roundCents(c, 'KEYSTONE_49_99', direction).cents % 100);
      }
    }
  });
});

describe('fixed step modes and NONE', () => {
  it('NEAREST_5C, NEAREST_25C and NEAREST_DOLLAR honor the direction', () => {
    expect(roundCents(12, 'NEAREST_5C', 'NEAREST').cents).toBe(10);
    expect(roundCents(13, 'NEAREST_5C', 'NEAREST').cents).toBe(15);
    expect(roundCents(11, 'NEAREST_5C', 'UP').cents).toBe(15);
    expect(roundCents(14, 'NEAREST_5C', 'DOWN').cents).toBe(10);
    expect(roundCents(37, 'NEAREST_25C', 'NEAREST').cents).toBe(25);
    expect(roundCents(38, 'NEAREST_25C', 'NEAREST').cents).toBe(50);
    expect(roundCents(26, 'NEAREST_25C', 'UP').cents).toBe(50);
    expect(roundCents(49, 'NEAREST_25C', 'DOWN').cents).toBe(25);
    expect(roundCents(149, 'NEAREST_DOLLAR', 'NEAREST').cents).toBe(100);
    expect(roundCents(150, 'NEAREST_DOLLAR', 'NEAREST').cents).toBe(200);
    expect(roundCents(101, 'NEAREST_DOLLAR', 'UP').cents).toBe(200);
    expect(roundCents(199, 'NEAREST_DOLLAR', 'DOWN').cents).toBe(100);
  });

  it('values already on the grid never move', () => {
    for (const direction of ROUNDING_DIRECTIONS) {
      expect(roundCents(100, 'NEAREST_5C', direction).cents).toBe(100);
      expect(roundCents(225, 'NEAREST_25C', direction).cents).toBe(225);
      expect(roundCents(300, 'NEAREST_DOLLAR', direction).cents).toBe(300);
      expect(roundCents(1025, 'TIERED', direction).cents).toBe(1025);
    }
  });

  it('NONE returns the value unchanged and bad numbers become zero', () => {
    expect(roundCents(1234, 'NONE', 'UP')).toEqual({ cents: 1234, stepCents: null });
    expect(roundCents(-5, 'NONE', 'NEAREST').cents).toBe(0);
    expect(roundCents(Number.NaN, 'NONE', 'NEAREST').cents).toBe(0);
    expect(roundCents(Number.POSITIVE_INFINITY, 'NONE', 'NEAREST').cents).toBe(0);
  });

  it('every mode and direction returns a non negative integer', () => {
    for (const mode of ROUNDING_MODES) {
      for (const direction of ROUNDING_DIRECTIONS) {
        for (const c of [0, 1, 4, 5, 6, 49, 50, 99, 100, 499, 500, 4999, 5000, 5001, 123456]) {
          const r = roundCents(c, mode, direction).cents;
          expect(Number.isInteger(r) && r >= 0).toBe(true);
        }
      }
    }
  });
});
