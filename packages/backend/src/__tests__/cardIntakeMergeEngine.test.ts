import { MAX_STOCK_TOTAL, nextStockTotal } from '../services/cardIntake/mergeEngine';

describe('card intake merge engine: single in stock number', () => {
  it('ADD raises in stock by the file quantity (a null total counts as 1)', () => {
    expect(nextStockTotal('ADD', { stockTotal: 5, stockSold: 2 }, 3)).toBe(8);
    expect(nextStockTotal('ADD', { stockTotal: null, stockSold: 0 }, 2)).toBe(3);
  });

  it('REPLACE makes in stock exactly the file quantity', () => {
    const next = nextStockTotal('REPLACE', { stockTotal: 5, stockSold: 2 }, 4) as number;
    expect(next).toBe(6);
    expect(next - 2).toBe(4);
    expect(nextStockTotal('REPLACE', { stockTotal: 5, stockSold: 0 }, 3)).toBe(3);
  });

  it('REPLACE with quantity 0 leaves nothing in stock and keeps sold units', () => {
    expect(nextStockTotal('REPLACE', { stockTotal: 5, stockSold: 2 }, 0)).toBe(2);
  });

  it('REPLACE is idempotent', () => {
    const once = nextStockTotal('REPLACE', { stockTotal: 5, stockSold: 2 }, 4) as number;
    expect(nextStockTotal('REPLACE', { stockTotal: once, stockSold: 2 }, 4)).toBe(once);
  });

  it('returns null when the result is out of range (above the cap or negative)', () => {
    expect(nextStockTotal('REPLACE', { stockTotal: 1, stockSold: 5 }, MAX_STOCK_TOTAL)).toBeNull();
    expect(nextStockTotal('ADD', { stockTotal: MAX_STOCK_TOTAL, stockSold: 0 }, 1)).toBeNull();
    expect(nextStockTotal('REPLACE', { stockTotal: 1, stockSold: 0 }, -1)).toBeNull();
  });
});
