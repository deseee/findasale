/**
 * Offline queued lot sales (ADR-136 Addendum B, roadmap #659): replay re-prices on the server and reports conflicts.
 *
 * WHAT THIS PROVES (lot of 10,000 cards at $8 per 1,000; 1,500 cards = $12.00):
 *   - a queued line that still sells as queued produces no conflict and the sale goes on to be recorded
 *   - a changed price, too few cards left, a hidden lot and a missing lot each come back as ONE entry per line with the
 *     server's price and the cards on hand, and the sale is refused before anything is recorded
 *   - the flag off refuses every lot line (BULK_DISABLED); a sale with no lot lines is not checked at all
 *   - a replay of a sale that was already recorded (same clientTransactionId) is not re-checked, so it correctly succeeds
 *     with fewer cards on hand and is never recorded twice
 *   - a failed lot lookup with the flag on is retryable (nothing recorded); a bulk code raised by the sale itself after the
 *     check is turned back into the per-line detail
 */
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    sale: { findUnique: jest.fn() },
    purchase: { findFirst: jest.fn() },
    item: { findMany: jest.fn() },
    itemBulkLot: { findMany: jest.fn() },
  },
}));
jest.mock('../controllers/cashPaymentController', () => {
  class CashSaleError extends Error {
    status: number;
    retryable: boolean;
    code: string;
    constructor(message: string, status: number, retryable: boolean, code: string) {
      super(message);
      this.status = status;
      this.retryable = retryable;
      this.code = code;
    }
  }
  return { processCashSaleCore: jest.fn(), CashSaleError };
});

import { prisma } from '../lib/prisma';
import { processCashSaleCore, CashSaleError } from '../controllers/cashPaymentController';
import { batchSync } from '../controllers/syncController';
import { BULK_CONFLICT_CODE, isBulkLineCode, previewOfflineBulkLines } from '../services/bulkLot/bulkLotOfflineService';
import { FakeDb } from './__fixtures__/bulkLotFollowupFakes';

const p: any = prisma;
const core: any = processCashSaleCore;

let db: FakeDb;
let lotId: string;

function wire(fake: FakeDb) {
  p.itemBulkLot.findMany.mockImplementation((a: any) => fake.itemBulkLot.findMany(a));
  p.item.findMany.mockImplementation((a: any) => fake.item.findMany(a));
  p.sale.findUnique.mockResolvedValue({ id: 'sale1', organizer: { id: 'org1', subscriptionTier: 'SIMPLE' } });
  p.purchase.findFirst.mockResolvedValue(null);
}

function req(items: any[], clientTransactionId = 'ctx-1') {
  return {
    user: { organizerProfile: true, organizer: { id: 'org1' } },
    body: {
      operations: [{ type: 'CHECKOUT_CASH', localId: 'local-1', saleId: 'sale1', timestamp: new Date().toISOString(), payload: { items, cashReceived: 100, clientTransactionId } }],
    },
  } as any;
}

async function run(r: any): Promise<{ status: number; body: any }> {
  let status = 200;
  let body: any;
  const res: any = { status: (s: number) => ((status = s), res), json: (b: any) => ((body = b), res) };
  await batchSync(r, res);
  return { status, body };
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.CARD_BULK_LOTS_ENABLED = 'true';
  db = new FakeDb();
  lotId = db.addLot({ stockTotal: 10000, stockSold: 0 }).id;
  wire(db);
  core.mockResolvedValue({ purchaseIds: ['pur1'], replay: false });
});

afterAll(() => {
  delete process.env.CARD_BULK_LOTS_ENABLED;
});

describe('previewOfflineBulkLines', () => {
  it('has no conflict for a line that still sells as queued', async () => {
    const r = await previewOfflineBulkLines(db as any, { items: [{ itemId: lotId, quantity: 1500, amount: 12 }], flagOn: true });
    expect(r).toEqual({ conflicts: [], lotLines: 1 });
  });

  it('reports a changed price with the server price and the cards on hand', async () => {
    db.item.rows[0].price = 10;
    const r = await previewOfflineBulkLines(db as any, { items: [{ itemId: lotId, quantity: 1500, amount: 12 }], flagOn: true });
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ itemId: lotId, code: 'PRICE_CHANGED', requestedCards: 1500, clientCents: 1200, expectedCents: 1500, remainingCards: 10000 });
  });

  it('reports too few cards, a hidden lot, and a missing quantity, one entry each', async () => {
    const low = db.addLot({ title: 'Low', stockTotal: 1000, stockSold: 900 });
    const hidden = db.addLot({ title: 'Hidden', status: 'HIDDEN' });
    const r = await previewOfflineBulkLines(db as any, {
      items: [{ itemId: low.id, quantity: 500, amount: 4 }, { itemId: hidden.id, quantity: 10 }, { itemId: lotId }, { itemId: 'plain-item', amount: 5 }],
      flagOn: true,
    });
    expect(r.lotLines).toBe(3);
    expect(r.conflicts.map((c) => [c.title, c.code])).toEqual([['Low', 'INSUFFICIENT_STOCK'], ['Hidden', 'NOT_AVAILABLE'], ['Commons', 'BULK_QUANTITY_REQUIRED']]);
    expect(r.conflicts[0].remainingCards).toBe(100);
  });

  it('refuses every lot line with the flag off and ignores plain item lines', async () => {
    const r = await previewOfflineBulkLines(db as any, { items: [{ itemId: lotId, quantity: 1 }, { itemId: 'plain', amount: 1 }], flagOn: false });
    expect(r.conflicts.map((c) => c.code)).toEqual(['BULK_DISABLED']);
    expect((await previewOfflineBulkLines(db as any, { items: [{ itemId: 'plain', amount: 1 }], flagOn: true })).lotLines).toBe(0);
  });

  it('recognises the codes a bulk line can fail with', () => {
    for (const c of ['PRICE_CHANGED', 'INSUFFICIENT_STOCK', 'NOT_AVAILABLE', 'BAD_QUANTITY', 'BULK_CONFLICT', 'BULK_DISABLED']) expect(isBulkLineCode(c)).toBe(true);
    for (const c of ['ITEM_UNAVAILABLE', 'VALIDATION', undefined, 5]) expect(isBulkLineCode(c as any)).toBe(false);
  });
});

