/**
 * invoiceExpiryJob gives a Crew Invasion redemption back when an UNPAID discounted invoice expires
 * (2026-09-29). Per-member model: the member's one use is tied to the invoice that carried it, so an
 * invoice that dies unpaid must free it (while the code itself is still unexpired) and a PAID invoice
 * must keep it for good.
 *
 * Proves: the restore runs once per expired invoice, AFTER the revert transaction committed; it does
 * not run when the flip lost the race (another path already settled the invoice) or when Stripe shows
 * the invoice was actually paid (stranded-PAID reconcile); and a Stripe-backed invoice is restored too.
 */

const order: string[] = [];

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: (_o: unknown, fn: unknown) => fn }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    holdInvoice: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../services/holdInvoicePaymentRecorder', () => ({
  markHoldInvoicePaid: jest.fn().mockResolvedValue({ recorded: true, alreadyPaid: false }),
}));
jest.mock('../services/crewInvasionRedemptionService', () => ({
  releaseCrewInvasionRedemptionsForInvoice: jest.fn(),
}));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/expireCheckoutSession', () => ({
  expireCheckoutSessionSafely: jest.fn().mockResolvedValue({ stillPayable: false, state: 'expired' }),
  retrieveCheckoutSessionAcrossAccounts: jest.fn(),
}));

import { prisma } from '../lib/prisma';
import { markHoldInvoicePaid } from '../services/holdInvoicePaymentRecorder';
import { releaseCrewInvasionRedemptionsForInvoice } from '../services/crewInvasionRedemptionService';
import { expireCheckoutSessionSafely, retrieveCheckoutSessionAcrossAccounts } from '../utils/expireCheckoutSession';
import { reclaimExpiredInvoices } from '../jobs/invoiceExpiryJob';

const db: any = prisma;
const release = releaseCrewInvasionRedemptionsForInvoice as jest.Mock;

const invoice = (over: any = {}) => ({
  id: 'inv_1',
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
  sale: { organizer: { stripeConnectId: null } },
  ...over,
});

function txWith(flipCount: number) {
  return {
    holdInvoice: { updateMany: jest.fn().mockImplementation(async () => { order.push('tx:flip'); return { count: flipCount }; }) },
    item: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    itemReservation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  delete process.env.INVOICE_EXPIRY_RECLAIM_DISABLED;
  delete process.env.INVOICE_PAID_RECONCILE_DISABLED;
  release.mockImplementation(async () => { order.push('release'); return 1; });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('invoiceExpiryJob: crew redemption restore', () => {
  it('restores the member\'s redemption once, after the revert transaction committed (no-session invoice)', async () => {
    db.holdInvoice.findMany.mockResolvedValue([invoice()]);
    const tx = txWith(1);
    db.$transaction.mockImplementation(async (cb: any) => { const r = await cb(tx); order.push('tx:commit'); return r; });
    await reclaimExpiredInvoices();
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith('inv_1');
    expect(order).toEqual(['tx:flip', 'tx:commit', 'release']);
  });

  it('restores it for a Stripe-backed invoice whose Checkout Session simply expired unpaid', async () => {
    db.holdInvoice.findMany.mockResolvedValue([invoice({ stripeSessionId: 'cs_1' })]);
    (retrieveCheckoutSessionAcrossAccounts as jest.Mock).mockResolvedValue({ status: 'expired', payment_status: 'unpaid' });
    db.$transaction.mockImplementation(async (cb: any) => cb(txWith(1)));
    await reclaimExpiredInvoices();
    expect(release).toHaveBeenCalledWith('inv_1');
    expect(expireCheckoutSessionSafely).toHaveBeenCalledTimes(1);
  });

  it('does NOT restore when the flip lost the race (another path already settled the invoice)', async () => {
    db.holdInvoice.findMany.mockResolvedValue([invoice()]);
    db.$transaction.mockImplementation(async (cb: any) => cb(txWith(0)));
    await reclaimExpiredInvoices();
    expect(release).not.toHaveBeenCalled();
  });

  it('does NOT restore a PAID invoice: Stripe shows it paid, so it is reconciled and the redemption stays used', async () => {
    db.holdInvoice.findMany.mockResolvedValue([invoice({ stripeSessionId: 'cs_paid' })]);
    (retrieveCheckoutSessionAcrossAccounts as jest.Mock).mockResolvedValue({
      status: 'complete', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 2520,
    });
    await reclaimExpiredInvoices();
    expect(markHoldInvoicePaid).toHaveBeenCalledWith('inv_1', { processor: 'STRIPE', externalPaymentId: 'pi_1' }, { source: 'reconcile' });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('restores once per expired invoice when several expire in one run', async () => {
    db.holdInvoice.findMany.mockResolvedValue([invoice({ id: 'inv_a' }), invoice({ id: 'inv_b' })]);
    db.$transaction.mockImplementation(async (cb: any) => cb(txWith(1)));
    await reclaimExpiredInvoices();
    expect(release.mock.calls.map((c: unknown[]) => c[0])).toEqual(['inv_a', 'inv_b']);
  });
});
