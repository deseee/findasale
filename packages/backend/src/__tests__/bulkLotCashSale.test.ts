/**
 * Bulk lot cash sale (ADR-136 Addendum A, roadmap #659).
 *
 * Drives the real processCashSaleCore with the database and every side-effect service mocked. The database is a small
 * in-memory model with real transaction semantics (a snapshot is restored when the callback throws), so the tests can
 * prove the property that matters: a sale that holds a lot takes the cards and writes the Purchase rows in ONE
 * transaction, and a failure anywhere inside rolls BOTH back. Proves on the Cash, Venmo and Zelle path:
 *   - the server prices the line (cards x price per 1,000, half up to the cent, once) and refuses a different register total
 *   - ONE guarded decrement for the whole quantity, inside the transaction, never one more unit afterwards
 *   - the Purchase row carries bulkQuantity
 *   - a lost race for the last cards, or a failed Purchase write, leaves stock and Purchase rows exactly as they were
 *   - an idempotent replay (pre-check, or the in-transaction re-check) never takes the cards twice
 *   - mixed carts (ordinary item plus lot, two lots) price and record correctly; two lots are locked in item id order
 *   - a test transaction never touches stock; a cart with no lot behaves exactly as before
 *
 * MOCKING NOTES: factories cannot reference later consts (jest hoists them), so the mocks are read back through the
 * imported modules. The Prisma client and every service the cash path imports are replaced.
 */
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));
jest.mock('../middleware/auth', () => ({}));
jest.mock('../utils/posAuth', () => ({ resolveOrganizerOrTeamMember: jest.fn() }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    purchase: { findMany: jest.fn(), create: jest.fn() },
    item: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    itemBulkLot: { findMany: jest.fn() },
    organizer: { findUnique: jest.fn() },
  },
}));
jest.mock('../services/itemStockService', () => {
  class InsufficientStockError extends Error {
    constructor(itemId: string, requested: number, remaining: number) {
      super(`Cannot sell ${requested} unit(s) of item ${itemId}: only ${remaining} remaining.`);
      this.name = 'InsufficientStockError';
    }
  }
  return { InsufficientStockError, sellItemUnits: jest.fn(), sellItemUnitsInTransaction: jest.fn() };
});
jest.mock('../utils/feeCalculator', () => ({ snapshotForCommissionOnly: jest.fn() }));
jest.mock('../services/cashFeeService', () => ({
  resolveCashCommissionRate: jest.fn(),
  cashCommissionOn: jest.fn(),
  accrueCashFeeBalance: jest.fn(),
}));
jest.mock('../services/posDiscountService', () => ({ resolvePosDiscount: jest.fn() }));
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn() }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn() }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn() }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn() }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn() }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn() }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn() } } }));
jest.mock('../services/checkoutGuard', () => ({ recordSuspectedSignal: jest.fn() }));

import { prisma } from '../lib/prisma';
import { sellItemUnits, sellItemUnitsInTransaction, InsufficientStockError } from '../services/itemStockService';
import { resolvePosDiscount } from '../services/posDiscountService';
import { resolveCashCommissionRate, cashCommissionOn, accrueCashFeeBalance } from '../services/cashFeeService';
import { snapshotForCommissionOnly } from '../utils/feeCalculator';
import { endEbayListingIfExists } from '../controllers/ebayController';
import { markShopifyItemSold } from '../services/shopifyService';
import { withdrawDiscogsListingIfExists } from '../services/marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../services/marketplace/reverbConnector';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService';
import { CashSaleError, processCashSaleCore } from '../controllers/cashPaymentController';

const db = prisma as any;
const asMock = (fn: unknown) => fn as jest.Mock;

const ORGANIZER = { id: 'org1', subscriptionTier: 'PRO' };
const LOT_ROW = { id: 'lot1', title: 'MTG commons', status: 'AVAILABLE', draftStatus: null, price: 8, stockTotal: 4200, stockSold: 0 };
const LOT2_ROW = { id: 'lot2', title: 'MTG uncommons', status: 'AVAILABLE', draftStatus: null, price: 12, stockTotal: 1000, stockSold: 0 };
const SINGLE_ROW = { id: 'single1', title: 'Lightning Bolt', status: 'AVAILABLE', draftStatus: null, price: 2.5, stockTotal: null, stockSold: 0 };

