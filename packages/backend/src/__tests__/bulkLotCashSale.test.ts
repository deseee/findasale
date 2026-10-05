/**
 * Bulk lot cash sale (ADR-136, roadmap #659). NOT executed when written (jest cannot run on the authoring device);
 * CI is the first real run.
 *
 * Drives the real processCashSaleCore with the database and every side-effect service mocked. Proves the money
 * rules on the Cash, Venmo and Zelle path: the server prices the line (cards x price per 1,000, half up to the
 * cent) and refuses a register total that differs, the cards are reserved with ONE guarded decrement for the whole
 * quantity (never one more unit afterwards), the Purchase row carries bulkQuantity, a failed Purchase write gives the
 * reserved cards back, a test transaction never touches stock, and a non-lot item behaves exactly as before.
 *
 * MOCKING NOTES: factories cannot reference later consts (jest hoists them), so the mocks are read back through
 * the imported modules. The Prisma client and every service the cash path imports are replaced.
 */
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));
jest.mock('../middleware/auth', () => ({}));
jest.mock('../utils/posAuth', () => ({ resolveOrganizerOrTeamMember: jest.fn() }));
jest.mock('../lib/prisma', () => ({
  prisma: {
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
  return { InsufficientStockError, sellItemUnits: jest.fn() };
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
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
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
const SINGLE_ROW = { id: 'single1', title: 'Lightning Bolt', status: 'AVAILABLE', draftStatus: null, price: 2.5, stockTotal: null, stockSold: 0 };

let purchaseCounter = 0;

function setDefaults(rows: Array<Record<string, unknown>>, lotIds: string[]) {
  purchaseCounter = 0;
  db.purchase.findMany.mockResolvedValue([]);
  db.purchase.create.mockImplementation(async ({ data }: any) => ({ id: `purchase_${++purchaseCounter}`, ...data }));
  db.item.findMany.mockResolvedValue(rows);
  db.item.findUnique.mockResolvedValue({ status: 'AVAILABLE', stockTotal: 4200, stockSold: 0 });
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.itemBulkLot.findMany.mockResolvedValue(lotIds.map((itemId) => ({ itemId })));
  db.organizer.findUnique.mockResolvedValue({ cashFeeBalance: 0, cashFeeBalanceUpdatedAt: null });
  asMock(sellItemUnits).mockResolvedValue({ fullySoldOut: false, remainingStock: 2700 });
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

  it('sells 1,500 of 4,200 cards at $8.00 per 1,000 for exactly $12.00, one reservation, bulkQuantity on the Purchase', async () => {
    const result = await processCashSaleCore({
      organizer: ORGANIZER,
      saleId: 'sale1',
      items: [{ itemId: 'lot1', amount: 12, quantity: 1500, label: 'Commons' }],
      cashReceived: 20,
    });

    expect(asMock(sellItemUnits)).toHaveBeenCalledTimes(1);
    expect(asMock(sellItemUnits)).toHaveBeenCalledWith('lot1', 1500);
    expect(db.purchase.create).toHaveBeenCalledTimes(1);
    const data = db.purchase.create.mock.calls[0][0].data;
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
    await processCashSaleCore({
      organizer: ORGANIZER,
      saleId: 'sale1',
      items: [{ itemId: 'lot1', amount: 12, quantity: '1500' }],
      cashReceived: 12,
    });
    expect(asMock(sellItemUnits)).toHaveBeenCalledWith('lot1', 1500);
    expect(db.purchase.create.mock.calls[0][0].data.bulkQuantity).toBe(1500);
  });

  it('withdraws marketplace listings when the sale takes the last cards', async () => {
    asMock(sellItemUnits).mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
    await processCashSaleCore({
      organizer: ORGANIZER,
      saleId: 'sale1',
      items: [{ itemId: 'lot1', amount: 33.6, quantity: 4200 }],
      cashReceived: 40,
    });
    expect(asMock(sellItemUnits)).toHaveBeenCalledTimes(1);
    expect(asMock(sellItemUnits)).toHaveBeenCalledWith('lot1', 4200);
    expect(asMock(endEbayListingIfExists)).toHaveBeenCalledWith('lot1');
    expect(asMock(syncMarketplaceStock)).not.toHaveBeenCalled();
  });

  it('refuses a lot line with no quantity (BULK_QUANTITY_REQUIRED) and writes nothing', async () => {
    await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 8 }], cashReceived: 8 }),
      'BULK_QUANTITY_REQUIRED',
      400
    );
    expect(asMock(sellItemUnits)).not.toHaveBeenCalled();
    expect(db.purchase.create).not.toHaveBeenCalled();
  });

  it('refuses a register total that differs from the server price (PRICE_CHANGED) and writes nothing', async () => {
    const err = await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 11.99, quantity: 1500 }], cashReceived: 20 }),
      'PRICE_CHANGED',
      409
    );
    expect(err.retryable).toBe(false);
    expect(asMock(sellItemUnits)).not.toHaveBeenCalled();
    expect(db.purchase.create).not.toHaveBeenCalled();
  });

  it('refuses more cards than are left (INSUFFICIENT_STOCK) before any reservation', async () => {
    await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 40, quantity: 5000 }], cashReceived: 40 }),
      'INSUFFICIENT_STOCK',
      409
    );
    expect(asMock(sellItemUnits)).not.toHaveBeenCalled();
    expect(db.purchase.create).not.toHaveBeenCalled();
  });

  it('refuses a zero, negative or fractional quantity (BAD_QUANTITY)', async () => {
    for (const quantity of [0, -5, 1.5, 'abc']) {
      await expectCashSaleError(
        processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 8, quantity }], cashReceived: 8 }),
        'BAD_QUANTITY',
        400
      );
    }
    expect(asMock(sellItemUnits)).not.toHaveBeenCalled();
    expect(db.purchase.create).not.toHaveBeenCalled();
  });

  it('refuses a quantity whose price rounds to zero cents (QUANTITY_TOO_SMALL)', async () => {
    setDefaults([{ ...LOT_ROW, price: 0.01 }], ['lot1']);
    await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 0.01, quantity: 1 }], cashReceived: 1 }),
      'QUANTITY_TOO_SMALL',
      400
    );
    expect(asMock(sellItemUnits)).not.toHaveBeenCalled();
  });

  it('turns a lost race for the last cards into INSUFFICIENT_STOCK and records no sale', async () => {
    asMock(sellItemUnits).mockRejectedValue(new InsufficientStockError('lot1', 1500, 100));
    await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 12, quantity: 1500 }], cashReceived: 12 }),
      'INSUFFICIENT_STOCK',
      409
    );
    expect(db.purchase.create).not.toHaveBeenCalled();
    // Nothing was reserved, so nothing is given back.
    expect(db.item.updateMany).not.toHaveBeenCalled();
  });

  it('gives the reserved cards back when the Purchase row cannot be written', async () => {
    db.purchase.create.mockRejectedValue(new Error('db down'));
    await expect(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 12, quantity: 1500 }], cashReceived: 12 })
    ).rejects.toThrow('db down');
    expect(asMock(sellItemUnits)).toHaveBeenCalledWith('lot1', 1500);
    expect(db.item.updateMany).toHaveBeenCalledWith({ where: { id: 'lot1', stockSold: { gte: 1500 } }, data: { stockSold: { decrement: 1500 } } });
    expect(asMock(accrueCashFeeBalance)).not.toHaveBeenCalled();
  });

  it('a test transaction records the Purchase but never reserves or sells cards', async () => {
    await processCashSaleCore({
      organizer: ORGANIZER,
      saleId: 'sale1',
      items: [{ itemId: 'lot1', amount: 12, quantity: 1500 }],
      cashReceived: 12,
      isTestTransaction: true,
    });
    expect(asMock(sellItemUnits)).not.toHaveBeenCalled();
    expect(db.item.updateMany).not.toHaveBeenCalled();
    const data = db.purchase.create.mock.calls[0][0].data;
    expect(data.isTestTransaction).toBe(true);
    expect(data.bulkQuantity).toBe(1500);
    expect(asMock(accrueCashFeeBalance)).not.toHaveBeenCalled();
  });

  it('refuses a quantity on an item that is not a bulk lot (BULK_NOT_LOT)', async () => {
    setDefaults([SINGLE_ROW], []);
    await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'single1', amount: 2.5, quantity: 3 }], cashReceived: 5 }),
      'BULK_NOT_LOT',
      400
    );
    expect(db.purchase.create).not.toHaveBeenCalled();
  });

  it('fails closed when the lot lookup errors with the flag on (BULK_CHECK_FAILED, retryable)', async () => {
    db.itemBulkLot.findMany.mockRejectedValue(new Error('relation does not exist'));
    const err = await expectCashSaleError(
      processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'lot1', amount: 12, quantity: 1500 }], cashReceived: 12 }),
      'BULK_CHECK_FAILED',
      503
    );
    expect(err.retryable).toBe(true);
    expect(asMock(sellItemUnits)).not.toHaveBeenCalled();
    expect(db.purchase.create).not.toHaveBeenCalled();
  });

  it('prices a bulk line and an ordinary single in the same cart without touching the single', async () => {
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
    expect(asMock(sellItemUnits)).toHaveBeenCalledTimes(2);
    expect(asMock(sellItemUnits)).toHaveBeenCalledWith('lot1', 1500);
    expect(asMock(sellItemUnits)).toHaveBeenCalledWith('single1', 1);
    const singleData = db.purchase.create.mock.calls.map((c: any) => c[0].data).find((d: any) => d.itemId === 'single1');
    expect('bulkQuantity' in singleData).toBe(false);
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
    expect(asMock(sellItemUnits)).not.toHaveBeenCalled();
    expect(db.purchase.create).not.toHaveBeenCalled();
  });

  it('fails open for ordinary items when the lot lookup errors (a missing table before the migration breaks nothing)', async () => {
    setDefaults([SINGLE_ROW], []);
    db.itemBulkLot.findMany.mockRejectedValue(new Error('relation "ItemBulkLot" does not exist'));
    const result = await processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'single1', amount: 2.5 }], cashReceived: 5 });
    expect(result.totalAmount).toBe(2.5);
    expect(asMock(sellItemUnits)).toHaveBeenCalledWith('single1', 1);
  });

  it('leaves an ordinary single card exactly as before: one unit sold, no bulkQuantity key', async () => {
    setDefaults([SINGLE_ROW], []);
    asMock(sellItemUnits).mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
    const result = await processCashSaleCore({ organizer: ORGANIZER, saleId: 'sale1', items: [{ itemId: 'single1', amount: 2.5 }], cashReceived: 5 });
    expect(result.change).toBe(2.5);
    expect(asMock(sellItemUnits)).toHaveBeenCalledTimes(1);
    expect(asMock(sellItemUnits)).toHaveBeenCalledWith('single1', 1);
    const data = db.purchase.create.mock.calls[0][0].data;
    expect('bulkQuantity' in data).toBe(false);
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
