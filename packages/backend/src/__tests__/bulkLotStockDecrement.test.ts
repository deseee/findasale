/**
 * Bulk lot quantity decrement (ADR-136, roadmap #659). NOT executed when written (jest cannot run on the authoring
 * device); CI is the first real run.
 *
 * A bulk lot sells through the SAME atomic path every channel uses, itemStockService.sellItemUnits(itemId, cards). This
 * suite drives that real function with a fake transaction client whose $executeRaw models the guarded UPDATE
 * ("stockSold + N <= COALESCE(stockTotal, 1)"). It proves the service logic around the guard: a partial sale leaves the lot
 * AVAILABLE, the last cards flip it to SOLD, an oversell is refused with InsufficientStockError, and two racing registers
 * can never both take the last cards. The SQL statement itself needs a real database; it is not exercised here.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));

import { InsufficientStockError, sellItemUnits } from '../services/itemStockService';

type Row = { stockTotal: number | null; stockSold: number; status: string };

function makeTx(rows: Record<string, Row>) {
  return {
    rows,
    $executeRaw: jest.fn(async (_strings: TemplateStringsArray, units: number, itemId: string) => {
      const row = rows[itemId];
      if (!row) return 0;
      if (row.stockSold + units <= (row.stockTotal ?? 1)) {
        row.stockSold += units; // the guarded UPDATE: capacity is re-checked in the same statement as the write
        return 1;
      }
      return 0;
    }),
    item: {
      findUnique: jest.fn(async ({ where }: any) => (rows[where.id] ? { stockTotal: rows[where.id].stockTotal, stockSold: rows[where.id].stockSold } : null)),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => ({ ...rows[where.id] })),
      update: jest.fn(async ({ where, data }: any) => Object.assign(rows[where.id], data)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = rows[where.id];
        if (!row || (where.status && row.status !== where.status)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
  };
}

const lot = (over: Partial<Row> = {}): Row => ({ stockTotal: 4200, stockSold: 0, status: 'AVAILABLE', ...over });

describe('selling cards from a bulk lot', () => {
  it('a partial sale (1,500 of 4,200) leaves the lot AVAILABLE with 2,700 left', async () => {
    const tx = makeTx({ lot1: lot() });
    const result = await sellItemUnits('lot1', 1500, tx as any);
    expect(result).toEqual({ fullySoldOut: false, remainingStock: 2700 });
    expect(tx.rows.lot1).toMatchObject({ stockSold: 1500, status: 'AVAILABLE' });
    expect(tx.item.update).not.toHaveBeenCalled();
  });

  it('selling the last cards marks the lot SOLD (sold-out state at zero)', async () => {
    const tx = makeTx({ lot1: lot({ stockSold: 1500 }) });
    const result = await sellItemUnits('lot1', 2700, tx as any);
    expect(result).toEqual({ fullySoldOut: true, remainingStock: 0 });
    expect(tx.rows.lot1).toMatchObject({ stockSold: 4200, status: 'SOLD' });
  });

  it('refuses to oversell by even one card, and changes nothing', async () => {
    const tx = makeTx({ lot1: lot({ stockSold: 4199 }) });
    await expect(sellItemUnits('lot1', 2, tx as any)).rejects.toBeInstanceOf(InsufficientStockError);
    expect(tx.rows.lot1.stockSold).toBe(4199);
    expect(tx.rows.lot1.status).toBe('AVAILABLE');
    await expect(sellItemUnits('lot1', 1, tx as any)).resolves.toMatchObject({ fullySoldOut: true });
  });

  it('a sold out lot refuses any further sale and the error says how many are left', async () => {
    const tx = makeTx({ lot1: lot({ stockSold: 4200, status: 'SOLD' }) });
    await expect(sellItemUnits('lot1', 1, tx as any)).rejects.toThrow(/only 0 remaining/);
  });

  it('two registers racing for the same cards: exactly one wins and stock is never oversold', async () => {
    const tx = makeTx({ lot1: lot() });
    const results = await Promise.allSettled([sellItemUnits('lot1', 3000, tx as any), sellItemUnits('lot1', 3000, tx as any)]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(InsufficientStockError);
    expect(tx.rows.lot1.stockSold).toBe(3000);
  });

  it('many small concurrent sales add up exactly and stop at the total', async () => {
    const tx = makeTx({ lot1: lot({ stockTotal: 1000 }) });
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => sellItemUnits('lot1', 100, tx as any)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2);
    expect(tx.rows.lot1).toMatchObject({ stockSold: 1000, status: 'SOLD' });
  });

  it('refuses zero, negative and fractional quantities before touching the database', async () => {
    const tx = makeTx({ lot1: lot() });
    for (const bad of [0, -5, 1.5, Number.NaN]) {
      await expect(sellItemUnits('lot1', bad, tx as any)).rejects.toThrow(/positive integer/);
    }
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('a missing item is a plain error, not an oversell', async () => {
    const tx = makeTx({});
    await expect(sellItemUnits('nope', 10, tx as any)).rejects.toThrow(/not found/);
  });
});
