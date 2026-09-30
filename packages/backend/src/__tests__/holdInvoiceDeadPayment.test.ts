/**
 * holdInvoicePaymentRecorder.markHoldInvoicePaid, money review (2026-09-29):
 *   P0-2  a captured payment on a released/expired invoice is never silently dropped:
 *           Square + every item still AVAILABLE  -> the sale is recorded (invoice revived)
 *           Square + an item no longer available -> full refund through the dead-invoice refund service
 *           refund not issued / Stripe           -> Sentry error + organizer notification, nothing recorded
 *         and the notification is deduped, a REFUNDED replay is silent.
 *   P1-4/5 the item queries are pinned to the invoice's sale and organizer; a foreign item id is never sold.
 *   P2    the cash leg follows the rows when the invoice also carries lines that have no row (misc lines).
 * The DB, Square refund service and cross-channel hooks are mocks.
 */

const mockCaptureException = jest.fn();
const mockCaptureMessage = jest.fn();
jest.mock('@sentry/node', () => ({
  captureException: (...a: any[]) => mockCaptureException(...a),
  captureMessage: (...a: any[]) => mockCaptureMessage(...a),
}));
jest.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    holdInvoice: { findUnique: jest.fn() },
    item: { findMany: jest.fn() },
    itemReservation: { findMany: jest.fn() },
    notification: { findFirst: jest.fn(), create: jest.fn() },
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
const mockRefund = jest.fn();
jest.mock('../services/squareDeadInvoiceRefundService', () => ({
  refundSquarePaymentForDeadInvoice: (...a: any[]) => mockRefund(...a),
  squareDeadInvoiceAutoRefundDisabled: () => process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED === '1',
}));

import { prisma } from '../lib/prisma';
import { sellItemUnits } from '../services/itemStockService';
import { markHoldInvoicePaid } from '../services/holdInvoicePaymentRecorder';

const db: any = prisma;
const flush = () => new Promise((r) => setImmediate(r));

const item = (id: string, price: number, status = 'AVAILABLE') => ({ id, title: `Item ${id}`, price, status });
const ITEMS = [item('i1', 12.34), item('i2', 5.67), item('i3', 9.99)];

const invoice = (over: any = {}) => ({
  id: 'inv_1',
  status: 'CANCELLED',
  saleId: 'sale_1',
  shopperUserId: 'u1',
  organizerUserId: 'ou1',
  itemIds: ['i1', 'i2', 'i3'],
  totalAmount: 2800,
  platformFeeAmount: 200,
  cashAmountCents: null,
  cardAmountCents: 2800,
  chargeType: null,
  stripeAccountId: null,
  guestEmail: null,
  guestName: null,
  shippingAddressLine1: null,
  sale: { id: 'sale_1', organizerId: 'org_1', title: 'Estate Finds' },
  shopper: { id: 'u1', email: 's@example.com', name: 'Shopper', guildXp: 0 },
  organizer: { id: 'ou1', email: 'o@example.com', name: 'Org' },
  ...over,
});

function makeTx(opts: { flipCount?: number } = {}) {
  const purchases: any[] = [];
  const tx: any = {
    holdInvoice: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.flipCount ?? 1 }),
      findUnique: jest.fn().mockResolvedValue({ status: 'PAID' }),
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
    cashFeeAccrual: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return { tx, purchases };
}

const SQUARE = { processor: 'SQUARE' as const, externalPaymentId: 'sqpay_1' };
const STRIPE = { processor: 'STRIPE' as const, externalPaymentId: 'pi_1' };

async function run(inv: any, tx: any, ref: any = SQUARE, items: any[] = ITEMS) {
  db.holdInvoice.findUnique.mockResolvedValue(inv);
  db.item.findMany.mockResolvedValue(items);
  db.itemReservation.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (cb: any) => cb(tx));
  const res = await markHoldInvoicePaid('inv_1', ref, { source: 'webhook' });
  await flush();
  return res;
}