describe('queued cash sale replay through batchSync', () => {
  it('records a queued lot sale that still holds', async () => {
    const { body } = await run(req([{ itemId: lotId, quantity: 1500, amount: 12 }]));
    expect(body.failed).toEqual([]);
    expect(body.synced).toHaveLength(1);
    expect(core).toHaveBeenCalledTimes(1);
  });

  it('refuses a stale price before anything is recorded, with the per-line conflict', async () => {
    db.item.rows[0].price = 10;
    const { body } = await run(req([{ itemId: lotId, quantity: 1500, amount: 12 }]));
    expect(core).not.toHaveBeenCalled();
    expect(body.synced).toEqual([]);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]).toMatchObject({ code: BULK_CONFLICT_CODE, retryable: false, operationType: 'CHECKOUT_CASH' });
    expect(body.failed[0].details.conflicts).toEqual([expect.objectContaining({ itemId: lotId, code: 'PRICE_CHANGED', expectedCents: 1500, clientCents: 1200 })]);
  });

  it('refuses when another sale took the cards while the device was offline', async () => {
    db.item.rows[0].stockSold = 9000;
    const { body } = await run(req([{ itemId: lotId, quantity: 1500, amount: 12 }]));
    expect(core).not.toHaveBeenCalled();
    expect(body.failed[0].details.conflicts[0]).toMatchObject({ code: 'INSUFFICIENT_STOCK', remainingCards: 1000 });
  });

  it('does not re-check a sale that was already recorded (same clientTransactionId), so the replay succeeds', async () => {
    db.item.rows[0].stockSold = 10000; // the first replay took the cards; a lookup now would call it sold out
    p.purchase.findFirst.mockResolvedValue({ id: 'pur1' });
    core.mockResolvedValue({ purchaseIds: ['pur1'], replay: true });
    const { body } = await run(req([{ itemId: lotId, quantity: 1500, amount: 12 }]));
    expect(body.failed).toEqual([]);
    expect(body.synced[0].resolvedValues).toEqual({ purchaseIds: ['pur1'], replay: true });
    expect(p.purchase.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { clientTransactionId: 'ctx-1', sale: { organizerId: 'org1' } } }));
  });

  it('a sale with no lot lines is recorded without any lot price check', async () => {
    const { body } = await run(req([{ itemId: 'plain-item', amount: 5 }]));
    expect(body.synced).toHaveLength(1);
    expect(p.item.findMany).not.toHaveBeenCalled();
  });

  it('refuses a lot line with the flag off', async () => {
    process.env.CARD_BULK_LOTS_ENABLED = 'false';
    const { body } = await run(req([{ itemId: lotId, quantity: 10 }]));
    expect(core).not.toHaveBeenCalled();
    expect(body.failed[0].details.conflicts[0].code).toBe('BULK_DISABLED');
  });

  it('a failed lot lookup with the flag on is retryable and records nothing', async () => {
    p.itemBulkLot.findMany.mockRejectedValue(new Error('db down'));
    const { body } = await run(req([{ itemId: lotId, quantity: 10, amount: 0.08 }]));
    expect(core).not.toHaveBeenCalled();
    expect(body.failed[0]).toMatchObject({ retryable: true, code: 'BULK_CHECK_FAILED' });
  });

  it('turns a bulk code raised by the sale itself into the per-line detail when the lot has moved since the check', async () => {
    // The first look (before the sale) finds the line fine; the sale then loses the cards to a register sale; the second look shows why.
    core.mockImplementation(async () => {
      db.item.rows[0].stockSold = 10000;
      throw new CashSaleError('not enough cards', 409, false, 'INSUFFICIENT_STOCK');
    });
    const { body } = await run(req([{ itemId: lotId, quantity: 1500, amount: 12 }]));
    expect(body.failed[0]).toMatchObject({ code: BULK_CONFLICT_CODE, retryable: false });
    expect(body.failed[0].details.conflicts[0]).toMatchObject({ code: 'NOT_AVAILABLE' });
  });

  it('keeps the plain error when the sale fails for a non-bulk reason', async () => {
    core.mockRejectedValue(new CashSaleError('sold elsewhere', 409, false, 'ITEM_UNAVAILABLE'));
    const { body } = await run(req([{ itemId: lotId, quantity: 1500, amount: 12 }]));
    expect(body.failed[0]).toMatchObject({ code: 'ITEM_UNAVAILABLE', retryable: false });
    expect(body.failed[0].details).toBeUndefined();
  });
});