// In-memory database with real transaction semantics: state is snapshotted at the start and restored if the callback throws.
interface FakeState {
  sold: Record<string, number>;
  purchases: any[];
}
let state: FakeState;
let counter = 0;
let txCalls = 0;
let lockKeys: string[] = [];
let preexisting: any[] = []; // rows a "concurrent" request has already committed, seen by the in-transaction re-read
let txReadsReplay = false;

function makeTx() {
  return {
    $executeRaw: jest.fn(async (_strings: TemplateStringsArray, key: string) => {
      lockKeys.push(key);
      return 1;
    }),
    purchase: {
      findMany: jest.fn(async () => (txReadsReplay ? preexisting : [])),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `purchase_${++counter}`, ...data };
        state.purchases.push(row);
        return row;
      }),
    },
  };
}

function setDefaults(rows: Array<Record<string, unknown>>, lotIds: string[]) {
  counter = 0;
  txCalls = 0;
  lockKeys = [];
  preexisting = [];
  txReadsReplay = false;
  state = { sold: { lot1: 0, lot2: 0 }, purchases: [] };
  db.$transaction.mockImplementation(async (cb: any) => {
    txCalls += 1;
    const snapshot = JSON.parse(JSON.stringify(state)) as FakeState;
    try {
      return await cb(makeTx());
    } catch (err) {
      state = snapshot; // rollback: stock AND rows
      throw err;
    }
  });
  // Outside a transaction (the legacy path for a cart with no lot, or a test transaction) rows are written straight in.
  db.purchase.findMany.mockResolvedValue([]);
  db.purchase.create.mockImplementation(async ({ data }: any) => {
    const row = { id: `purchase_${++counter}`, ...data };
    state.purchases.push(row);
    return row;
  });
  db.item.findMany.mockResolvedValue(rows);
  db.item.findUnique.mockResolvedValue({ status: 'AVAILABLE', stockTotal: 4200, stockSold: 0 });
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.itemBulkLot.findMany.mockResolvedValue(lotIds.map((itemId) => ({ itemId })));
  db.organizer.findUnique.mockResolvedValue({ cashFeeBalance: 0, cashFeeBalanceUpdatedAt: null });
  const totals: Record<string, number> = { lot1: 4200, lot2: 1000 };
  asMock(sellItemUnitsInTransaction).mockImplementation(async (_tx: any, itemId: string, cards: number) => {
    if (state.sold[itemId] + cards > totals[itemId]) throw new (InsufficientStockError as any)(itemId, cards, totals[itemId] - state.sold[itemId]);
    state.sold[itemId] += cards;
    const remainingStock = totals[itemId] - state.sold[itemId];
    return { fullySoldOut: remainingStock === 0, remainingStock };
  });
  asMock(sellItemUnits).mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
  asMock(resolvePosDiscount).mockResolvedValue({ ok: true, discountAmountCents: 0, discountType: null, discountValueRaw: null, discountReasonNote: null });
  asMock(resolveCashCommissionRate).mockResolvedValue(0.06);
  asMock(cashCommissionOn).mockImplementation((amount: number, rate: number) => Math.round(amount * rate * 100) / 100);
  asMock(accrueCashFeeBalance).mockResolvedValue(undefined);
  asMock(snapshotForCommissionOnly).mockReturnValue({});
  for (const fn of [endEbayListingIfExists, markShopifyItemSold, withdrawDiscogsListingIfExists, withdrawReverbListingIfExists, notifyFacebookExportedItemSold, syncMarketplaceStock]) {
    asMock(fn).mockResolvedValue(undefined);
  }
}

async function expectCashSaleError(promise: Promise<unknown>, code: string, status?: number) {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(CashSaleError);
  expect((caught as CashSaleError).code).toBe(code);
  if (status !== undefined) expect((caught as CashSaleError).status).toBe(status);
  return caught as CashSaleError;
}

