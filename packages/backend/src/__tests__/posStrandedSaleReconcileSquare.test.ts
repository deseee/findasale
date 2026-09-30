/**
 * posStrandedSaleReconcileCron: Square release gate on expiry reclaim + refund sweeps (2026-09-29).
 *
 * reclaimExpiredPaymentLink used to flip the POS link row first and treat a failed Square link delete as
 * non-fatal, leaving an expired-looking Square link payable. Square links now run the shared release
 * gate (services/holdInvoiceSquareRelease.ts, also used by reservationController.releasePaymentLink)
 * BEFORE the flip: PAID -> record the sale, skip the reclaim; RETRY -> leave the link ACTIVE;
 * CLEAR -> proceed. Stripe links are unchanged. The gate itself has its own suite (mocked here).
 * Also covers the two refund sweeps the cron now runs, each individually try/caught.
 */

const order: string[] = [];

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: unknown, fn: unknown) => fn }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    pOSPaymentLink: { findMany: jest.fn(), findUnique: jest.fn() },
    organizer: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
const mockStripe = {
  checkout: { sessions: { list: jest.fn() } },
  paymentLinks: { update: jest.fn() },
};
jest.mock('../utils/stripe', () => ({ getStripe: () => mockStripe }));
jest.mock('../services/stripeConnectService', () => ({ shouldUseDirectCharge: jest.fn().mockResolvedValue(false) }));
const mockRecordSale = jest.fn();
jest.mock('../services/posPaymentLinkRecorder', () => ({
  recordPosPaymentLinkSale: (...a: any[]) => mockRecordSale(...a),
}));
const mockOrderStatus = jest.fn();
const mockDeleteLink = jest.fn();
jest.mock('../services/squareCheckoutLinkService', () => ({
  getSquareOrderPaymentStatus: (...a: any[]) => mockOrderStatus(...a),
  deleteSquareCheckoutLink: (...a: any[]) => mockDeleteLink(...a),
}));
const mockGate = jest.fn();
jest.mock('../services/holdInvoiceSquareRelease', () => ({
  prepareSquareInvoiceForRelease: (...a: any[]) => mockGate(...a),
}));
const mockStuckRefunds = jest.fn();
const mockPosFulfillment = jest.fn();
jest.mock('../services/squareRefundService', () => ({
  reconcileStuckSquareRefunds: (...a: any[]) => mockStuckRefunds(...a),
  reconcilePosFulfillmentFailures: (...a: any[]) => mockPosFulfillment(...a),
}));

import { prisma } from '../lib/prisma';
import {
  reconcileStrandedPosSales,
  manuallyReclaimPosPaymentLink,
  runPosRefundSweeps,
} from '../jobs/posStrandedSaleReconcileCron';

const db: any = prisma;

const baseLink = (over: any = {}) => ({
  id: 'link_1',
  organizerId: 'org_1',
  status: 'ACTIVE',
  processor: 'SQUARE',
  itemIds: ['i1'],
  amount: 5000,
  createdAt: new Date(Date.now() - 60 * 60 * 1000),
  expiresAt: new Date(Date.now() - 30 * 60 * 1000),
  squareOrderId: 'order_1',
  squarePaymentLinkId: 'sqlink_1',
  stripePaymentLinkId: null,
  chargeType: null,
  stripeAccountId: null,
  ...over,
});

const stripeLink = (over: any = {}) =>
  baseLink({ processor: 'STRIPE', squareOrderId: null, squarePaymentLinkId: null, stripePaymentLinkId: 'plink_1', chargeType: 'DESTINATION', ...over });

