/**
 * invoiceExpiryJob, Square hold invoices (money review P0-2, 2026-09-29).
 *
 * A Square invoice is a hosted Payment Link the shopper can pay at any time. The job used to send it
 * down the "no payment mechanism, can never have been paid" branch: expire it, put the items back on
 * sale, leave the link live. Now every expiring Square invoice goes through the shared release gate
 * FIRST: paid -> record the sale (never expire), ambiguous -> leave PENDING for the next run, cleared
 * (link cancelled at Square) -> expire as before. The gate is a mock here (it has its own suite).
 */

const order: string[] = [];

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: unknown, fn: unknown) => fn }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    holdInvoice: { findMany: jest.fn() },
    notification: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../services/holdInvoicePaymentRecorder', () => ({
  markHoldInvoicePaid: jest.fn().mockResolvedValue({ recorded: true, alreadyPaid: false }),
}));
jest.mock('../services/crewInvasionRedemptionService', () => ({ releaseCrewInvasionRedemptionsForInvoice: jest.fn() }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/expireCheckoutSession', () => ({
  expireCheckoutSessionSafely: jest.fn().mockResolvedValue({ stillPayable: false, state: 'expired' }),
  retrieveCheckoutSessionAcrossAccounts: jest.fn(),
}));
const mockGate = jest.fn();
const mockRecordFromGate = jest.fn();
jest.mock('../services/holdInvoiceSquareRelease', () => ({
  prepareSquareInvoiceForRelease: (...a: any[]) => mockGate(...a),
  recordSquarePaidInvoiceFromGate: (...a: any[]) => mockRecordFromGate(...a),
}));

import { prisma } from '../lib/prisma';
import { expireCheckoutSessionSafely } from '../utils/expireCheckoutSession';
import { releaseCrewInvasionRedemptionsForInvoice } from '../services/crewInvasionRedemptionService';
import { reclaimExpiredInvoices } from '../jobs/invoiceExpiryJob';

const db: any = prisma;

const squareInvoice = (over: any = {}) => ({
  id: 'inv_sq',
  itemIds: ['i1'],
  stripeSessionId: null,
  shopperUserId: 'u1',
  invoiceMode: 'QUICK',
  expiresAt: new Date(Date.now() - 60_000),
  cartSessionId: null,
  cashAmountCents: null,
  organizerUserId: 'ou1',
  saleId: 'sale_1',
  stripeAccountId: null,
  processor: 'SQUARE',
  squareOrderId: 'order_1',
  squarePaymentLinkId: 'link_1',
  squarePaymentId: null,
  sale: { organizerId: 'org_1', organizer: { stripeConnectId: null } },
  ...over,
});

function txWith(flipCount: number) {
  const tx = {
    holdInvoice: { updateMany: jest.fn().mockImplementation(async () => { order.push('tx:flip'); return { count: flipCount }; }) },
    item: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    itemReservation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return tx;
}

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  delete process.env.INVOICE_EXPIRY_RECLAIM_DISABLED;
  mockGate.mockImplementation(async () => { order.push('gate'); return { outcome: 'CLEAR', detail: 'link cancelled' }; });
  mockRecordFromGate.mockResolvedValue(true);
  db.$transaction.mockImplementation(async (cb: any) => cb(txWith(1)));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('invoiceExpiryJob: Square invoices', () => {
  it('asks Square BEFORE the status flip, and expires only after the link is cleared', async () => {
    db.holdInvoice.findMany.mockResolvedValue([squareInvoice()]);
    const tx = txWith(1);
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));
    await reclaimExpiredInvoices();
    expect(mockGate).toHaveBeenCalledTimes(1);
    expect(mockGate.mock.calls[0][0]).toEqual(expect.objectContaining({ organizerId: 'org_1' }));
    expect(order).toEqual(['gate', 'tx:flip']);
    expect(tx.holdInvoice.updateMany.mock.calls[0][0].data).toEqual({ status: 'EXPIRED', reservationId: null });
    expect(releaseCrewInvasionRedemptionsForInvoice).toHaveBeenCalledWith('inv_sq');
    expect(expireCheckoutSessionSafely).not.toHaveBeenCalled(); // no Stripe session on a Square invoice
  });

  it('a Square invoice that was PAID is recorded and never expired', async () => {
    mockGate.mockResolvedValue({ outcome: 'PAID', paymentId: 'sqpay_9', detail: 'Square order order_1 is COMPLETED' });
    db.holdInvoice.findMany.mockResolvedValue([squareInvoice()]);
    await reclaimExpiredInvoices();
    expect(mockRecordFromGate).toHaveBeenCalledWith('inv_sq', expect.objectContaining({ outcome: 'PAID', paymentId: 'sqpay_9' }), expect.any(String));
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(releaseCrewInvasionRedemptionsForInvoice).not.toHaveBeenCalled();
    const Sentry = require('@sentry/node');
    expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining('SQUARE-PAID'), 'error');
  });

  it('an ambiguous Square answer leaves the invoice PENDING to be retried next run', async () => {
    mockGate.mockResolvedValue({ outcome: 'RETRY', detail: 'could not read Square order order_1: UNAUTHORIZED' });
    db.holdInvoice.findMany.mockResolvedValue([squareInvoice()]);
    await reclaimExpiredInvoices();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(releaseCrewInvasionRedemptionsForInvoice).not.toHaveBeenCalled();
  });

  it('one invoice needing a retry does not stop the others in the batch', async () => {
    mockGate
      .mockResolvedValueOnce({ outcome: 'RETRY', detail: 'down' })
      .mockResolvedValueOnce({ outcome: 'CLEAR', detail: 'ok' });
    db.holdInvoice.findMany.mockResolvedValue([squareInvoice({ id: 'inv_a' }), squareInvoice({ id: 'inv_b' })]);
    await reclaimExpiredInvoices();
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(releaseCrewInvasionRedemptionsForInvoice).toHaveBeenCalledWith('inv_b');
  });

  it('a gate that throws is contained per invoice (the job never crashes)', async () => {
    mockGate.mockRejectedValue(new Error('boom'));
    db.holdInvoice.findMany.mockResolvedValue([squareInvoice()]);
    await expect(reclaimExpiredInvoices()).resolves.toBeUndefined();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('a payment recorded at the gate but not yet saved keeps the invoice PENDING (record failure is not an expiry)', async () => {
    mockGate.mockResolvedValue({ outcome: 'PAID', paymentId: null, detail: 'order completed' });
    mockRecordFromGate.mockResolvedValue(false);
    db.holdInvoice.findMany.mockResolvedValue([squareInvoice()]);
    await reclaimExpiredInvoices();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('a legacy Stripe invoice with no session is still reclaimed WITHOUT asking Square', async () => {
    db.holdInvoice.findMany.mockResolvedValue([squareInvoice({ processor: 'STRIPE', squareOrderId: null, squarePaymentLinkId: null })]);
    await reclaimExpiredInvoices();
    expect(mockGate).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
