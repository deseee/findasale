/**
 * refundService.executeVerifiedRefund after Stripe's retirement (owner decision 2026-11-04).
 *
 * executeVerifiedRefund now completes only cash / manual rows. A historical Stripe card purchase (split tender
 * or not) is refused up front with 409 STRIPE_CLOSED_MANUAL_REFUND_REQUIRED: no PAID->REFUNDING claim is
 * taken, nothing is written, and no processor is called. A cash-recorded row (including one carrying a cash
 * leg) is refunded and recorded as before. Prisma and the notification services are mocked.
 */

jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    purchase: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    itemReservation: { updateMany: jest.fn() },
    item: { updateMany: jest.fn() },
    organizer: { updateMany: jest.fn() },
    user: { findUnique: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(0), // guarded 0 -> 1 in-stock status flip after a refund
  },
}));
// Single-inventory-number work: refunds/sold-elsewhere fire a background syncItemStock; this suite does not exercise it.
jest.mock('../services/inventoryStockSync', () => ({ syncItemStock: jest.fn(async () => ({ outcomes: [] })) }));
jest.mock('../services/vendorBoothSaleNotificationService', () => ({
  notifyVendorBoothSaleRefunded: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue(undefined) } },
}));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));

import { prisma } from '../lib/prisma';
import { executeVerifiedRefund, RefundError } from '../services/refundService';

const db = prisma as any;

function purchaseRow(over: Record<string, any> = {}) {
  return {
    id: 'p1',
    userId: 'u1',
    itemId: 'i1',
    amount: 100,
    status: 'PAID',
    createdAt: new Date(),
    processor: 'STRIPE',
    stripePaymentIntentId: 'pi_123',
    stripeAccountId: 'acct_1',
    chargeType: 'DIRECT',
    boothCartTransactionId: null,
    cashLegAmount: null,
    platformFeeAmount: 0,
    bulkQuantity: null,
    user: { id: 'u1', email: 'a@b.c', name: 'A' },
    sale: { organizer: { id: 'o1', userId: 'ou1', businessName: 'Org', stripeConnectId: null } },
    item: { title: 'Lamp', vendorBooth: null },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.purchase.updateMany.mockResolvedValue({ count: 1 });
  db.purchase.update.mockResolvedValue({});
  db.itemReservation.updateMany.mockResolvedValue({ count: 0 });
  db.item.updateMany.mockResolvedValue({ count: 1 });
});

describe('executeVerifiedRefund with Stripe retired', () => {
  it.each([
    ['a plain Stripe card purchase', {}],
    ['a split-tender Stripe purchase', { cashLegAmount: 40 }],
  ])('refuses %s with STRIPE_CLOSED_MANUAL_REFUND_REQUIRED, before any claim or write', async (_label, over) => {
    db.purchase.findUnique.mockResolvedValue(purchaseRow(over));
    let caught: any;
    try {
      await executeVerifiedRefund('p1', 60, 'organizer');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RefundError);
    expect(caught.statusCode).toBe(409);
    expect(caught.details).toMatchObject({ code: 'STRIPE_CLOSED_MANUAL_REFUND_REQUIRED', manualRefundRequired: true, purchaseId: 'p1' });
    expect(db.purchase.updateMany).not.toHaveBeenCalled(); // no REFUNDING claim taken
    expect(db.purchase.update).not.toHaveBeenCalled();
  });

  it('refunds a cash-recorded purchase (including one with a cash leg) and records it', async () => {
    db.purchase.findUnique.mockResolvedValue(
      purchaseRow({ processor: 'CASH', stripePaymentIntentId: 'cash_abc', cashLegAmount: 40, chargeType: 'DESTINATION' })
    );
    await expect(executeVerifiedRefund('p1', 100, 'organizer')).resolves.toMatchObject({ refundedAmount: 100 });
    expect(db.purchase.updateMany).toHaveBeenCalledWith({ where: { id: 'p1', status: 'PAID' }, data: { status: 'REFUNDING' } });
    expect(db.purchase.update.mock.calls[0][0].data).toMatchObject({ status: 'REFUNDED', refundedAmount: 100, refundInitiatedBy: 'organizer' });
  });

  it('treats a row with no payment reference at all as cash (nothing to send back to a card)', async () => {
    db.purchase.findUnique.mockResolvedValue(purchaseRow({ processor: null, stripePaymentIntentId: null, chargeType: null }));
    await expect(executeVerifiedRefund('p1', 100, 'admin')).resolves.toMatchObject({ refundedAmount: 100 });
  });
});