function txWith(flipCount: number) {
  return {
    pOSPaymentLink: {
      updateMany: jest.fn().mockImplementation(async () => { order.push('tx:flip'); return { count: flipCount }; }),
    },
    item: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    itemReservation: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  delete process.env.POS_RECONCILE_DISABLED;
  delete process.env.POS_PAYMENT_LINK_EXPIRY_RECLAIM_DISABLED;
  mockGate.mockImplementation(async () => { order.push('gate'); return { outcome: 'CLEAR', detail: 'link cancelled' }; });
  mockOrderStatus.mockResolvedValue({ ok: true, paid: false, state: 'OPEN', paymentId: null });
  mockDeleteLink.mockResolvedValue({ ok: true, cancelledOrderId: 'order_1' });
  mockRecordSale.mockResolvedValue({ recorded: true, alreadyCompleted: false });
  mockStripe.checkout.sessions.list.mockResolvedValue({ data: [] });
  mockStripe.paymentLinks.update.mockResolvedValue({});
  db.$transaction.mockImplementation(async (cb: any) => cb(txWith(1)));
  mockStuckRefunds.mockResolvedValue({ checked: 0, finalized: 0, revertedToPaid: 0, stillPending: 0, skipped: 0, errors: 0 });
  mockPosFulfillment.mockResolvedValue({ checked: 0, refunded: 0, pending: 0 });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

// Stripe branches of these jobs are gated on isStripePlatformClosed(process.env) now that the Stripe
// platform account is shut down (STRIPE_PLATFORM_CLOSED defaults to closed). These tests exercise the
// legacy Stripe branches with a mocked Stripe client, so they opt out of the gate explicitly.
const __prevStripeClosed = process.env.STRIPE_PLATFORM_CLOSED;
beforeAll(() => { process.env.STRIPE_PLATFORM_CLOSED = 'false'; });
afterAll(() => {
  if (__prevStripeClosed === undefined) delete process.env.STRIPE_PLATFORM_CLOSED;
  else process.env.STRIPE_PLATFORM_CLOSED = __prevStripeClosed;
});

describe('reclaimExpiredPaymentLink: Square release gate', () => {
  it('CLEAR: runs the gate BEFORE the flip, then flips the link to EXPIRED', async () => {
    db.pOSPaymentLink.findMany.mockResolvedValue([baseLink()]);
    const tx = txWith(1);
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));
    await reconcileStrandedPosSales();
    expect(mockGate).toHaveBeenCalledTimes(1);
    expect(mockGate.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        organizerId: 'org_1',
        invoice: expect.objectContaining({ id: 'link_1', processor: 'SQUARE', squareOrderId: 'order_1', squarePaymentLinkId: 'sqlink_1' }),
      })
    );
    expect(order).toEqual(['gate', 'tx:flip']);
    expect(tx.pOSPaymentLink.updateMany.mock.calls[0][0].data).toEqual({ status: 'EXPIRED' });
    expect(mockRecordSale).not.toHaveBeenCalled();
  });

  it('PAID: records the sale via the recorder and skips the reclaim', async () => {
    mockGate.mockResolvedValue({ outcome: 'PAID', paymentId: 'sqpay_9', detail: 'Square order order_1 is COMPLETED' });
    db.pOSPaymentLink.findMany.mockResolvedValue([baseLink()]);
    await reconcileStrandedPosSales();
    expect(mockRecordSale).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'link_1' }),
      expect.objectContaining({ source: 'reconcile', processor: 'SQUARE', externalPaymentId: 'sqpay_9' })
    );
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(mockDeleteLink).not.toHaveBeenCalled();
  });

  it('PAID: a recorder failure is swallowed and the link is still not reclaimed', async () => {
    mockGate.mockResolvedValue({ outcome: 'PAID', paymentId: null, detail: 'completed' });
    mockRecordSale.mockRejectedValue(new Error('db down'));
    db.pOSPaymentLink.findMany.mockResolvedValue([baseLink()]);
    await expect(reconcileStrandedPosSales()).resolves.toBeUndefined();
    expect(mockRecordSale).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ externalPaymentId: undefined }));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('RETRY: leaves the link ACTIVE for the next run (no flip, no delete)', async () => {
    mockGate.mockResolvedValue({ outcome: 'RETRY', detail: 'could not read Square order order_1: UNAUTHORIZED' });
    db.pOSPaymentLink.findMany.mockResolvedValue([baseLink()]);
    await reconcileStrandedPosSales();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(mockDeleteLink).not.toHaveBeenCalled();
    expect(mockRecordSale).not.toHaveBeenCalled();
  });

  it('one link needing a retry does not stop the next link in the batch', async () => {
    mockGate
      .mockResolvedValueOnce({ outcome: 'RETRY', detail: 'square down' })
      .mockImplementationOnce(async () => { order.push('gate'); return { outcome: 'CLEAR', detail: 'ok' }; });
    db.pOSPaymentLink.findMany.mockResolvedValue([baseLink({ id: 'link_a' }), baseLink({ id: 'link_b' })]);
    await reconcileStrandedPosSales();
    expect(mockGate).toHaveBeenCalledTimes(2);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('stale (>7d) Square link also goes through the gate before the flip', async () => {
    db.pOSPaymentLink.findMany.mockResolvedValue([baseLink({ createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) })]);
    await reconcileStrandedPosSales();
    expect(order).toEqual(['gate', 'tx:flip']);
    expect(mockOrderStatus).not.toHaveBeenCalled(); // stale branch still skips the pre-check; the gate does the asking
  });

  it('the expiry-reclaim kill switch skips the gate and the flip', async () => {
    process.env.POS_PAYMENT_LINK_EXPIRY_RECLAIM_DISABLED = '1';
    db.pOSPaymentLink.findMany.mockResolvedValue([baseLink()]);
    await reconcileStrandedPosSales();
    expect(mockGate).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('Stripe link: gate is never consulted, link flips and the Payment Link is deactivated as before', async () => {
    db.pOSPaymentLink.findMany.mockResolvedValue([stripeLink()]);
    await reconcileStrandedPosSales();
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockOrderStatus).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(mockStripe.paymentLinks.update).toHaveBeenCalledWith('plink_1', { active: false }, undefined);
  });
});