const notificationsCreated = () => db.notification.create.mock.calls.map((c: any[]) => c[0].data);

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED;
  (sellItemUnits as jest.Mock).mockResolvedValue({ fullySoldOut: true, remainingStock: 0 });
  db.notification.findFirst.mockResolvedValue(null);
  db.notification.create.mockResolvedValue({});
  mockRefund.mockResolvedValue({ attempted: true, refunded: true, reason: 'REFUNDED', refundId: 'rf_1' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('dead invoice + Square payment, items still AVAILABLE: the sale is recorded', () => {
  it.each(['CANCELLED', 'EXPIRED'])('a %s invoice is revived: flip guarded on the dead status, Purchase rows written, no refund', async (status) => {
    const { tx, purchases } = makeTx();
    const res = await run(invoice({ status }), tx);
    expect(res.recorded).toBe(true);
    expect(tx.holdInvoice.updateMany.mock.calls[0][0].where).toEqual({ id: 'inv_1', status });
    expect(tx.holdInvoice.updateMany.mock.calls[0][0].data).toEqual(expect.objectContaining({ status: 'PAID', releasedAt: null, squarePaymentId: 'sqpay_1' }));
    expect(purchases).toHaveLength(3);
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('still raises the Sentry error and leaves an organizer notification (the reconciliation record)', async () => {
    const { tx } = makeTx();
    await run(invoice(), tx);
    expect(mockCaptureException).toHaveBeenCalled();
    const msg = String(mockCaptureException.mock.calls[0][0].message);
    expect(msg).toContain('DEAD-INVOICE-PAYMENT');
    expect(msg).toContain('inv_1');
    expect(mockCaptureException.mock.calls[0][1].extra).toEqual(expect.objectContaining({ invoiceId: 'inv_1', invoiceStatus: 'CANCELLED' }));
    // the sale is recorded through the normal path; the organizer is told about the late payment
    expect(notificationsCreated().map((n: any) => n.title)).toEqual(['Late payment recorded']);
    expect(notificationsCreated()[0]).toEqual(expect.objectContaining({ userId: 'ou1', type: 'payment_reconciliation' }));
  });

  it('a misc-only invoice (no inventory lines) is revived without touching items', async () => {
    const { tx, purchases } = makeTx();
    const res = await run(invoice({ itemIds: [], totalAmount: 5000, platformFeeAmount: 0, cardAmountCents: 5000 }), tx, SQUARE, []);
    expect(res.recorded).toBe(true);
    expect(purchases).toHaveLength(1);
    expect(mockRefund).not.toHaveBeenCalled();
  });
});

describe('dead invoice + Square payment, an item no longer available: refund', () => {
  const sold = [item('i1', 12.34), item('i2', 5.67, 'SOLD'), item('i3', 9.99)];

  it('refunds the captured payment in full and notifies the organizer and the shopper', async () => {
    const { tx, purchases } = makeTx();
    const res = await run(invoice(), tx, SQUARE, sold);
    expect(res).toEqual({ recorded: false, alreadyPaid: false, deadInvoice: true });
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund.mock.calls[0][0]).toEqual({ invoiceId: 'inv_1', organizerId: 'org_1', paymentId: 'sqpay_1', expectedAmountCents: 2800 });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(purchases).toHaveLength(0);
    const made = notificationsCreated();
    expect(made.map((n: any) => n.title)).toEqual(['Late payment refunded', 'Payment refunded']);
    expect(made[0]).toEqual(expect.objectContaining({ userId: 'ou1', type: 'payment_reconciliation' }));
    expect(made[0].body).toContain('inv_1');
    expect(made[1]).toEqual(expect.objectContaining({ userId: 'u1' }));
    expect(JSON.stringify(made)).not.toMatch(/—/); // no em dash in user-facing copy
  });

  it('an item that is missing from the sale scope counts as unavailable', async () => {
    const { tx } = makeTx();
    await run(invoice(), tx, SQUARE, [item('i1', 12.34), item('i2', 5.67)]);
    expect(mockRefund).toHaveBeenCalledTimes(1);
  });

  it('a refund that is NOT issued leaves the Sentry error and a manual-review notification', async () => {
    mockRefund.mockResolvedValue({ attempted: true, refunded: false, reason: 'PAYMENT_READ_FAILED (boom)' });
    const { tx } = makeTx();
    const res = await run(invoice(), tx, SQUARE, sold);
    expect(res.deadInvoice).toBe(true);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('could not be refunded automatically'),
      expect.objectContaining({ level: 'error', extra: expect.objectContaining({ invoiceId: 'inv_1', paymentId: 'sqpay_1' }) })
    );
    expect(notificationsCreated().map((n: any) => n.title)).toEqual(['Late payment needs review']);
  });

  it('the kill switch skips the refund service result and files the manual record', async () => {
    process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED = '1';
    mockRefund.mockResolvedValue({ attempted: false, refunded: false, reason: 'DISABLED' });
    const { tx } = makeTx();
    await run(invoice(), tx, SQUARE, sold);
    expect(notificationsCreated().map((n: any) => n.title)).toEqual(['Late payment needs review']);
  });

  it('a refund service that throws is contained: manual record, never thrown', async () => {
    mockRefund.mockRejectedValue(new Error('square down'));
    const { tx } = makeTx();
    await expect(run(invoice(), tx, SQUARE, sold)).resolves.toEqual({ recorded: false, alreadyPaid: false, deadInvoice: true });
    expect(notificationsCreated().map((n: any) => n.title)).toEqual(['Late payment needs review']);
  });

  it('an availability lookup that fails never triggers a refund on a guess', async () => {
    const { tx } = makeTx();
    db.holdInvoice.findUnique.mockResolvedValue(invoice());
    db.item.findMany.mockRejectedValueOnce(new Error('db blip'));
    const res = await markHoldInvoicePaid('inv_1', SQUARE, { source: 'webhook' });
    expect(res.deadInvoice).toBe(true);
    expect(mockRefund).not.toHaveBeenCalled();
    expect(notificationsCreated().map((n: any) => n.title)).toEqual(['Late payment needs review']);
    void tx;
  });

  it('a revive that loses an item mid-transaction is rolled back and refunded', async () => {
    const { tx, purchases } = makeTx();
    const { InsufficientStockError } = jest.requireMock('../services/itemStockService');
    (sellItemUnits as jest.Mock).mockRejectedValueOnce(new InsufficientStockError('gone'));
    const res = await run(invoice(), tx);
    expect(res.recorded).toBe(false);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(purchases).toHaveLength(0);
  });
});

describe('dead invoice + notification dedupe', () => {
  it('a redelivered webhook adds no second organizer notification', async () => {
    db.notification.findFirst.mockResolvedValue({ id: 'existing' });
    const { tx } = makeTx();
    await run(invoice(), tx, SQUARE, [item('i1', 12.34, 'SOLD'), item('i2', 5.67), item('i3', 9.99)]);
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});

describe('dead invoice + Stripe payment: alert only, nothing recorded, no refund here', () => {
  it('records nothing, refunds nothing, notifies the organizer', async () => {
    const { tx, purchases } = makeTx();
    const res = await run(invoice(), tx, STRIPE);
    expect(res).toEqual({ recorded: false, alreadyPaid: false, deadInvoice: true });
    expect(mockCaptureException).toHaveBeenCalled();
    expect(mockRefund).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(purchases).toHaveLength(0);
    expect(notificationsCreated().map((n: any) => n.title)).toEqual(['Late payment needs review']);
  });

  it('a REFUNDED invoice receiving a duplicate delivery is a silent no-op', async () => {
    const { tx } = makeTx();
    const res = await run(invoice({ status: 'REFUNDED' }), tx, SQUARE);
    expect(res).toEqual({ recorded: false, alreadyPaid: true });
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockRefund).not.toHaveBeenCalled();
  });
});

describe('item scope (P1-4/5)', () => {
  it('bundled items are looked up by id, sale AND organizer', async () => {
    const { tx } = makeTx();
    await run(invoice({ status: 'PENDING' }), tx, STRIPE);
    const where = db.item.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ id: { in: ['i1', 'i2', 'i3'] }, saleId: 'sale_1', sale: { organizerId: 'org_1' } });
  });

  it('an item id outside the sale scope is never sold, gets no Purchase row, and is reported', async () => {
    const { tx, purchases } = makeTx();
    await run(invoice({ status: 'PENDING' }), tx, STRIPE, [item('i1', 12.34), item('i2', 5.67)]); // i3 is another tenant's
    const soldIds = (sellItemUnits as jest.Mock).mock.calls.map((c) => c[0]);
    expect(soldIds).not.toContain('i3');
    expect(purchases.map((p) => p.itemId).sort()).toEqual(['i1', 'i2']);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('outside its sale scope'),
      expect.objectContaining({ extra: expect.objectContaining({ foreignItemIds: ['i3'] }) })
    );
  });
});

describe('cash leg with lines that have no Purchase row (P2)', () => {
  it('a $12 misc line on a $28 + $12 invoice with $10 cash: the rows carry cash 10 * 28/40, no truncation', async () => {
    const { tx, purchases } = makeTx();
    const res = await run(
      invoice({ status: 'PENDING', totalAmount: 4000, platformFeeAmount: 300, cardAmountCents: 3000, cashAmountCents: 1000 }),
      tx,
      STRIPE
    );
    expect(res.recorded).toBe(true);
    const cashCents = purchases.map((p) => Math.round(p.cashLegAmount * 100));
    expect(cashCents.reduce((a, b) => a + b, 0)).toBe(700);
    const amountCents = purchases.map((p) => Math.round(p.amount * 100));
    expect(amountCents.reduce((a, b) => a + b, 0)).toBe(2800); // the misc line has no row
    purchases.forEach((p) => expect(p.cashLegAmount).toBeLessThanOrEqual(p.amount));
    // the commission still accrues on the WHOLE cash leg actually collected
    expect(tx.cashFeeAccrual.createMany.mock.calls[0][0].data[0]).toEqual(expect.objectContaining({ cashAmountCents: 1000 }));
  });
});
