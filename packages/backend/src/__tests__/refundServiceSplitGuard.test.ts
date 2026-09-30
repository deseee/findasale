/**
 * refundService.executeVerifiedRefund split-tender guard (Wave 2, 2026-09-29).
 * Split tender (Purchase.cashLegAmount > 0) is created only by the Square-only POS paths, so a split row
 * should never reach the Stripe refund path. This proves the defensive guard: a Stripe refund that would
 * reach into the cash leg is rejected BEFORE the PAID->REFUNDING claim and before any Stripe call, a refund
 * that fits inside the card leg (card-first) goes through unchanged, and non-split and cash-recorded rows
 * are unaffected. Prisma, Stripe and the notification services are mocked.
 *
 * NOT EXECUTED at authoring time (jest cannot run on the authoring device); CI is the first real run.
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
    purchase: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    itemReservation: { updateMany: jest.fn() },
    item: { updateMany: jest.fn() },
    organizer: { updateMany: jest.fn() },
    boothCartLeg: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));
const mockRefundsCreate = jest.fn();
jest.mock('../utils/stripe', () => ({ getStripe: () => ({ refunds: { create: (...a: any[]) => mockRefundsCreate(...a) } }) }));
jest.mock('../services/vendorBoothSaleNotificationService', () => ({
  notifyVendorBoothSaleRefunded: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../controllers/vendorBoothCartController', () => ({ settleHubOwnerReversalForLeg: jest.fn() }));
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
    stripePaymentIntentId: 'pi_123',
    stripeAccountId: 'acct_1',
    chargeType: 'DIRECT',
    boothCartTransactionId: null,
    cashLegAmount: null,
    platformFeeAmount: 0,
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
  mockRefundsCreate.mockResolvedValue({ id: 're_1' });
});

describe('executeVerifiedRefund split-tender guard', () => {
  it('rejects a Stripe refund that reaches into the cash leg, before any claim or Stripe call', async () => {
    // $100 sale, $40 in cash, so the card captured $60. A $75 refund would need $15 by hand.
    db.purchase.findUnique.mockResolvedValue(purchaseRow({ cashLegAmount: 40 }));
    let caught: any;
    try {
      await executeVerifiedRefund('p1', 75, 'organizer');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RefundError);
    expect(caught.statusCode).toBe(400);
    expect(caught.message).toContain('paid partly in cash');
    expect(caught.message).toContain('$60.00');
    expect(caught.details).toMatchObject({
      code: 'SPLIT_TENDER_CARD_LIMIT',
      cardCollectedAmount: 60,
      cashPortionToRefundByHand: 15,
      requestedAmount: 75,
    });
    expect(db.purchase.updateMany).not.toHaveBeenCalled(); // no REFUNDING claim taken
    expect(mockRefundsCreate).not.toHaveBeenCalled();
  });

  it('also rejects a full refund of a split purchase (would over-refund the card by the cash leg)', async () => {
    db.purchase.findUnique.mockResolvedValue(purchaseRow({ cashLegAmount: 40 }));
    await expect(executeVerifiedRefund('p1', 100, 'admin')).rejects.toMatchObject({
      details: { cashPortionToRefundByHand: 40 },
    });
    expect(mockRefundsCreate).not.toHaveBeenCalled();
  });

  it('allows a refund that fits inside the card leg (card-first) and sends exactly that amount to Stripe', async () => {
    db.purchase.findUnique.mockResolvedValue(purchaseRow({ cashLegAmount: 40 }));
    const out = await executeVerifiedRefund('p1', 60, 'organizer');
    expect(out.refundedAmount).toBe(60);
    expect(mockRefundsCreate).toHaveBeenCalledTimes(1);
    expect(mockRefundsCreate.mock.calls[0][0].amount).toBe(6000);
  });

  it('leaves a non-split purchase untouched: full amount goes to Stripe', async () => {
    db.purchase.findUnique.mockResolvedValue(purchaseRow());
    await executeVerifiedRefund('p1', 100, 'organizer');
    expect(mockRefundsCreate.mock.calls[0][0].amount).toBe(10000);
  });

  it('does not apply to a cash-recorded purchase (no card charge to over-refund)', async () => {
    db.purchase.findUnique.mockResolvedValue(
      purchaseRow({ stripePaymentIntentId: 'cash_abc', cashLegAmount: 40, chargeType: 'DESTINATION' })
    );
    await expect(executeVerifiedRefund('p1', 100, 'organizer')).resolves.toMatchObject({ refundedAmount: 100 });
    expect(mockRefundsCreate).not.toHaveBeenCalled();
  });
});
