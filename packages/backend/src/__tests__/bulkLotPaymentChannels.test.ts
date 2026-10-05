/**
 * Bulk lots on every payment channel (ADR-136 Addendum A, roadmap #659): the shared building blocks.
 *
 * Covers, with no real database or network call:
 *   - sellItemUnitsInTransaction (itemStockService): the single guarded UPDATE ... RETURNING that takes cards inside a
 *     caller's transaction. A fake $queryRaw models the statement's guard, so partial sale, last cards, oversell, missing
 *     item and two racing sales are all proved. The SQL text itself needs a real database; its shape is asserted.
 *   - planBulkCart / planBulkRequestLines: ONE pricing rule for every channel (price once to integer cents per 1,000, line
 *     cents = floor((cards x P + 500) / 1000), 0-cent lines refused, one-cent PRICE_CHANGED), checked against an
 *     independent integer oracle and for parity between the cash/manual-card shape and the request/link shape.
 *   - stored lines (what a phone request or QR link keeps): sorted, JSON round trip, damaged entries dropped.
 *   - assertBulkLinesStillAvailable, sellBulkLinesInTransaction (item id order, error mapping), lockBulkSaleKey.
 *   - describeBulkSaleLine (receipt wording: cards and the price per 1,000).
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));

import { InsufficientStockError, sellItemUnitsInTransaction } from '../services/itemStockService';
import {
  assertBulkLinesStillAvailable,
  bulkLinesTotalCents,
  isBulkLotError,
  lockBulkSaleKey,
  parseBulkLineRequests,
  parseStoredBulkLines,
  planBulkCart,
  planBulkRequestLines,
  sellBulkLinesInTransaction,
  toBulkLineRecords,
} from '../services/bulkLot/bulkLotService';
import { describeBulkSaleLine } from '../services/bulkLot/bulkLotPricing';

// ---------------------------------------------------------------------------
// sellItemUnitsInTransaction
// ---------------------------------------------------------------------------

type Row = { stockTotal: number | null; stockSold: number; status: string };

function makeTx(rows: Record<string, Row>) {
  const statements: string[] = [];
  return {
    rows,
    statements,
    // Models: UPDATE "Item" SET stockSold = stockSold + n, status = CASE ... WHERE id AND stockSold + n <= COALESCE(stockTotal, 1) RETURNING ...
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, units: number, _unitsAgain: number, itemId: string, _unitsGuard: number) => {
      // the statement's values arrive in order: units (SET), units (CASE), item id (WHERE), units (guard)
      statements.push(strings.join('?'));
      const row = rows[itemId];
      if (!row) return [];
      const total = row.stockTotal ?? 1;
      if (row.stockSold + units > total) return [];
      row.stockSold += units;
      if (row.stockSold >= total) row.status = 'SOLD';
      else if (row.status === 'RESERVED' || row.status === 'INVOICE_ISSUED') row.status = 'AVAILABLE';
      return [{ stockTotal: row.stockTotal, stockSold: row.stockSold, status: row.status }];
    }),
    $executeRaw: jest.fn(),
    item: {
      findUnique: jest.fn(async ({ where }: any) => (rows[where.id] ? { stockTotal: rows[where.id].stockTotal, stockSold: rows[where.id].stockSold } : null)),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}
const lot = (over: Partial<Row> = {}): Row => ({ stockTotal: 4200, stockSold: 0, status: 'AVAILABLE', ...over });

describe('sellItemUnitsInTransaction', () => {
  it('a partial sale (1,500 of 4,200) leaves the lot AVAILABLE with 2,700 left, in one statement', async () => {
    const tx = makeTx({ lot1: lot() });
    const result = await sellItemUnitsInTransaction(tx as any, 'lot1', 1500);
    expect(result).toEqual({ fullySoldOut: false, remainingStock: 2700 });
    expect(tx.rows.lot1).toMatchObject({ stockSold: 1500, status: 'AVAILABLE' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    // One statement does the guard, the increment and the status change: no second write, no read-then-write.
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.item.update).not.toHaveBeenCalled();
    expect(tx.item.updateMany).not.toHaveBeenCalled();
    expect(tx.item.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('the statement keeps its capacity guard in the WHERE clause and returns the new counts', async () => {
    const tx = makeTx({ lot1: lot() });
    await sellItemUnitsInTransaction(tx as any, 'lot1', 10);
    const sql = tx.statements[0].replace(/\s+/g, ' ');
    expect(sql).toContain('UPDATE "Item"');
    expect(sql).toContain('"stockSold" + ? <= COALESCE("stockTotal", 1)');
    expect(sql).toContain('RETURNING "stockTotal", "stockSold", "status"');
    expect(sql).toContain("THEN 'SOLD'");
  });

  it('selling the last cards reports fullySoldOut and the lot is SOLD', async () => {
    const tx = makeTx({ lot1: lot({ stockSold: 1500 }) });
    const result = await sellItemUnitsInTransaction(tx as any, 'lot1', 2700);
    expect(result).toEqual({ fullySoldOut: true, remainingStock: 0 });
    expect(tx.rows.lot1).toMatchObject({ stockSold: 4200, status: 'SOLD' });
  });

  it('a partial sale of a lot that was RESERVED or INVOICE_ISSUED puts it back to AVAILABLE in the same statement', async () => {
    const tx = makeTx({ lot1: lot({ status: 'INVOICE_ISSUED' }) });
    await sellItemUnitsInTransaction(tx as any, 'lot1', 100);
    expect(tx.rows.lot1.status).toBe('AVAILABLE');
  });

  it('refuses to oversell by even one card, and changes nothing', async () => {
    const tx = makeTx({ lot1: lot({ stockSold: 4199 }) });
    await expect(sellItemUnitsInTransaction(tx as any, 'lot1', 2)).rejects.toBeInstanceOf(InsufficientStockError);
    expect(tx.rows.lot1.stockSold).toBe(4199);
    expect(tx.rows.lot1.status).toBe('AVAILABLE');
    await expect(sellItemUnitsInTransaction(tx as any, 'lot1', 1)).resolves.toMatchObject({ fullySoldOut: true });
  });

  it('a sold out lot refuses any further sale and says how many are left', async () => {
    const tx = makeTx({ lot1: lot({ stockSold: 4200, status: 'SOLD' }) });
    await expect(sellItemUnitsInTransaction(tx as any, 'lot1', 1)).rejects.toThrow(/only 0 remaining/);
  });

  it('two registers racing for the same cards: exactly one wins and stock is never oversold', async () => {
    const tx = makeTx({ lot1: lot() });
    const results = await Promise.allSettled([sellItemUnitsInTransaction(tx as any, 'lot1', 3000), sellItemUnitsInTransaction(tx as any, 'lot1', 3000)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(InsufficientStockError);
    expect(tx.rows.lot1.stockSold).toBe(3000);
  });

  it('refuses zero, negative and fractional quantities before touching the database', async () => {
    const tx = makeTx({ lot1: lot() });
    for (const bad of [0, -5, 1.5, Number.NaN]) {
      await expect(sellItemUnitsInTransaction(tx as any, 'lot1', bad)).rejects.toThrow(/positive integer/);
    }
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('a missing item is a plain error, not an oversell', async () => {
    const tx = makeTx({});
    const err = await sellItemUnitsInTransaction(tx as any, 'nope', 10).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(InsufficientStockError);
    expect(String(err.message)).toMatch(/not found/);
  });

  it('an ordinary single (null stockTotal counts as 1) sells once, then refuses', async () => {
    const tx = makeTx({ single1: { stockTotal: null, stockSold: 0, status: 'AVAILABLE' } });
    await expect(sellItemUnitsInTransaction(tx as any, 'single1', 1)).resolves.toEqual({ fullySoldOut: true, remainingStock: 0 });
    await expect(sellItemUnitsInTransaction(tx as any, 'single1', 1)).rejects.toBeInstanceOf(InsufficientStockError);
  });
});

// ---------------------------------------------------------------------------
// Pricing: one rule for every channel
// ---------------------------------------------------------------------------

const lotRow = (over: Record<string, unknown> = {}) => ({ price: 8, status: 'AVAILABLE', stockTotal: 4200, stockSold: 0, ...over });
const lotDb = (ids: string[]) => ({ itemBulkLot: { findMany: jest.fn(async () => ids.map((itemId) => ({ itemId }))) } }) as any;

/** Independent oracle: integer cents per 1,000 once, then half-up on the line, in integers only. */
function oracleCents(priceDollars: number, cards: number): number {
  const perThousand = Math.round(priceDollars * 100);
  return Math.floor((cards * perThousand + 500) / 1000);
}

