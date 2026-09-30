/**
 * posPaymentLinkRecorder.recordPosPaymentLinkSale, oversold items (payment review finding 2, 2026-09-30).
 * A paid item that cannot be fulfilled (InsufficientStockError) is refunded by its card share through the
 * dead-invoice refund service (or in full when nothing could be fulfilled); the fulfilled items are still
 * recorded; split tender tells the organizer to return the cash part. Prisma, Square and the cross-channel hooks
 * are mocks, so no real refund or payment call is ever made.
 */

const mockCaptureMessage = jest.fn();
jest.mock('@sentry/node', () => ({ captureMessage: (...a: any[]) => mockCaptureMessage(...a), captureException: jest.fn() }));
const mockNotificationCreate = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    organizer: { findUnique: jest.fn() },
    item: { findMany: jest.fn() },
    notification: { create: (...a: any[]) => mockNotificationCreate(...a) },
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
const mockCreateNotification = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/notificationService', () => ({ createNotification: (...a: any[]) => mockCreateNotification(...a) }));
jest.mock('../services/stripeConnectService', () => ({ shouldUseDirectCharge: jest.fn().mockResolvedValue(false) }));
jest.mock('../utils/stripe', () => ({ getStripe: () => ({ paymentLinks: { update: jest.fn().mockResolvedValue({}) } }) }));
jest.mock('../services/squareCheckoutLinkService', () => ({ deleteSquareCheckoutLink: jest.fn().mockResolvedValue({ ok: true }) }));
const mockRefund = jest.fn();
jest.mock('../services/squareDeadInvoiceRefundService', () => ({
  refundSquarePaymentForDeadInvoice: (...a: any[]) => mockRefund(...a),
  squareDeadInvoiceAutoRefundDisabled: () => process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED === '1',
}));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue(undefined) } } }));

import { prisma } from '../lib/prisma';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { recordPosPaymentLinkSale } from '../services/posPaymentLinkRecorder';

const db: any = prisma;
const flush = () => new Promise((r) => setImmediate(r));

const ITEMS = [
  { id: 'a', title: 'Lamp', price: 60, saleId: 'sale_1', ownerOrg: 'org_1' },
  { id: 'b', title: 'Chair', price: 40, saleId: 'sale_1', ownerOrg: 'org_1' },
];

const link = (over: any = {}) => ({
  id: 'link_1', organizerId: 'org_1', saleId: 'sale_1', processor: 'SQUARE', stripePaymentLinkId: null,
  squarePaymentLinkId: 'sq_1', status: 'ACTIVE', amount: 10000, itemIds: ['a', 'b'],
  chargeType: 'DESTINATION', stripeAccountId: null, isSplitPayment: false, cashAmountCents: null, cardAmountCents: null, ...over,
});

function makeTx(l: any) {
  const purchases: any[] = [];
  const tx: any = {
    pOSPaymentLink: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn().mockResolvedValue(l), update: jest.fn().mockResolvedValue({}) },
    sale: { findUnique: jest.fn().mockResolvedValue({ organizerId: l.organizerId, organizer: { subscriptionTier: 'SIMPLE', stripeConnectId: null, referralDiscountExpiry: null } }) },
    item: {
      findMany: jest.fn().mockImplementation(async ({ where }: any) =>
        ITEMS.filter((it) => where.id.in.includes(it.id) && (where.saleId === undefined || it.saleId === where.saleId) && (where.sale === undefined || it.ownerOrg === where.sale.organizerId))
      ),
    },
    purchase: { create: jest.fn().mockImplementation(async ({ data }: any) => { purchases.push(data); return { id: `pur_${purchases.length}` }; }) },
    cashFeeAccrual: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    organizer: { update: jest.fn().mockResolvedValue({}) },
  };
  return { tx, purchases };
}

/** sellItemUnits succeeds except for the ids listed, which throw the real oversold error. */
const oversell = (...ids: string[]) =>
  (sellItemUnits as jest.Mock).mockImplementation(async (id: string) => {
    if (ids.includes(id)) throw new (InsufficientStockError as any)(`no stock for ${id}`);
    return { fullySoldOut: true, remainingStock: 0 };
  });