describe('processCashSaleCore, bulk lot lines (flag on)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.CARD_BULK_LOTS_ENABLED = 'true';
    setDefaults([LOT_ROW], ['lot1']);
  });
  afterEach(() => {
    delete process.env.CARD_BULK_LOTS_ENABLED;
  });

  it('sells 1,500 of 4,200 cards at $8.00 per 1,000 for exactly $12.00 in ONE transaction, bulkQuantity on the Purchase', async () => {
    const result = await processCashSaleCore({
      organizer: ORGANIZER,
      saleId: 'sale1',
      items: [{ itemId: 'lot1', amount: 12, quantity: 1500, label: 'Commons' }],
      cashReceived: 20,
    });

    expect(txCalls).toBe(1);
    expect(asMock(sellItemUnitsInTransaction)).toHaveBeenCalledTimes(1);
    expect(asMock(sellItemUnitsInTransaction).mock.calls[0].slice(1)).toEqual(['lot1', 1500]);
    // The lot is never decremented by the non-transactional function, and never "one more unit" afterwards.
    expect(asMock(sellItemUnits)).not.toHaveBeenCalled();
    expect(state.sold.lot1).toBe(1500);
    expect(state.purchases).toHaveLength(1);
    const data = state.purchases[0];
    expect(data.amount).toBe(12);
    expect(data.bulkQuantity).toBe(1500);
    expect(data.itemId).toBe('lot1');
    expect(data.isTestTransaction).toBe(false);
    expect(result.totalAmount).toBe(12);
    expect(result.change).toBe(8);
    expect(result.purchaseIds).toEqual(['purchase_1']);
    // A partial sale of a lot revises marketplace quantity and never withdraws listings.
    expect(asMock(syncMarketplaceStock)).toHaveBeenCalledWith('lot1', { fullySoldOut: false, remainingStock: 2700 });
    expect(asMock(endEbayListingIfExists)).not.toHaveBeenCalled();
  });

  it('accepts the quantity as a digit string from the register', async () => {
    await processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 12, quantity: '1500' }], cashReceived: 12 });
    expect(asMock(sellItemUnitsInTransaction).mock.calls[0].slice(1)).toEqual(['lot1', 1500]);
    expect(state.purchases[0].bulkQuantity).toBe(1500);
  });

  it('withdraws marketplace listings when the sale takes the last cards', async () => {
    await processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 33.6, quantity: 4200 }], cashReceived: 40 });
    expect(asMock(sellItemUnitsInTransaction).mock.calls[0].slice(1)).toEqual(['lot1', 4200]);
    expect(state.sold.lot1).toBe(4200);
    expect(asMock(endEbayListingIfExists)).toHaveBeenCalledWith('lot1');
    expect(asMock(syncMarketplaceStock)).not.toHaveBeenCalled();
  });

  it('rounds half up once per line: 1,001 cards at $8.00 per 1,000 is $8.01 (8.008 rounds to 8.01)', async () => {
    const result = await processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 8.01, quantity: 1001 }], cashReceived: 9 });
    expect(result.totalAmount).toBe(8.01);
    expect(state.purchases[0].amount).toBe(8.01);
  });

  it('refuses a lot line with no quantity (BULK_QUANTITY_REQUIRED) and writes nothing', async () => {
    await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 8 }], cashReceived: 8 }),
      'BULK_QUANTITY_REQUIRED',
      400
    );
    expect(txCalls).toBe(0);
    expect(asMock(sellItemUnitsInTransaction)).not.toHaveBeenCalled();
    expect(state.purchases).toHaveLength(0);
  });

  it('refuses a register total that differs from the server price by one cent (PRICE_CHANGED) and writes nothing', async () => {
    const err = await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 11.99, quantity: 1500 }], cashReceived: 20 }),
      'PRICE_CHANGED',
      409
    );
    expect(err.retryable).toBe(false);
    expect(txCalls).toBe(0);
    expect(state.purchases).toHaveLength(0);
    expect(state.sold.lot1).toBe(0);
  });

  it('refuses more cards than are left (INSUFFICIENT_STOCK) before any transaction', async () => {
    await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 40, quantity: 5000 }], cashReceived: 40 }),
      'INSUFFICIENT_STOCK',
      409
    );
    expect(txCalls).toBe(0);
    expect(state.purchases).toHaveLength(0);
  });

  it('refuses a zero, negative or fractional quantity (BAD_QUANTITY)', async () => {
    for (const quantity of [0, -5, 1.5, 'abc']) {
      await expectCashSaleError(
        processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 8, quantity }], cashReceived: 8 }),
        'BAD_QUANTITY',
        400
      );
    }
    expect(txCalls).toBe(0);
    expect(state.purchases).toHaveLength(0);
  });

  it('refuses a quantity whose price rounds to zero cents (QUANTITY_TOO_SMALL)', async () => {
    setDefaults([{ ...LOT_ROW, price: 0.01 }], ['lot1']);
    await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 0.01, quantity: 1 }], cashReceived: 1 }),
      'QUANTITY_TOO_SMALL',
      400
    );
    expect(txCalls).toBe(0);
  });

  it('a lost race for the last cards (the guarded decrement refuses) is INSUFFICIENT_STOCK, and nothing is recorded or taken', async () => {
    // The pre-check passed (4,200 left) but another register took the cards before this transaction's UPDATE ran.
    state.sold.lot1 = 4100;
    await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 12, quantity: 1500 }], cashReceived: 12 }),
      'INSUFFICIENT_STOCK',
      409
    );
    expect(txCalls).toBe(1);
    expect(state.purchases).toHaveLength(0);
    expect(state.sold.lot1).toBe(4100);
    expect(asMock(accrueCashFeeBalance)).not.toHaveBeenCalled();
    expect(asMock(syncMarketplaceStock)).not.toHaveBeenCalled();
  });

  it('a failed Purchase write rolls the cards back with it (one transaction): stock and rows are exactly as before', async () => {
    db.$transaction.mockImplementation(async (cb: any) => {
      txCalls += 1;
      const snapshot = JSON.parse(JSON.stringify(state)) as FakeState;
      const tx = makeTx();
      tx.purchase.create = jest.fn(async () => {
        throw new Error('db down');
      });
      try {
        return await cb(tx);
      } catch (err) {
        state = snapshot;
        throw err;
      }
    });
    await expect(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 12, quantity: 1500 }], cashReceived: 12 })
    ).rejects.toThrow('db down');
    expect(asMock(sellItemUnitsInTransaction)).toHaveBeenCalledTimes(1); // the decrement ran inside the transaction...
    expect(state.sold.lot1).toBe(0); // ...and the rollback gave the cards back
    expect(state.purchases).toHaveLength(0);
    expect(asMock(accrueCashFeeBalance)).not.toHaveBeenCalled();
    expect(db.item.updateMany).not.toHaveBeenCalled(); // no compensating write exists any more
  });

  it('a test transaction records the Purchase but never opens a stock transaction or sells cards', async () => {
    await processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 12, quantity: 1500 }], cashReceived: 12, isTestTransaction: true });
    expect(txCalls).toBe(0);
    expect(asMock(sellItemUnitsInTransaction)).not.toHaveBeenCalled();
    expect(asMock(sellItemUnits)).not.toHaveBeenCalled();
    expect(state.sold.lot1).toBe(0);
    expect(state.purchases[0].isTestTransaction).toBe(true);
    expect(state.purchases[0].bulkQuantity).toBe(1500);
    expect(asMock(accrueCashFeeBalance)).not.toHaveBeenCalled();
  });

  it('refuses a quantity on an item that is not a bulk lot (BULK_NOT_LOT)', async () => {
    setDefaults([SINGLE_ROW], []);
    await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'single1', amount: 2.5, quantity: 3 }], cashReceived: 5 }),
      'BULK_NOT_LOT',
      400
    );
    expect(state.purchases).toHaveLength(0);
  });

  it('fails closed when the lot lookup errors with the flag on (BULK_CHECK_FAILED, retryable)', async () => {
    db.itemBulkLot.findMany.mockRejectedValue(new Error('relation does not exist'));
    const err = await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 12, quantity: 1500 }], cashReceived: 12 }),
      'BULK_CHECK_FAILED',
      503
    );
    expect(err.retryable).toBe(true);
    expect(txCalls).toBe(0);
    expect(state.purchases).toHaveLength(0);
  });
});