describe('manuallyReclaimPosPaymentLink: gate results map to outcomes', () => {
  it('PAID -> already_paid, RETRY -> error, CLEAR -> released', async () => {
    mockGate.mockResolvedValueOnce({ outcome: 'PAID', paymentId: 'p', detail: 'paid' });
    expect(await manuallyReclaimPosPaymentLink(baseLink() as any)).toEqual({ outcome: 'already_paid' });

    mockGate.mockResolvedValueOnce({ outcome: 'RETRY', detail: 'nope' });
    const retry = await manuallyReclaimPosPaymentLink(baseLink() as any);
    expect(retry.outcome).toBe('error');

    mockGate.mockImplementationOnce(async () => ({ outcome: 'CLEAR', detail: 'ok' }));
    expect(await manuallyReclaimPosPaymentLink(baseLink() as any)).toEqual({ outcome: 'released', itemsReleased: 0 });
  });
});

describe('runPosRefundSweeps', () => {
  it('runs both sweeps with sensible args', async () => {
    await runPosRefundSweeps();
    expect(mockStuckRefunds).toHaveBeenCalledWith({ olderThanMinutes: 10, limit: 50 });
    expect(mockPosFulfillment).toHaveBeenCalledWith({ olderThanMinutes: 10, limit: 50 });
  });

  it('a failing stuck-refund sweep does not stop the fulfillment sweep, and vice versa', async () => {
    mockStuckRefunds.mockRejectedValue(new Error('square down'));
    await expect(runPosRefundSweeps()).resolves.toBeUndefined();
    expect(mockPosFulfillment).toHaveBeenCalledTimes(1);
    const Sentry = require('@sentry/node');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    mockStuckRefunds.mockReset().mockResolvedValue({ checked: 0, finalized: 0, revertedToPaid: 0, stillPending: 0, skipped: 0, errors: 0 });
    mockPosFulfillment.mockReset().mockRejectedValue(new Error('db down'));
    await expect(runPosRefundSweeps()).resolves.toBeUndefined();
    expect(mockStuckRefunds).toHaveBeenCalledTimes(1); // reset above, so 1 call means it ran before the failing sweep
  });

  it('POS_RECONCILE_DISABLED=1 skips both sweeps', async () => {
    process.env.POS_RECONCILE_DISABLED = '1';
    await runPosRefundSweeps();
    expect(mockStuckRefunds).not.toHaveBeenCalled();
    expect(mockPosFulfillment).not.toHaveBeenCalled();
  });
});
