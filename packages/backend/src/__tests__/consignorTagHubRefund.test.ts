/**
 * Refund of a consignor price tag sold at the HUB register (refundService.executeVerifiedRefund).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 *
 * A hub tag is minted with BOTH consignorId and vendorBoothId (the booth of the organizer who printed it), so it refunds like any consigned
 * hub item:
 *   - the refund goes to the BOOTH's own Stripe account as a Direct-charge refund with the application fee reversed
 *   - the hub owner's revenue-share Transfer is reversed pro rata on the booth leg
 *   - the item is NEVER put back to AVAILABLE and its stock is never given back (it stays SOLD / stockSold 1); the refunded Purchase is what
 *     the consignor ledger excludes
 * Same mocking style as refundServiceSplitGuard.test.ts.
 */
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
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
jest.mock('../utils/stripe', () => ({
  getStripe: () => ({ refunds: { create: (...a: any[]) => mockRefundsCreate(...a) } }),
  isStripeNotConfiguredError: () => false,
}));
const mockNotifyVendorRefunded = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/vendorBoothSaleNotificationService', () => ({
  notifyVendorBoothSaleRefunded: (...a: any[]) => mockNotifyVendorRefunded(...a),
}));
const mockSettleReversal = jest.fn().mockResolvedValue(undefined);
jest.mock('../controllers/vendorBoothCartController', () => ({ settleHubOwnerReversalForLeg: (...a: any[]) => mockSettleReversal(...a) }));
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue(undefined) } },
}));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));

import { prisma } from '../lib/prisma';
import { executeVerifiedRefund, RefundError } from '../services/refundService';

const db = prisma as any;

function hubTagPurchase(over: Record<string, any> = {}) {
  return {
    id: 'ptag1',
    userId: null,
    itemId: 'tagitem1',
    amount: 5,
    status: 'PAID',
    createdAt: new Date(),
    stripePaymentIntentId: 'pi_booth_leg',
    stripeAccountId: 'acct_v',
    chargeType: 'DIRECT',
    boothCartTransactionId: 'cart1',
    cashLegAmount: null,
    platformFeeAmount: null,
    bulkQuantity: null,
    user: null,
    sale: null,
    item: { title: 'Consigned tag $5.00', vendorBooth: { id: 'boothV', stripeAccountId: 'acct_v', stripeAccountType: 'standard', vendorName: 'Vera Vintage' } },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.purchase.updateMany.mockResolvedValue({ count: 1 });
  db.purchase.update.mockResolvedValue({});
  db.itemReservation.updateMany.mockResolvedValue({ count: 0 });
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.boothCartLeg.findUnique.mockResolvedValue({ id: 'leg1', hubOwnerShareAmount: 1.25, amountCents: 500 });
  db.boothCartLeg.updateMany.mockResolvedValue({ count: 1 });
  db.boothCartLeg.update.mockResolvedValue({});
  mockRefundsCreate.mockResolvedValue({ id: 're_1' });
});

describe('executeVerifiedRefund, consignor tag minted at the hub register', () => {
  it('refunds on the BOOTH\'s own Stripe account with the application fee reversed', async () => {
    db.purchase.findUnique.mockResolvedValue(hubTagPurchase());
    const out = await executeVerifiedRefund('ptag1', 5, 'organizer');
    expect(out.refundedAmount).toBe(5);
    expect(mockRefundsCreate).toHaveBeenCalledTimes(1);
    const [params, opts] = mockRefundsCreate.mock.calls[0];
    expect(params).toMatchObject({ amount: 500, refund_application_fee: true });
    expect(opts).toMatchObject({ stripeAccount: 'acct_v' });
  });

  it('reverses the hub owner\'s revenue-share Transfer on the booth leg, pro rata', async () => {
    db.purchase.findUnique.mockResolvedValue(hubTagPurchase());
    await executeVerifiedRefund('ptag1', 5, 'organizer');
    // $1.25 hub-side cut on a $5.00 leg, whole leg refunded: all 125 cents come back
    expect(db.boothCartLeg.update).toHaveBeenCalledWith({ where: { id: 'leg1' }, data: { hubOwnerReversalOwedCents: { increment: 125 } } });
    expect(mockSettleReversal).toHaveBeenCalledWith('leg1');
  });

  it('never returns the tag item to AVAILABLE or gives back its stock', async () => {
    db.purchase.findUnique.mockResolvedValue(hubTagPurchase());
    await executeVerifiedRefund('ptag1', 5, 'organizer');
    // the only item write is the guarded stock decrement, and it excludes CONSIGNOR_TAG items
    expect(db.item.updateMany).toHaveBeenCalledTimes(1);
    expect(db.item.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'tagitem1', listingType: { not: 'CONSIGNOR_TAG' } } });
    for (const call of db.item.updateMany.mock.calls) {
      expect(call[0].data?.status).toBeUndefined();
    }
  });

  it('refuses (and releases the REFUNDING claim) when the tag\'s booth has no Stripe account on file', async () => {
    db.purchase.findUnique.mockResolvedValue(
      hubTagPurchase({ item: { title: 'Consigned tag $5.00', vendorBooth: { id: 'boothV', stripeAccountId: null, stripeAccountType: null, vendorName: 'Vera Vintage' } } })
    );
    let caught: any;
    try {
      await executeVerifiedRefund('ptag1', 5, 'organizer');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RefundError);
    expect(caught.statusCode).toBe(400);
    expect(mockRefundsCreate).not.toHaveBeenCalled();
    expect(db.purchase.updateMany).toHaveBeenLastCalledWith({ where: { id: 'ptag1', status: 'REFUNDING' }, data: { status: 'PAID' } });
  });
});