describe('one pricing rule on every channel', () => {
  const cases: Array<[number, number]> = [
    [8, 1500],
    [8, 1],
    [8, 62],
    [8, 63],
    [8, 1001],
    [7.99, 1234],
    [12.5, 333],
    [0.99, 506],
    [0.99, 505],
    [25, 4200],
    [3.33, 999],
    [100, 1],
  ];

  it.each(cases)('price %p per 1,000, %p cards: the register shape and the request/link shape agree with the oracle', async (price, cards) => {
    const expected = oracleCents(price, cards);
    if (expected < 1) return; // covered by the zero-cent test below
    const row = lotRow({ price, stockTotal: 1_000_000 });
    const cart = await planBulkCart(lotDb(['lot1']), {
      lines: [{ itemId: 'lot1', quantity: cards, amount: expected / 100 }],
      itemRows: { lot1: row },
      flagOn: true,
    });
    const request = await planBulkRequestLines(lotDb(['lot1']), {
      itemIds: ['lot1'],
      bulkLines: [{ itemId: 'lot1', quantity: cards, amount: expected / 100 }],
      itemRows: { lot1: row },
      flagOn: true,
    });
    expect(cart.get('lot1')!.cents).toBe(expected);
    expect(request.get('lot1')!.cents).toBe(expected);
    expect(cart.get('lot1')!.cards).toBe(cards);
  });

  it('a line one cent off the server price is PRICE_CHANGED on both shapes', async () => {
    const row = lotRow();
    const off = 11.99;
    await expect(planBulkCart(lotDb(['lot1']), { lines: [{ itemId: 'lot1', quantity: 1500, amount: off }], itemRows: { lot1: row }, flagOn: true })).rejects.toMatchObject({ code: 'PRICE_CHANGED', status: 409 });
    await expect(
      planBulkRequestLines(lotDb(['lot1']), { itemIds: ['lot1'], bulkLines: [{ itemId: 'lot1', quantity: 1500, amount: off }], itemRows: { lot1: row }, flagOn: true })
    ).rejects.toMatchObject({ code: 'PRICE_CHANGED', status: 409 });
  });

  it('a quantity that rounds to zero cents is QUANTITY_TOO_SMALL on both shapes', async () => {
    const row = lotRow({ price: 0.01 });
    await expect(planBulkCart(lotDb(['lot1']), { lines: [{ itemId: 'lot1', quantity: 1 }], itemRows: { lot1: row }, flagOn: true })).rejects.toMatchObject({ code: 'QUANTITY_TOO_SMALL' });
    await expect(planBulkRequestLines(lotDb(['lot1']), { itemIds: ['lot1'], bulkLines: [{ itemId: 'lot1', quantity: 1 }], itemRows: { lot1: row }, flagOn: true })).rejects.toMatchObject({ code: 'QUANTITY_TOO_SMALL' });
  });

  it('a partial quantity (1,500 of 4,200) is priced, more than is left is INSUFFICIENT_STOCK', async () => {
    const row = lotRow();
    const ok = await planBulkRequestLines(lotDb(['lot1']), { itemIds: ['lot1'], bulkLines: [{ itemId: 'lot1', quantity: 1500 }], itemRows: { lot1: row }, flagOn: true });
    expect(ok.get('lot1')).toMatchObject({ cards: 1500, cents: 1200, pricePerThousandCents: 800 });
    await expect(planBulkRequestLines(lotDb(['lot1']), { itemIds: ['lot1'], bulkLines: [{ itemId: 'lot1', quantity: 4201 }], itemRows: { lot1: row }, flagOn: true })).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('a lot with no quantity line is BULK_QUANTITY_REQUIRED, never one unit', async () => {
    await expect(planBulkRequestLines(lotDb(['lot1']), { itemIds: ['lot1'], bulkLines: undefined, itemRows: { lot1: lotRow() }, flagOn: true })).rejects.toMatchObject({ code: 'BULK_QUANTITY_REQUIRED', status: 400 });
    await expect(planBulkCart(lotDb(['lot1']), { lines: [{ itemId: 'lot1' }], itemRows: { lot1: lotRow() }, flagOn: true })).rejects.toMatchObject({ code: 'BULK_QUANTITY_REQUIRED' });
  });

  it('a lot while the flag is off is BULK_DISABLED (so a lot is never sold as one unit), a quantity on a single is BULK_NOT_LOT', async () => {
    await expect(planBulkRequestLines(lotDb(['lot1']), { itemIds: ['lot1'], bulkLines: [{ itemId: 'lot1', quantity: 5 }], itemRows: { lot1: lotRow() }, flagOn: false })).rejects.toMatchObject({ code: 'BULK_DISABLED', status: 409 });
    await expect(planBulkRequestLines(lotDb([]), { itemIds: ['s1'], bulkLines: [{ itemId: 's1', quantity: 5 }], itemRows: { s1: lotRow() }, flagOn: true })).rejects.toMatchObject({ code: 'BULK_NOT_LOT' });
  });

  it('a cart with no lot returns no plans and a single costs nothing extra', async () => {
    const plans = await planBulkRequestLines(lotDb([]), { itemIds: ['s1'], bulkLines: undefined, itemRows: { s1: lotRow() }, flagOn: true });
    expect(plans.size).toBe(0);
  });

  it('two lots plus a single: both lots priced, the single untouched', async () => {
    const db = lotDb(['lotA', 'lotB']);
    const plans = await planBulkRequestLines(db, {
      itemIds: ['lotB', 's1', 'lotA'],
      bulkLines: [
        { itemId: 'lotA', quantity: 1500 },
        { itemId: 'lotB', quantity: 500, amount: 6 },
      ],
      itemRows: { lotA: lotRow(), lotB: lotRow({ price: 12, stockTotal: 1000 }), s1: lotRow({ price: 2.5, stockTotal: null }) },
      flagOn: true,
    });
    expect(Array.from(plans.keys()).sort()).toEqual(['lotA', 'lotB']);
    expect(bulkLinesTotalCents(toBulkLineRecords(plans))).toBe(1200 + 600);
  });

  it('the lookup failing with the flag on fails closed (BULK_CHECK_FAILED, 503); flag off fails open', async () => {
    const broken = { itemBulkLot: { findMany: jest.fn(async () => { throw new Error('relation does not exist'); }) } } as any;
    await expect(planBulkRequestLines(broken, { itemIds: ['x'], bulkLines: undefined, itemRows: { x: lotRow() }, flagOn: true })).rejects.toMatchObject({ code: 'BULK_CHECK_FAILED', status: 503 });
    const plans = await planBulkRequestLines(broken, { itemIds: ['x'], bulkLines: undefined, itemRows: { x: lotRow() }, flagOn: false });
    expect(plans.size).toBe(0);
  });
});

describe('parseBulkLineRequests', () => {
  it('absent means no lot lines', () => {
    expect(parseBulkLineRequests(undefined)).toEqual([]);
    expect(parseBulkLineRequests(null)).toEqual([]);
  });
  it('reads itemId, quantity and the optional amount', () => {
    expect(parseBulkLineRequests([{ itemId: 'a', quantity: '1,500'.replace(',', ''), amount: 12 }, { itemId: 'b', quantity: 3 }])).toEqual([
      { itemId: 'a', quantity: '1500', amount: 12 },
      { itemId: 'b', quantity: 3, amount: null },
    ]);
  });
  it('refuses a non-array, a duplicate item, a missing item id, a missing quantity and more than 200 lines', () => {
    for (const bad of ['x', {}, [{ itemId: 'a', quantity: 1 }, { itemId: 'a', quantity: 2 }], [{ quantity: 1 }], [null]]) {
      expect(() => parseBulkLineRequests(bad)).toThrow();
    }
    let code = '';
    try {
      parseBulkLineRequests([{ itemId: 'a' }]);
    } catch (e) {
      code = (e as any).code;
    }
    expect(code).toBe('BULK_QUANTITY_REQUIRED');
    expect(() => parseBulkLineRequests(Array.from({ length: 201 }, (_, i) => ({ itemId: `i${i}`, quantity: 1 })))).toThrow();
  });
  it('a line naming an item that is not in the request is BULK_VALIDATION', async () => {
    await expect(planBulkRequestLines(lotDb(['lot1']), { itemIds: ['lot1'], bulkLines: [{ itemId: 'other', quantity: 5 }], itemRows: { lot1: lotRow() }, flagOn: true })).rejects.toMatchObject({ code: 'BULK_VALIDATION', status: 400 });
  });
});

// ---------------------------------------------------------------------------
// Stored lines
// ---------------------------------------------------------------------------

describe('stored bulk lines (what a phone request or QR link keeps)', () => {
  it('records sorted by item id survive a JSON round trip unchanged', () => {
    const plans = new Map([
      ['lotB', { cards: 500, cents: 600, pricePerThousandCents: 1200 }],
      ['lotA', { cards: 1500, cents: 1200, pricePerThousandCents: 800 }],
    ]);
    const records = toBulkLineRecords(plans);
    expect(records.map((r) => r.itemId)).toEqual(['lotA', 'lotB']);
    expect(parseStoredBulkLines(JSON.parse(JSON.stringify(records)))).toEqual(records);
    expect(bulkLinesTotalCents(records)).toBe(1800);
  });

  it('a damaged or hostile value is dropped, never guessed at', () => {
    expect(parseStoredBulkLines(null)).toEqual([]);
    expect(parseStoredBulkLines('x')).toEqual([]);
    const parsed = parseStoredBulkLines([
      { itemId: 'ok', cards: 10, cents: 5 },
      { itemId: 'ok', cards: 20, cents: 9 }, // duplicate item
      { itemId: 'zero', cards: 0, cents: 5 },
      { itemId: 'frac', cards: 1.5, cents: 5 },
      { itemId: 'nocents', cards: 5 },
      { itemId: 'neg', cards: 5, cents: -1 },
      { itemId: 'huge', cards: 2_000_000, cents: 5 },
      { cards: 5, cents: 5 },
      null,
      'str',
    ]);
    expect(parsed).toEqual([{ itemId: 'ok', cards: 10, cents: 5 }]);
  });
});

// ---------------------------------------------------------------------------
// Right before money moves, and inside the transaction
// ---------------------------------------------------------------------------

describe('assertBulkLinesStillAvailable', () => {
  const fakeItems = (rows: Array<Record<string, unknown>>) => ({ item: { findMany: jest.fn(async () => rows) } }) as any;
  const line = { itemId: 'lot1', cards: 1500, cents: 1200 };

  it('passes when the cards are still there and does nothing for no lines', async () => {
    await expect(assertBulkLinesStillAvailable(fakeItems([{ id: 'lot1', status: 'AVAILABLE', stockTotal: 4200, stockSold: 2000 }]), [line])).resolves.toBeUndefined();
    const db = fakeItems([]);
    await assertBulkLinesStillAvailable(db, []);
    expect(db.item.findMany).not.toHaveBeenCalled();
  });
  it('refuses a lot that sold out, was removed or is no longer available (NOT_AVAILABLE, 409)', async () => {
    await expect(assertBulkLinesStillAvailable(fakeItems([{ id: 'lot1', status: 'SOLD', stockTotal: 4200, stockSold: 4200 }]), [line])).rejects.toMatchObject({ code: 'NOT_AVAILABLE', status: 409 });
    await expect(assertBulkLinesStillAvailable(fakeItems([]), [line])).rejects.toMatchObject({ code: 'NOT_AVAILABLE', status: 409 });
  });
  it('refuses when fewer cards are left than the line needs (INSUFFICIENT_STOCK, 409) and names the item', async () => {
    const err = await assertBulkLinesStillAvailable(fakeItems([{ id: 'lot1', status: 'AVAILABLE', stockTotal: 4200, stockSold: 3000 }]), [line]).catch((e) => e);
    expect(isBulkLotError(err)).toBe(true);
    expect(err).toMatchObject({ code: 'INSUFFICIENT_STOCK', status: 409 });
    expect(err.extra).toMatchObject({ itemId: 'lot1', remaining: 1200 });
  });
});

describe('sellBulkLinesInTransaction', () => {
  const lines = [
    { itemId: 'lotB', cards: 500, cents: 600 },
    { itemId: 'lotA', cards: 1500, cents: 1200 },
  ];

  it('takes the lots in item id order and returns each result', async () => {
    const order: string[] = [];
    const sell = jest.fn(async (_tx: any, id: string, cards: number) => {
      order.push(id);
      return { fullySoldOut: false, remainingStock: 1000 - cards };
    });
    const results = await sellBulkLinesInTransaction({} as any, lines, sell);
    expect(order).toEqual(['lotA', 'lotB']);
    expect(results.get('lotA')).toEqual({ fullySoldOut: false, remainingStock: -500 });
    expect(sell.mock.calls[0][2]).toBe(1500);
  });

  it('turns a sold out lot into INSUFFICIENT_STOCK carrying the item id, and stops there', async () => {
    const sell = jest.fn(async (_tx: any, id: string, cards: number) => {
      if (id === 'lotB') throw new InsufficientStockError(id, cards, 0);
      return { fullySoldOut: false, remainingStock: 5 };
    });
    const err = await sellBulkLinesInTransaction({} as any, lines, sell).catch((e) => e);
    expect(err).toMatchObject({ code: 'INSUFFICIENT_STOCK', status: 409 });
    expect(err.extra).toMatchObject({ itemId: 'lotB' });
  });

  it('turns a missing item into NOT_AVAILABLE and rethrows anything else unchanged', async () => {
    const missing = jest.fn(async () => { throw new Error('sellItemUnitsInTransaction: item lotA not found'); });
    await expect(sellBulkLinesInTransaction({} as any, lines, missing)).rejects.toMatchObject({ code: 'NOT_AVAILABLE', status: 409 });
    const boom = new Error('connection reset');
    const broken = jest.fn(async () => { throw boom; });
    await expect(sellBulkLinesInTransaction({} as any, lines, broken)).rejects.toBe(boom);
  });
});

describe('lockBulkSaleKey', () => {
  it('takes a transaction-scoped advisory lock on the business key', async () => {
    const tx = { $executeRaw: jest.fn(async () => 1) };
    await lockBulkSaleKey(tx as any, 'manual-card:sqpay_1');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, key] = tx.$executeRaw.mock.calls[0] as any[];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock(hashtext(?))');
    expect(key).toBe('manual-card:sqpay_1');
  });
});

describe('describeBulkSaleLine (receipt wording)', () => {
  it('shows the cards and the price per 1,000', () => {
    expect(describeBulkSaleLine('MTG commons', 1500, 800)).toBe('MTG commons: 1,500 cards at $8.00 per 1,000');
  });
  it('says "card" for one card, and leaves out the price when it is unknown', () => {
    expect(describeBulkSaleLine('Rares', 1)).toBe('Rares: 1 card');
    expect(describeBulkSaleLine('  ', 2500)).toBe('Bulk lot: 2,500 cards');
  });
  it('has no em dash, no "AI" and no "estate sale"', () => {
    const text = describeBulkSaleLine('MTG commons', 4200, 799);
    expect(/[—–]|\bAI\b|estate sale/i.test(text)).toBe(false);
  });
});