const orgNotifications = () => mockNotificationCreate.mock.calls.map((c) => c[0].data);
const run = async (l: any) => {
  const { tx, purchases } = makeTx(l);
  db.$transaction.mockImplementation(async (cb: any) => cb(tx));
  const res = await recordPosPaymentLinkSale(l, { source: 'webhook', processor: 'SQUARE', externalPaymentId: 'sqpay_1' });
  await flush();
  return { res, purchases };
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED;
  db.organizer.findUnique.mockResolvedValue({ userId: 'user_1' });
  mockNotificationCreate.mockResolvedValue({});
  mockRefund.mockResolvedValue({ attempted: true, refunded: true, reason: 'REFUNDED_PARTIAL', refundId: 'ref_1' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('recordPosPaymentLinkSale oversold settlement', () => {
  it('one item oversold: the fulfilled item is recorded and ONLY the oversold item\'s card share is refunded', async () => {
    oversell('b');
    const { res, purchases } = await run(link());
    expect(res.recorded).toBe(true);
    expect(res.oversoldItemIds).toEqual(['b']);
    expect(purchases.map((p) => p.itemId)).toEqual(['a']);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    const call = mockRefund.mock.calls[0][0];
    expect(call).toMatchObject({ paymentId: 'sqpay_1', organizerId: 'org_1', refundAmountCents: 4000, expectedAmountCents: 10000, kind: 'oversold:pos-link:link_1' });
    expect(res.oversoldSettlement).toMatchObject({ status: 'REFUNDED', refundCents: 4000, fullRefund: false, cashToReturnCents: 0 });
  });

  it('the organizer notice is accurate: refunded, the rest recorded, and no Stripe dashboard wording', async () => {
    oversell('b');
    await run(link());
    const n = orgNotifications();
    expect(n).toHaveLength(1);
    expect(n[0].userId).toBe('user_1');
    expect(n[0].body).toContain('$40.00');
    expect(n[0].body).toContain('refunded');
    expect(n[0].body).toContain('The rest of the sale was recorded');
    expect(`${n[0].title} ${n[0].body}`).not.toMatch(/stripe/i);
  });

  it('the "payment received" notice reports only the amount that stays paid', async () => {
    oversell('b');
    await run(link());
    const received = mockCreateNotification.mock.calls.map((c) => c[0]).find((c) => c.type === 'payment_received');
    expect(received.body).toContain('$60.00');
    expect(received.body).not.toContain('$100.00');
  });

  it('every item oversold: full refund of the captured amount, no Purchase row, no "payment received" notice', async () => {
    oversell('a', 'b');
    const { res, purchases } = await run(link());
    expect(purchases).toHaveLength(0);
    expect(mockRefund.mock.calls[0][0].refundAmountCents).toBeUndefined(); // full: the refund service refunds what was captured
    expect(res.oversoldSettlement).toMatchObject({ status: 'REFUNDED', refundCents: 10000, fullRefund: true });
    expect(mockCreateNotification.mock.calls.map((c) => c[0].type)).not.toContain('payment_received');
    expect(orgNotifications()[0].title).toContain('refunded');
  });

  it('kill switch: nothing is refunded, the organizer is told to refund it by hand from Square, and Sentry is told', async () => {
    process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED = '1';
    mockRefund.mockResolvedValue({ attempted: false, refunded: false, reason: 'DISABLED (SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED=1)' });
    oversell('b');
    const { res } = await run(link());
    expect(res.oversoldSettlement?.status).toBe('MANUAL');
    const n = orgNotifications()[0];
    expect(n.type).toBe('POS_PAYMENT_NEEDS_REFUND_REVIEW');
    expect(n.body).toContain('Square dashboard');
    expect(n.body).toContain('$40.00');
    expect(n.body).toContain('automatic refunds are turned off');
    expect(mockCaptureMessage).toHaveBeenCalledWith(expect.stringContaining('could not be refunded'), expect.anything());
  });

  it('a refund that fails is a manual-refund notice plus a Sentry error, and the sale still recorded', async () => {
    mockRefund.mockResolvedValue({ attempted: true, refunded: false, reason: 'REFUND_FAILED (BAD_REQUEST)' });
    oversell('b');
    const { res, purchases } = await run(link());
    expect(res.recorded).toBe(true);
    expect(purchases).toHaveLength(1);
    expect(res.oversoldSettlement?.status).toBe('MANUAL');
    expect(mockCaptureMessage).toHaveBeenCalledWith(expect.stringContaining('could not be refunded'), expect.objectContaining({ level: 'error' }));
  });

  it('split tender: card share refunded, the organizer told to return the cash part, kept row carries only its cash share', async () => {
    oversell('b');
    // 100.00 sale = 60.00 card + 40.00 cash; rows 60 / 40, row b oversold
    const { res, purchases } = await run(link({ amount: 6000, isSplitPayment: true, cashAmountCents: 4000, cardAmountCents: 6000 }));
    expect(mockRefund.mock.calls[0][0]).toMatchObject({ refundAmountCents: 2400, expectedAmountCents: 6000 });
    expect(res.oversoldSettlement).toMatchObject({ refundCents: 2400, cashToReturnCents: 1600 });
    const n = orgNotifications()[0];
    expect(n.body).toContain('$16.00 in cash');
    expect(n.body).toContain('return that cash');
    expect(purchases[0].itemId).toBe('a');
    expect(purchases[0].cashLegAmount).toBe(24); // row a's own share of the cash leg, not the whole cash leg
  });

  it('no oversold item means no refund call and no settlement in the result', async () => {
    oversell();
    const { res } = await run(link());
    expect(mockRefund).not.toHaveBeenCalled();
    expect(res.oversoldSettlement).toBeUndefined();
    expect(orgNotifications()).toHaveLength(0);
  });

  it('a second delivery for an already COMPLETED link never refunds again', async () => {
    oversell('b');
    const res = await recordPosPaymentLinkSale(link({ status: 'COMPLETED' }), { source: 'webhook', processor: 'SQUARE', externalPaymentId: 'sqpay_1' });
    expect(res.alreadyCompleted).toBe(true);
    expect(mockRefund).not.toHaveBeenCalled();
  });
});