describe('processCashSaleCore, idempotent replay of a lot sale', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.CARD_BULK_LOTS_ENABLED = 'true';
    setDefaults([LOT_ROW], ['lot1']);
  });
  afterEach(() => {
    delete process.env.CARD_BULK_LOTS_ENABLED;
  });

  it('a replay already recorded before this request started answers from the existing rows and takes no cards', async () => {
    db.purchase.findMany.mockResolvedValue([{ id: 'old_1', amount: 12, platformFeeAmount: 0.72, isTestTransaction: false }]);
    const result = await processCashSaleCore({
      organizer: ORGANIZER,
      saleId: 'sale1',
      items: [{ itemId: 'lot1', amount: 12, quantity: 1500 }],
      cashReceived: 20,
      clientTransactionId: 'offline-1',
    });
    expect(result.replay).toBe(true);
    expect(result.purchaseIds).toEqual(['old_1']);
    expect(txCalls).toBe(0);
    expect(asMock(sellItemUnitsInTransaction)).not.toHaveBeenCalled();
  });

  it('two identical requests racing: the second finds the first one\'s rows INSIDE the transaction, answers as a replay and takes no cards', async () => {
    txReadsReplay = true;
    preexisting = [{ id: 'won_race_1', amount: 12, platformFeeAmount: 0.72, isTestTransaction: false }];
    const result = await processCashSaleCore({
      organizer: ORGANIZER,
      saleId: 'sale1',
      items: [{ itemId: 'lot1', amount: 12, quantity: 1500 }],
      cashReceived: 20,
      clientTransactionId: 'offline-2',
    });
    expect(result.replay).toBe(true);
    expect(result.purchaseIds).toEqual(['won_race_1']);
    expect(asMock(sellItemUnitsInTransaction)).not.toHaveBeenCalled();
    expect(state.sold.lot1).toBe(0);
    expect(state.purchases).toHaveLength(0);
  });

  it('serializes on the clientTransactionId with an advisory lock taken inside the transaction before any decrement', async () => {
    await processCashSaleCore({
      organizer: ORGANIZER,
      saleId: 'sale1',
      items: [{ itemId: 'lot1', amount: 12, quantity: 1500 }],
      cashReceived: 12,
      clientTransactionId: 'offline-3',
    });
    expect(lockKeys).toEqual(['cash-sale:org1:offline-3']);
    expect(state.sold.lot1).toBe(1500);
  });

  it('takes no lock when the sale has no clientTransactionId (a live sale has nothing to replay)', async () => {
    await processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 12, quantity: 1500 }], cashReceived: 12 });
    expect(lockKeys).toEqual([]);
  });
});

