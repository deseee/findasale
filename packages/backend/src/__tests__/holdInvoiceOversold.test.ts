/**
 * holdInvoicePaymentRecorder.markHoldInvoicePaid, oversold items on a PENDING invoice (payment review finding 2,
 * 2026-09-30). A paid item that cannot be fulfilled (InsufficientStockError) is refunded by its card share through
 * the dead-invoice refund service (or in full when nothing could be fulfilled); the fulfilled items are still
 * recorded; split tender / cash tells the organizer to return the cash part. The DB, Square refund service and
 * cross-channel hooks are mocks, so no real refund or payment call is ever made.
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
jest.mock('../services/marketplace/etsyConnector', () => ({ withdrawEtsyListingIfExists: jest.fn().mockResolvedValue('skipped') })); // ADR-135: soldFanOutService/itemDeletionService now import it
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
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
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


const sendEmail = (jest.requireMock('../lib/transactionalEmailService') as any).transactionalEmailService.emails.send as jest.Mock;
const notificationsCreated = () => db.notification.create.mock.calls.map((c: any[]) => c[0].data);
const oversell = (...ids: string[]) =>
  (sellItemUnits as jest.Mock).mockImplementation(async (id: string) => {
    if (ids.includes(id)) throw new (InsufficientStockError as any)(`no stock for ${id}`);
    return { fullySoldOut: true, remainingStock: 0 };
  });

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED;
  db.notification.findFirst.mockResolvedValue(null);
  db.notification.create.mockResolvedValue({});
  mockRefund.mockResolvedValue({ attempted: true, refunded: true, reason: 'REFUNDED_PARTIAL', refundId: 'rf_1' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

const pending = (over: any = {}) => invoice({ status: 'PENDING', ...over });

describe('PENDING invoice, one item oversold', () => {
  it('records the fulfilled items and refunds ONLY the oversold item card share (exact cents)', async () => {
    oversell('i3');
    const { tx, purchases } = makeTx();
    const res = await run(pending(), tx);
    expect(res.recorded).toBe(true);
    expect(purchases.map((p) => p.itemId)).toEqual(['i1', 'i2']);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund.mock.calls[0][0]).toMatchObject({
      invoiceId: 'inv_1', organizerId: 'org_1', paymentId: 'sqpay_1', expectedAmountCents: 2800, refundAmountCents: 999, kind: 'oversold:hold-invoice:inv_1',
    });
    expect(res.oversoldSettlement).toMatchObject({ status: 'REFUNDED', refundCents: 999, fullRefund: false, cashToReturnCents: 0 });
  });

  it('tells the organizer and the shopper accurately, and the confirmation names only the items that sold', async () => {
    oversell('i3');
    const { tx } = makeTx();
    await run(pending(), tx);
    const made = notificationsCreated();
    expect(made.map((n: any) => n.type)).toEqual(['payment_reconciliation', 'payment_refunded']);
    expect(made[0].userId).toBe('ou1');
    expect(made[0].body).toContain('$9.99');
    expect(made[0].body).toContain('The rest of the sale was recorded');
    expect(made[1].userId).toBe('u1');
    expect(JSON.stringify(made)).not.toMatch(/stripe|\u2014/i);
    const confirmation = tx.notification.createMany.mock.calls[0][0].data.find((n: any) => n.type === 'payment_completed');
    expect(confirmation.body).toContain('2 items');
    const shopperConfirmEmail = sendEmail.mock.calls.map((c) => c[0]).find((m: any) => String(m.subject).startsWith('Payment confirmed'));
    expect(shopperConfirmEmail.subject).toContain('2 items');
    expect(shopperConfirmEmail.html).toContain('$18.01'); // 28.00 minus the refunded 9.99
  });

  it('kill switch: nothing refunded, organizer told to refund from Square by hand, Sentry told, sale still recorded', async () => {
    process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED = '1';
    mockRefund.mockResolvedValue({ attempted: false, refunded: false, reason: 'DISABLED (SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED=1)' });
    oversell('i3');
    const { tx, purchases } = makeTx();
    const res = await run(pending(), tx);
    expect(res.recorded).toBe(true);
    expect(purchases).toHaveLength(2);
    expect(res.oversoldSettlement?.status).toBe('MANUAL');
    expect(notificationsCreated()[0].body).toContain('Square dashboard');
    expect(notificationsCreated()[0].body).toContain('automatic refunds are turned off');
    expect(mockCaptureMessage).toHaveBeenCalledWith(expect.stringContaining('could not be refunded'), expect.anything());
  });

  it('a failed refund is a manual-refund notice plus a Sentry error', async () => {
    mockRefund.mockResolvedValue({ attempted: true, refunded: false, reason: 'REFUND_FAILED (BAD_REQUEST)' });
    oversell('i3');
    const { tx } = makeTx();
    const res = await run(pending(), tx);
    expect(res.oversoldSettlement?.status).toBe('MANUAL');
    expect(mockCaptureMessage).toHaveBeenCalledWith(expect.stringContaining('could not be refunded'), expect.objectContaining({ level: 'error' }));
  });

  it('split tender: card share refunded and the organizer told to return the cash part', async () => {
    oversell('i3');
    const { tx } = makeTx();
    const res = await run(pending({ cashAmountCents: 1000, cardAmountCents: 1800 }), tx);
    const s = res.oversoldSettlement!;
    expect(s.cashToReturnCents).toBeGreaterThan(0);
    expect(s.refundCents + s.cashToReturnCents).toBeGreaterThanOrEqual(998);
    expect(s.refundCents + s.cashToReturnCents).toBeLessThanOrEqual(1000);
    expect(mockRefund.mock.calls[0][0]).toMatchObject({ expectedAmountCents: 1800, refundAmountCents: s.refundCents });
    const body = notificationsCreated()[0].body;
    expect(body).toContain('in cash');
    expect(body).toContain('return that cash');
  });
});

describe('PENDING invoice, every item oversold', () => {
  it('full refund of the captured card amount, no Purchase rows, no "Payment confirmed" anything', async () => {
    oversell('i1', 'i2', 'i3');
    const { tx, purchases } = makeTx();
    const res = await run(pending(), tx);
    expect(res).toMatchObject({ recorded: true, alreadyPaid: false, oversoldSettlement: { status: 'REFUNDED', refundCents: 2800, fullRefund: true } });
    expect(purchases).toHaveLength(0);
    expect(mockRefund.mock.calls[0][0].refundAmountCents).toBeUndefined();
    expect(tx.notification.createMany).not.toHaveBeenCalled();
    const subjects = sendEmail.mock.calls.map((c) => String(c[0].subject));
    expect(subjects.some((s) => s.startsWith('Payment confirmed') || s.startsWith('Payment received'))).toBe(false);
    expect(notificationsCreated()[0].title).toContain('refunded');
  });
});

describe('other processors and sources', () => {
  it('a Stripe-processor invoice has no automatic refund path: manual notice, refund service never called', async () => {
    oversell('i3');
    const { tx } = makeTx();
    const res = await run(pending(), tx, STRIPE);
    expect(mockRefund).not.toHaveBeenCalled();
    expect(res.oversoldSettlement?.status).toBe('MANUAL');
    expect(notificationsCreated()[0].body).toContain('payment processor dashboard');
  });

  it('a fully-cash register sale (no processor payment) refunds nothing through Square and asks the organizer to return the cash', async () => {
    oversell('i3');
    const { tx } = makeTx();
    db.holdInvoice.findUnique.mockResolvedValue(pending({ cashAmountCents: 2800, cardAmountCents: 0 }));
    db.item.findMany.mockResolvedValue(ITEMS);
    db.itemReservation.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));
    const res = await markHoldInvoicePaid('inv_1', { processor: 'STRIPE', externalPaymentId: null }, { source: 'pos-cash' });
    await flush();
    expect(mockRefund).not.toHaveBeenCalled();
    expect(res.oversoldSettlement).toMatchObject({ status: 'NOTHING_TO_REFUND', refundCents: 0, cashToReturnCents: 999 });
    expect(notificationsCreated()[0].body).toContain('return the $9.99');
  });

  it('a normal invoice with nothing oversold never calls the refund service', async () => {
    oversell();
    const { tx, purchases } = makeTx();
    const res = await run(pending(), tx);
    expect(purchases).toHaveLength(3);
    expect(mockRefund).not.toHaveBeenCalled();
    expect(res.oversoldSettlement).toBeUndefined();
  });
});
