/**
 * posPaymentLinkRecorder split-tender path (services/posPaymentLinkRecorder.ts, 2026-09-29).
 *
 * NOT EXECUTED when written (the environment had no runnable jest). Run
 *   pnpm --filter backend test -- posPaymentLinkRecorderSplit
 * before merging.
 *
 * WHAT THIS PROVES, with money (SIMPLE organizer, $100.00 sale, $40.00 cash + $60.00 card link):
 *   - the cash-leg commission is accrued INSIDE the recorder's own transaction, once, through
 *     the CashFeeAccrual ledger (POS_PAYMENT_LINK / link id): 8% in person of $40.00 = $3.20
 *   - every Purchase row carries its proportional cashLegAmount and they sum to EXACTLY $40.00
 *   - platformFeeAmount is computed on the CARD leg only (9.5% online of $60.00 = $5.70 total,
 *     NOT 9.5% of the $100.00 item subtotal)
 *   - the misc/quick-add branch records the full sale ($100.00 = card + cash) with the fee on the
 *     card amount
 *   - a non-split link is untouched (no ledger write, no cashLegAmount, fee on item subtotal)
 *   - idempotent: an already-COMPLETED link, a lost flip race, and a duplicate ledger row all
 *     accrue nothing
 *
 * cashFeeService and feeCalculator are the REAL implementations; only the DB, the processors and
 * the cross-channel hooks are mocked.
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    organizer: { findUnique: jest.fn() },
    item: { findMany: jest.fn() },
  },
}));
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
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/stripeConnectService', () => ({ shouldUseDirectCharge: jest.fn().mockResolvedValue(false) }));
jest.mock('../utils/stripe', () => ({
  getStripe: () => ({ paymentLinks: { update: jest.fn().mockResolvedValue({}) } }),
}));
jest.mock('../services/squareCheckoutLinkService', () => ({
  deleteSquareCheckoutLink: jest.fn().mockResolvedValue({ ok: true }),
}));

import { prisma } from '../lib/prisma';
import { sellItemUnits } from '../services/itemStockService';
import { recordPosPaymentLinkSale } from '../services/posPaymentLinkRecorder';

const db: any = prisma;

function makeTx(opts: {
  link: any;
  items?: any[];
  flipCount?: number;
  ledgerInsertCount?: number;
  referralDiscountExpiry?: Date | null;
}) {
  const purchases: any[] = [];
  const tx: any = {
    pOSPaymentLink: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.flipCount ?? 1 }),
      findUnique: jest.fn().mockResolvedValue(opts.link),
      update: jest.fn().mockResolvedValue({}),
    },
    sale: {
      findUnique: jest.fn().mockResolvedValue({
        organizerId: opts.link.organizerId,
        organizer: {
          subscriptionTier: 'SIMPLE',
          stripeConnectId: null,
          referralDiscountExpiry: opts.referralDiscountExpiry ?? null,
        },
      }),
    },
    item: { findMany: jest.fn().mockResolvedValue(opts.items ?? []) },
    purchase: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        purchases.push(data);
        return { id: `pur_${purchases.length}` };
      }),
    },
    cashFeeAccrual: {
      createMany: jest.fn().mockResolvedValue({ count: opts.ledgerInsertCount ?? 1 }),
    },
    organizer: { update: jest.fn().mockResolvedValue({}) },
  };
  return { tx, purchases };
}

const baseLink = (over: any = {}) => ({
  id: 'link_1',
  organizerId: 'org_1',
  saleId: 'sale_1',
  processor: 'SQUARE',
  stripePaymentLinkId: null,
  squarePaymentLinkId: 'sq_link_1',
  status: 'ACTIVE',
  amount: 6000,
  itemIds: ['i1', 'i2'],
  chargeType: 'DESTINATION',
  stripeAccountId: null,
  isSplitPayment: true,
  cashAmountCents: 4000,
  cardAmountCents: 6000,
  ...over,
});

const opts = { source: 'webhook' as const, processor: 'SQUARE' as const, externalPaymentId: 'sq_pay_1' };

const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  (sellItemUnits as jest.Mock).mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
  db.organizer.findUnique.mockResolvedValue({ userId: 'user_1' });
  db.item.findMany.mockResolvedValue([]);
});

function runWith(tx: any, link: any) {
  db.$transaction.mockImplementation(async (cb: any) => cb(tx));
  return recordPosPaymentLinkSale(link, opts);
}

describe('recordPosPaymentLinkSale, split link with items', () => {
  const items = [
    { id: 'i1', title: 'Lamp', price: 60 },
    { id: 'i2', title: 'Chair', price: 40 },
  ];

  it('accrues the cash-leg commission once, inside the transaction, keyed by link id', async () => {
    const { tx } = makeTx({ link: baseLink(), items });
    const res = await runWith(tx, baseLink());
    await flush();

    expect(res.recorded).toBe(true);
    expect(tx.cashFeeAccrual.createMany).toHaveBeenCalledTimes(1);
    const arg = tx.cashFeeAccrual.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data).toEqual([
      { organizerId: 'org_1', sourceType: 'POS_PAYMENT_LINK', sourceId: 'link_1', cashAmountCents: 4000, commissionCents: 320 },
    ]);
    // 8% in person of $40.00 = $3.20 onto cashFeeBalance, via the same tx client
    expect(tx.organizer.update).toHaveBeenCalledTimes(1);
    expect(tx.organizer.update.mock.calls[0][0].data.cashFeeBalance).toEqual({ increment: 3.2 });
  });

  it('records each row cashLegAmount proportionally and they sum to exactly the cash leg', async () => {
    const { tx, purchases } = makeTx({ link: baseLink(), items });
    await runWith(tx, baseLink());
    await flush();

    expect(purchases).toHaveLength(2);
    expect(purchases.map((p) => p.cashLegAmount)).toEqual([24, 16]);
    const cashCents = purchases.reduce((sum, p) => sum + Math.round(p.cashLegAmount * 100), 0);
    expect(cashCents).toBe(4000);
    // row amounts are the full item prices (card + cash), not the card share
    expect(purchases.map((p) => p.amount)).toEqual([60, 40]);
  });

  it('computes platformFeeAmount on the CARD leg only', async () => {
    const { tx, purchases } = makeTx({ link: baseLink(), items });
    await runWith(tx, baseLink());
    await flush();

    const feeCents = purchases.reduce((sum, p) => sum + Math.round(p.platformFeeAmount * 100), 0);
    // 9.5% online of $60.00 = $5.70, not 9.5% of the $100.00 item subtotal ($9.50)
    expect(feeCents).toBe(570);
  });

  it('never gives a row more cash than the row is worth when an item was oversold out of the batch', async () => {
    // i2 oversold: only i1 (a $30 item) is recorded, so the whole $40 cash leg lands on that one row
    // and must be capped at the row's own $30.
    (sellItemUnits as jest.Mock)
      .mockResolvedValueOnce({ fullySoldOut: true, remainingStock: 0 })
      .mockRejectedValueOnce(new (jest.requireMock('../services/itemStockService').InsufficientStockError)('sold'));
    const { tx, purchases } = makeTx({ link: baseLink(), items: [{ id: 'i1', title: 'Lamp', price: 30 }] });
    await runWith(tx, baseLink());
    await flush();
    expect(purchases).toHaveLength(1);
    expect(purchases[0].cashLegAmount).toBe(30);
    expect(purchases[0].cashLegAmount).toBeLessThanOrEqual(purchases[0].amount);
  });
});

describe('recordPosPaymentLinkSale, split misc/quick-add link', () => {
  it('records the full sale (card + cash) with the fee on the card amount', async () => {
    const link = baseLink({ itemIds: [] });
    const { tx, purchases } = makeTx({ link });
    await runWith(tx, link);
    await flush();

    expect(purchases).toHaveLength(1);
    expect(purchases[0].itemId).toBeNull();
    expect(purchases[0].amount).toBe(100); // (6000 + 4000) / 100
    expect(purchases[0].cashLegAmount).toBe(40);
    expect(purchases[0].platformFeeAmount).toBe(5.7); // 9.5% online of the $60.00 card leg
    expect(tx.cashFeeAccrual.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('recordPosPaymentLinkSale, non-split link is unchanged', () => {
  it('does not touch the ledger, writes no cashLegAmount, and keeps the fee on the item subtotal', async () => {
    const link = baseLink({ isSplitPayment: false, cashAmountCents: null, cardAmountCents: null, amount: 10000 });
    const { tx, purchases } = makeTx({
      link,
      items: [
        { id: 'i1', title: 'Lamp', price: 60 },
        { id: 'i2', title: 'Chair', price: 40 },
      ],
    });
    await runWith(tx, link);
    await flush();

    expect(tx.cashFeeAccrual.createMany).not.toHaveBeenCalled();
    expect(tx.organizer.update).not.toHaveBeenCalled();
    expect(purchases.every((p) => !('cashLegAmount' in p))).toBe(true);
    const feeCents = purchases.reduce((sum, p) => sum + Math.round(p.platformFeeAmount * 100), 0);
    expect(feeCents).toBe(950); // 9.5% online of $100.00
  });
});

describe('recordPosPaymentLinkSale, idempotency', () => {
  it('an already-COMPLETED link returns before opening a transaction (no accrual)', async () => {
    const res = await recordPosPaymentLinkSale(baseLink({ status: 'COMPLETED' }) as any, opts);
    expect(res).toEqual({ recorded: false, alreadyCompleted: true, purchaseIds: [], oversoldItemIds: [] });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('a lost flip race records nothing and accrues nothing', async () => {
    const { tx, purchases } = makeTx({ link: baseLink(), flipCount: 0 });
    const res = await runWith(tx, baseLink());
    expect(res.recorded).toBe(false);
    expect(tx.cashFeeAccrual.createMany).not.toHaveBeenCalled();
    expect(tx.organizer.update).not.toHaveBeenCalled();
    expect(purchases).toHaveLength(0);
  });

  it('a duplicate ledger row (accrual already healed by getPaymentLink) does not increment the balance', async () => {
    const { tx } = makeTx({
      link: baseLink(),
      items: [{ id: 'i1', title: 'Lamp', price: 100 }],
      ledgerInsertCount: 0,
    });
    await runWith(tx, baseLink({ itemIds: ['i1'] }));
    await flush();
    expect(tx.cashFeeAccrual.createMany).toHaveBeenCalledTimes(1);
    expect(tx.organizer.update).not.toHaveBeenCalled();
  });

  it('an active referral discount accrues nothing (commission rounds to 0) but still records the cash leg on the rows', async () => {
    const { tx, purchases } = makeTx({
      link: baseLink(),
      items: [{ id: 'i1', title: 'Lamp', price: 100 }],
      referralDiscountExpiry: new Date(Date.now() + 86400000),
    });
    await runWith(tx, baseLink({ itemIds: ['i1'] }));
    await flush();
    expect(tx.cashFeeAccrual.createMany).not.toHaveBeenCalled();
    expect(purchases[0].cashLegAmount).toBe(40);
  });
});