describe('processCashSaleCore, mixed carts', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.CARD_BULK_LOTS_ENABLED = 'true';
  });
  afterEach(() => {
    delete process.env.CARD_BULK_LOTS_ENABLED;
  });

  it('prices a lot line and an ordinary single in the same cart; both rows are written in the one transaction', async () => {
    setDefaults([LOT_ROW, SINGLE_ROW], ['lot1']);
    const result = await processCashSaleCore({
      organizer: ORGANIZER,
      saleId: 'sale1',
      items: [
        { itemId: 'lot1', amount: 12, quantity: 1500 },
        { itemId: 'single1', amount: 2.5 },
      ],
      cashReceived: 20,
    });
    expect(result.totalAmount).toBe(14.5);
    expect(txCalls).toBe(1);
    expect(state.purchases.map((p) => p.itemId)).toEqual(['lot1', 'single1']);
    expect(asMock(sellItemUnitsInTransaction)).toHaveBeenCalledTimes(1);
    expect(asMock(sellItemUnits)).toHaveBeenCalledTimes(1);
    expect(asMock(sellItemUnits)).toHaveBeenCalledWith('single1', 1);
    const singleRow = state.purchases.find((p) => p.itemId === 'single1');
    expect('bulkQuantity' in singleRow).toBe(false);
  });

  it('two lots in one cart: both priced by the server, taken in item id order, both rows recorded', async () => {
    setDefaults([LOT2_ROW, LOT_ROW], ['lot1', 'lot2']);
    const result = await processCashSaleCore({
      organizer: ORGANIZER,
      saleId: 'sale1',
      // the register lists lot2 first; the decrements still run lot1 then lot2 so two carts cannot deadlock
      items: [
        { itemId: 'lot2', amount: 6, quantity: 500 },
        { itemId: 'lot1', amount: 12, quantity: 1500 },
      ],
      cashReceived: 20,
    });
    expect(result.totalAmount).toBe(18);
    expect(asMock(sellItemUnitsInTransaction).mock.calls.map((c: any[]) => c[1])).toEqual(['lot1', 'lot2']);
    expect(state.sold).toEqual({ lot1: 1500, lot2: 500 });
    expect(state.purchases.map((p) => [p.itemId, p.bulkQuantity])).toEqual([
      ['lot2', 500],
      ['lot1', 1500],
    ]);
  });

  it('two lots, the second sold out between the quote and the sale: the first lot\'s cards are given back and nothing is recorded', async () => {
    setDefaults([LOT2_ROW, LOT_ROW], ['lot1', 'lot2']);
    state.sold.lot2 = 900; // only 100 left of lot2 by the time the transaction runs
    await expectCashSaleError(
      processCashSaleCore({
        organizer: ORGANIZER,
        saleId: 'sale1',
        items: [
          { itemId: 'lot2', amount: 6, quantity: 500 },
          { itemId: 'lot1', amount: 12, quantity: 1500 },
        ],
        cashReceived: 20,
      }),
      'INSUFFICIENT_STOCK',
      409
    );
    expect(asMock(sellItemUnitsInTransaction).mock.calls.map((c: any[]) => c[1])).toEqual(['lot1', 'lot2']);
    expect(state.sold).toEqual({ lot1: 0, lot2: 900 }); // lot1 was decremented inside the transaction, then rolled back
    expect(state.purchases).toHaveLength(0);
  });
});

