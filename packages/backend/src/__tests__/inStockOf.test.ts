/**
 * inStockOf (2026-10-13, single inventory number): in stock = max(COALESCE(stockTotal, 1) - stockSold, 0).
 * Pure function, no mocks.
 */
import { inStockOf } from '../services/inventoryStockMath';

describe('inStockOf', () => {
  it('a null stockTotal counts as one unit', () => {
    expect(inStockOf({ stockTotal: null, stockSold: 0 })).toBe(1);
    expect(inStockOf({ stockTotal: null, stockSold: 1 })).toBe(0);
  });

  it('is stockTotal minus stockSold', () => {
    expect(inStockOf({ stockTotal: 5, stockSold: 2 })).toBe(3);
    expect(inStockOf({ stockTotal: 5, stockSold: 0 })).toBe(5);
    expect(inStockOf({ stockTotal: 1, stockSold: 0 })).toBe(1);
  });

  it('never goes below zero, even when more was sold than the total (legacy over-sell)', () => {
    expect(inStockOf({ stockTotal: 2, stockSold: 2 })).toBe(0);
    expect(inStockOf({ stockTotal: 2, stockSold: 5 })).toBe(0);
    expect(inStockOf({ stockTotal: 0, stockSold: 0 })).toBe(0);
  });

  it('a missing or non-numeric stockSold reads as zero sold instead of producing NaN', () => {
    expect(inStockOf({ stockTotal: 4 } as any)).toBe(4);
    expect(inStockOf({ stockTotal: 4, stockSold: NaN })).toBe(4);
    expect(Number.isNaN(inStockOf({} as any))).toBe(false);
  });
});
