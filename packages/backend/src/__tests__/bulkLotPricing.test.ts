/**
 * bulkLotPricing (ADR-136, roadmap #659). NOT executed when written (jest cannot run on the authoring device);
 * CI is the first real run. Pure functions, no database.
 *
 * Covers the money rules: the price of N cards at P cents per 1,000 is floor((N*P + 500) / 1000), half up to a whole cent,
 * rounded ONCE on the sale line; a line that rounds to 0 cents is refused; quantities and prices are validated.
 */
import {
  LADDER_STEPS,
  MAX_LOT_CARDS,
  MAX_PRICE_PER_THOUSAND_CENTS,
  buildPriceLadder,
  formatCardCount,
  formatCents,
  formatPerCardPrice,
  parseWholeNumber,
  priceCentsForCards,
  pricePerThousandCentsFromDollars,
  remainingCards,
} from '../services/bulkLot/bulkLotPricing';

const cents = (cards: number, p: number): number => {
  const r = priceCentsForCards(cards, p);
  if (!r.ok) throw new Error(`expected ok for ${cards} x ${p}, got ${r.code}`);
  return r.cents;
};

describe('priceCentsForCards: the register price of N cards', () => {
  it('prices the tenant example: 1,500 of 4,200 at $8.00 per 1,000 is $12.00', () => {
    expect(cents(1500, 800)).toBe(1200);
    expect(cents(4200, 800)).toBe(3360);
    expect(cents(1000, 800)).toBe(800);
  });

  it('rounds the total, never each card: $6.50 per 1,000', () => {
    expect(cents(1500, 650)).toBe(975); // exactly 975 cents, no rounding needed
    expect(cents(1, 650)).toBe(1); // 0.65 cent rounds up to 1
    expect(cents(3, 650)).toBe(2); // 1.95 cents rounds to 2
  });

  it('rounds exact half cents UP', () => {
    expect(cents(1, 500)).toBe(1); // 0.5 -> 1
    expect(cents(3, 500)).toBe(2); // 1.5 -> 2
    expect(cents(5, 500)).toBe(3); // 2.5 -> 3
    expect(cents(2, 500)).toBe(1); // exactly 1.0
  });

  it('refuses a line that rounds to zero cents (never a free sale)', () => {
    expect(priceCentsForCards(1, 1)).toEqual({ ok: false, code: 'QUANTITY_TOO_SMALL' });
    expect(priceCentsForCards(499, 1)).toEqual({ ok: false, code: 'QUANTITY_TOO_SMALL' });
    expect(priceCentsForCards(500, 1)).toEqual({ ok: true, cents: 1 });
  });

  it('rejects zero, negative, fractional, non-finite and oversized quantities', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_LOT_CARDS + 1]) {
      expect(priceCentsForCards(bad, 800)).toEqual({ ok: false, code: 'BAD_QUANTITY' });
    }
  });

  it('rejects zero, negative, fractional and oversized prices', () => {
    for (const bad of [0, -5, 1.5, Number.NaN, MAX_PRICE_PER_THOUSAND_CENTS + 1]) {
      expect(priceCentsForCards(100, bad)).toEqual({ ok: false, code: 'BAD_PRICE' });
    }
  });

  it('stays exact at the largest allowed quantity and price (no floating point drift)', () => {
    expect(cents(MAX_LOT_CARDS, MAX_PRICE_PER_THOUSAND_CENTS)).toBe(10_000_000_000);
    expect(cents(MAX_LOT_CARDS, 800)).toBe(800_000);
  });

  it('is monotonic: more cards never cost less', () => {
    let last = 0;
    for (let n = 1; n <= 3000; n += 7) {
      const r = priceCentsForCards(n, 937);
      const c = r.ok ? r.cents : 0;
      expect(c).toBeGreaterThanOrEqual(last);
      last = c;
    }
  });
});