describe('processCashSaleCore, bulk lot lines (flag off)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.CARD_BULK_LOTS_ENABLED;
  });

  it('refuses to sell a lot (BULK_DISABLED) so it is never sold as one unit', async () => {
    setDefaults([LOT_ROW], ['lot1']);
    await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 12, quantity: 1500 }], cashReceived: 12 }),
      'BULK_DISABLED',
      409
    );
    expect(txCalls).toBe(0);
    expect(state.purchases).toHaveLength(0);
  });

  it('fails open for ordinary items when the lot lookup errors (a missing table before the migration breaks nothing)', async () => {
    setDefaults([SINGLE_ROW], []);
    db.itemBulkLot.findMany.mockRejectedValue(new Error('relation "ItemBulkLot" does not exist'));
    const result = await processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'single1', amount: 2.5 }], cashReceived: 5 });
    expect(result.totalAmount).toBe(2.5);
    expect(asMock(sellItemUnits)).toHaveBeenCalledWith('single1', 1);
  });

  it('leaves an ordinary single card exactly as before: no transaction, one unit sold, no bulkQuantity key', async () => {
    setDefaults([SINGLE_ROW], []);
    const result = await processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'single1', amount: 2.5 }], cashReceived: 5 });
    expect(result.change).toBe(2.5);
    expect(txCalls).toBe(0);
    expect(asMock(sellItemUnits)).toHaveBeenCalledTimes(1);
    expect(asMock(sellItemUnits)).toHaveBeenCalledWith('single1', 1);
    expect('bulkQuantity' in state.purchases[0]).toBe(false);
    expect(asMock(endEbayListingIfExists)).toHaveBeenCalledWith('single1');
  });

  it('does not look up lots for a cart of miscellaneous lines with no item id', async () => {
    setDefaults([], []);
    const result = await processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ amount: 4, label: 'Sleeves' }], cashReceived: 5 });
    expect(result.totalAmount).toBe(4);
    expect(db.itemBulkLot.findMany).not.toHaveBeenCalled();
    expect(asMock(sellItemUnits)).not.toHaveBeenCalled();
  });
});
