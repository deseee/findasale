/**
 * holdInvoicePaymentRecorder.markHoldInvoicePaid: money correctness for discounted and split-tender
 * hold invoices (2026-09-29).
 *
 * WHAT THIS PROVES (items $12.34 + $5.67 + $9.99 = $28.00, Crew Invasion 10% off => invoice $25.20):
 *   - the Purchase rows sum to EXACTLY what was charged ($25.20 = 1111 + 510 + 899 cents), never the
 *     list prices, and no row is above its own list price
 *   - the invoice's platform fee (computed on the discounted card leg) is allocated to the cent
 *   - an undiscounted invoice (total == item sum) or one ABOVE the item sum (shipping added) keeps
 *     list-price rows exactly as before
 *   - a cash leg: rows carry cashLegAmount summing to the invoice's cash, and the commission accrues
 *     once through the CashFeeAccrual ledger keyed ('HOLD_INVOICE', invoice id), INSIDE the transaction
 *   - idempotent: an already-PAID invoice and a lost flip race record and accrue nothing; a duplicate
 *     ledger row accrues no second balance increment
 *   - a failed accrual THROWS (rolls the recording back), it is not swallowed
 *   - an oversold item gets no row and its share is not re-attributed to the others
 *
 * cashFeeService is the REAL implementation; the DB, processors and cross-channel hooks are mocked.
 */

jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    holdInvoice: { findUnique: jest.fn() },
    item: { findMany: jest.fn() },
    itemReservation: { findMany: jest.fn() },
  },
}));
jest.mock('../lib/socket', () => ({ getIO: jest.fn(() => ({})) }));
jest.mock('../services/liveFeedService', () => ({ pushEvent: jest.fn() }));
jest.mock('../services/itemStockService', () => {
  class InsufficientStockError extends Error {}
  return { sellItemUnits: jest.fn(), InsufficientStockError };
});
jest.mock('../controllers/ebayController', () => ({ endEbayListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/shopifyService', () => ({ markShopifyItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/discogsListingConnector', () => ({ withdrawDiscogsListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplace/reverbConnector', () => ({ withdrawReverbListingIfExists: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/facebookNudgeService', () => ({ notifyFacebookExportedItemSold: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/marketplaceStockSyncService', () => ({ syncMarketplaceStock: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue(undefined) } } }));
jest.mock('../services/stripeConnectService', () => ({ shouldUseDirectCharge: jest.fn().mockResolvedValue(false) }));
jest.mock('../services/squarePurchaseEngagementService', () => ({ fireSquarePurchaseEngagement: jest.fn() }));
jest.mock('../services/xpService', () => ({ awardXp: jest.fn().mockResolvedValue({}), XP_AWARDS: {} }));

import { prisma } from '../lib/prisma';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { markHoldInvoicePaid } from '../services/holdInvoicePaymentRecorder';

const db: any = prisma;
const flush = () => new Promise((r) => setImmediate(r));

const ITEMS = [
  { id: 'i1', title: 'Lamp', price: 12.34 },
  { id: 'i2', title: 'Chair', price: 5.67 },
  { id: 'i3', title: 'Vase', price: 9.99 },
];

const invoice = (over: any = {}) => ({
  id: 'inv_1',
  status: 'PENDING',
  saleId: 'sale_1',
  shopperUserId: 'u1',
  organizerUserId: 'ou1',
  itemIds: ['i1', 'i2', 'i3'],
  totalAmount: 2520, // $28.00 of items less the 10% crew discount
  platformFeeAmount: 189,
  cashAmountCents: null,
  chargeType: 'DESTINATION',
  stripeAccountId: null,
  guestEmail: null,
  guestName: null,
  shippingAddressLine1: null,
  sale: { id: 'sale_1', organizerId: 'org_1', title: 'Estate Finds' },
  shopper: { id: 'u1', email: 's@example.com', name: 'Shopper', guildXp: 0 },
  organizer: { id: 'ou1', email: 'o@example.com', name: 'Org' },
  ...over,
});

function makeTx(opts: { flipCount?: number; ledgerInsertCount?: number; postFlipStatus?: string } = {}) {
  const purchases: any[] = [];
  const tx: any = {
    holdInvoice: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.flipCount ?? 1 }),
      findUnique: jest.fn().mockResolvedValue({ status: opts.postFlipStatus ?? 'PAID' }),
    },
    itemReservation: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
    purchase: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        purchases.push(data);
        return { id: `pur_${purchases.length}` };
      }),
    },
    notification: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    organizer: {
      findUnique: jest.fn().mockResolvedValue({ id: 'org_1', subscriptionTier: 'SIMPLE', referralDiscountExpiry: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    cashFeeAccrual: { createMany: jest.fn().mockResolvedValue({ count: opts.ledgerInsertCount ?? 1 }) },
  };
  return { tx, purchases };
}

const cents = (purchases: any[], field: string) => purchases.map((p) => Math.round(p[field] * 100));
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

async function run(inv: any, tx: any, items: any[] = ITEMS) {
  db.holdInvoice.findUnique.mockResolvedValue(inv);
  db.item.findMany.mockResolvedValue(items);
  db.itemReservation.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (cb: any) => cb(tx));
  const res = await markHoldInvoicePaid('inv_1', { processor: 'STRIPE', externalPaymentId: 'pi_1' }, { source: 'webhook' });
  await flush();
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  (sellItemUnits as jest.Mock).mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('markHoldInvoicePaid, crew-discounted invoice', () => {
  it('records Purchase rows that add up to exactly the invoice total, not the list prices', async () => {
    const { tx, purchases } = makeTx();
    const res = await run(invoice(), tx);
    expect(res.recorded).toBe(true);
    expect(purchases).toHaveLength(3);
    expect(cents(purchases, 'amount')).toEqual([1111, 510, 899]);
    expect(sum(cents(purchases, 'amount'))).toBe(2520);
    // never above the item's own list price
    purchases.forEach((p, i) => expect(p.amount).toBeLessThanOrEqual(ITEMS[i].price));
  });

  it('allocates the invoice platform fee to the cent (fee stays on the discounted card leg)', async () => {
    const { tx, purchases } = makeTx();
    await run(invoice(), tx);
    expect(cents(purchases, 'platformFeeAmount')).toEqual([83, 38, 68]);
    expect(sum(cents(purchases, 'platformFeeAmount'))).toBe(189);
    expect(cents(purchases, 'commissionAmount')).toEqual(cents(purchases, 'platformFeeAmount'));
  });

  it('a single-item discounted invoice records the item at the amount actually paid', async () => {
    const { tx, purchases } = makeTx();
    await run(invoice({ itemIds: ['i1'], totalAmount: 1111, platformFeeAmount: 84 }), tx, [ITEMS[0]]);
    expect(purchases).toHaveLength(1);
    expect(Math.round(purchases[0].amount * 100)).toBe(1111);
    expect(Math.round(purchases[0].platformFeeAmount * 100)).toBe(84);
  });

  it('sets no cashLegAmount and writes no ledger row when there is no cash leg', async () => {
    const { tx, purchases } = makeTx();
    await run(invoice(), tx);
    purchases.forEach((p) => expect(p.cashLegAmount).toBeUndefined());
    expect(tx.cashFeeAccrual.createMany).not.toHaveBeenCalled();
    expect(tx.organizer.update).not.toHaveBeenCalled();
  });
});

describe('markHoldInvoicePaid, invoices that are not below the item sum', () => {
  it('keeps list-price rows for an undiscounted invoice (total == item sum)', async () => {
    const { tx, purchases } = makeTx();
    await run(invoice({ totalAmount: 2800, platformFeeAmount: 210 }), tx);
    expect(cents(purchases, 'amount')).toEqual([1234, 567, 999]);
    expect(sum(cents(purchases, 'platformFeeAmount'))).toBe(210);
  });

  it('keeps list-price rows when the invoice is ABOVE the item sum (shipping or extras added)', async () => {
    const { tx, purchases } = makeTx();
    await run(invoice({ totalAmount: 3300, platformFeeAmount: 250 }), tx);
    expect(cents(purchases, 'amount')).toEqual([1234, 567, 999]);
  });
});

describe('markHoldInvoicePaid, cash leg', () => {
  const cashInvoice = () => invoice({ cashAmountCents: 1000 });

  it('sets cashLegAmount proportionally and the rows sum to exactly the cash collected', async () => {
    const { tx, purchases } = makeTx();
    await run(cashInvoice(), tx);
    expect(cents(purchases, 'cashLegAmount')).toEqual([441, 202, 357]);
    expect(sum(cents(purchases, 'cashLegAmount'))).toBe(1000);
    // the card side of each row (amount - cashLeg) is what the processor captured: never negative
    purchases.forEach((p) => expect(p.amount - p.cashLegAmount).toBeGreaterThanOrEqual(0));
    // and the rows still add up to the whole invoice (card + cash)
    expect(sum(cents(purchases, 'amount'))).toBe(2520);
  });

  it('accrues the cash commission once, inside the transaction, keyed HOLD_INVOICE / invoice id', async () => {
    const { tx } = makeTx();
    await run(cashInvoice(), tx);
    expect(tx.cashFeeAccrual.createMany).toHaveBeenCalledTimes(1);
    const arg = tx.cashFeeAccrual.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data).toEqual([
      expect.objectContaining({
        organizerId: 'org_1',
        sourceType: 'HOLD_INVOICE',
        sourceId: 'inv_1',
        cashAmountCents: 1000,
        commissionCents: 80, // SIMPLE, in person: 8% of $10.00
      }),
    ]);
    // the balance increment went through the SAME tx client, not the global prisma
    expect(tx.organizer.update).toHaveBeenCalledTimes(1);
    expect(tx.organizer.update.mock.calls[0][0].data.cashFeeBalance).toEqual({ increment: 0.8 });
  });

  it('a duplicate ledger row (replay) accrues no second balance increment', async () => {
    const { tx } = makeTx({ ledgerInsertCount: 0 });
    await run(cashInvoice(), tx);
    expect(tx.cashFeeAccrual.createMany).toHaveBeenCalledTimes(1);
    expect(tx.organizer.update).not.toHaveBeenCalled();
  });

  it('a failed accrual throws so the whole recording rolls back (not swallowed)', async () => {
    const { tx } = makeTx();
    tx.cashFeeAccrual.createMany.mockRejectedValueOnce(new Error('ledger down'));
    await expect(run(cashInvoice(), tx)).rejects.toThrow('ledger down');
  });

  it('a fully-cash invoice with no items records one aggregate row carrying the cash leg', async () => {
    const { tx, purchases } = makeTx();
    await run(invoice({ itemIds: [], totalAmount: 5000, platformFeeAmount: 0, cashAmountCents: 5000 }), tx, []);
    expect(purchases).toHaveLength(1);
    expect(purchases[0].itemId).toBeNull();
    expect(Math.round(purchases[0].amount * 100)).toBe(5000);
    expect(Math.round(purchases[0].cashLegAmount * 100)).toBe(5000);
    expect(tx.cashFeeAccrual.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('markHoldInvoicePaid, idempotency and oversold', () => {
  it('an already PAID invoice records nothing and accrues nothing', async () => {
    const { tx } = makeTx();
    db.holdInvoice.findUnique.mockResolvedValue(invoice({ status: 'PAID', cashAmountCents: 1000 }));
    const res = await markHoldInvoicePaid('inv_1', { processor: 'STRIPE', externalPaymentId: 'pi_1' }, { source: 'webhook' });
    expect(res).toEqual({ recorded: false, alreadyPaid: true });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.purchase.create).not.toHaveBeenCalled();
    expect(tx.cashFeeAccrual.createMany).not.toHaveBeenCalled();
  });

  it('a lost flip race (concurrent recorder won) creates no rows and accrues nothing', async () => {
    const { tx } = makeTx({ flipCount: 0 });
    const res = await run(invoice({ cashAmountCents: 1000 }), tx);
    expect(res).toEqual({ recorded: false, alreadyPaid: true });
    expect(tx.purchase.create).not.toHaveBeenCalled();
    expect(tx.cashFeeAccrual.createMany).not.toHaveBeenCalled();
  });

  it('an oversold item gets no row and its share is NOT pushed onto the others', async () => {
    const { tx, purchases } = makeTx();
    (sellItemUnits as jest.Mock).mockImplementation(async (id: string) => {
      if (id === 'i2') throw new InsufficientStockError('sold out');
      return { fullySoldOut: true, remainingStock: 0 };
    });
    await run(invoice(), tx);
    expect(purchases).toHaveLength(2);
    expect(cents(purchases, 'amount')).toEqual([1111, 899]); // same shares as the full allocation
    expect(sum(cents(purchases, 'amount'))).toBe(2520 - 510); // the oversold share stays a manual-refund case
  });
});