describe('pricePerThousandCentsFromDollars', () => {
  it('converts dollars to integer cents once', () => {
    expect(pricePerThousandCentsFromDollars(8)).toBe(800);
    expect(pricePerThousandCentsFromDollars(19.99)).toBe(1999);
    expect(pricePerThousandCentsFromDollars(0.01)).toBe(1);
    expect(pricePerThousandCentsFromDollars(100000)).toBe(MAX_PRICE_PER_THOUSAND_CENTS);
  });

  it('returns null for anything that is not a usable positive price', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '8', null, undefined, 0.004, 100000.01]) {
      expect(pricePerThousandCentsFromDollars(bad)).toBeNull();
    }
  });
});

describe('parseWholeNumber', () => {
  it('accepts whole numbers and digit strings with commas and spaces', () => {
    expect(parseWholeNumber(1500)).toBe(1500);
    expect(parseWholeNumber('1,500')).toBe(1500);
    expect(parseWholeNumber(' 4 200 ')).toBe(4200);
    expect(parseWholeNumber('0')).toBe(0);
  });

  it('rejects decimals, exponents, signs, booleans, null and long strings', () => {
    for (const bad of ['1.5', '1e3', '-5', '+5', 'abc', '', '1234567890', true, null, undefined, 1.5, Number.NaN, 9007199254740993, {}]) {
      expect(parseWholeNumber(bad)).toBeNull();
    }
  });
});

describe('remainingCards', () => {
  it('is total minus sold and never negative', () => {
    expect(remainingCards(4200, 0)).toBe(4200);
    expect(remainingCards(4200, 1500)).toBe(2700);
    expect(remainingCards(10, 15)).toBe(0);
  });
  it('treats a null total as 1, like itemStockService', () => {
    expect(remainingCards(null, null)).toBe(1);
    expect(remainingCards(undefined, 0)).toBe(1);
    expect(remainingCards(null, 1)).toBe(0);
  });
});

describe('formatting', () => {
  it('formats counts with commas', () => {
    expect(formatCardCount(4200)).toBe('4,200');
    expect(formatCardCount(999)).toBe('999');
    expect(formatCardCount(1_000_000)).toBe('1,000,000');
  });
  it('formats cents as dollars', () => {
    expect(formatCents(1200)).toBe('$12.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(-250)).toBe('-$2.50');
  });
  it('shows an informational per-card price', () => {
    expect(formatPerCardPrice(800)).toBe('$0.008');
    expect(formatPerCardPrice(1000)).toBe('$0.01');
    expect(formatPerCardPrice(10000)).toBe('$0.10');
    expect(formatPerCardPrice(100000)).toBe('$1.00');
    expect(formatPerCardPrice(0)).toBe('$0.00');
  });
});

describe('buildPriceLadder', () => {
  it('lists each step that fits, then an "all remaining" row', () => {
    const rows = buildPriceLadder(800, 4200);
    expect(rows.map((r) => [r.cards, r.cents, r.isAll])).toEqual([
      [100, 80, false],
      [500, 400, false],
      [1000, 800, false],
      [2500, 2000, false],
      [4200, 3360, true],
    ]);
  });
  it('marks the step that equals the remaining stock as the all row, with no duplicate', () => {
    const rows = buildPriceLadder(800, 1000);
    expect(rows.map((r) => [r.cards, r.isAll])).toEqual([
      [100, false],
      [500, false],
      [1000, true],
    ]);
  });
  it('shows only the all row when stock is below the smallest step', () => {
    expect(buildPriceLadder(800, 50)).toEqual([{ cards: 50, cents: 40, isAll: true }]);
  });
  it('is empty when nothing is left', () => {
    expect(buildPriceLadder(800, 0)).toEqual([]);
  });
  it('drops rows that would round to zero cents', () => {
    const rows = buildPriceLadder(1, 4200);
    expect(rows[0].cards).toBe(500);
    expect(rows.every((r) => r.cents >= 1)).toBe(true);
    expect(rows[rows.length - 1]).toEqual({ cards: 4200, cents: 4, isAll: true });
  });
  it('uses the shared step list by default', () => {
    expect(LADDER_STEPS).toEqual([100, 500, 1000, 2500, 5000]);
  });
});
