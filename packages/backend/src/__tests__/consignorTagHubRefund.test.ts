/**
 * Refund of a consignor price tag sold at the HUB register (refundService.executeVerifiedRefund).
 *
 * A hub tag is minted with BOTH consignorId and vendorBoothId (the booth of the organizer who printed it), so it refunds like any consigned
 * hub item. Since Stripe was retired (owner decision 2026-11-04) executeVerifiedRefund completes only cash / manual rows (card tags paid on
 * Square refund through squareRefundService):
 *   - a historical Stripe booth-leg tag purchase is refused with STRIPE_CLOSED_MANUAL_REFUND_REQUIRED, nothing claimed
 *   - a cash hub tag is refunded, the vendor is told, and the item is NEVER put back to AVAILABLE nor its stock given back (it stays SOLD /
 *     stockSold 1); the refunded Purchase is what the consignor ledger excludes
 * Same mocking style as refundServiceSplitGuard.test.ts.
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
const mockNotifyVendorRefunded = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/vendorBoothSaleNotificationService', () => ({
  notifyVendorBoothSaleRefunded: (...a: any[]) => mockNotifyVendorRefunded(...a),
}));
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
    processor: 'CASH',
    stripePaymentIntentId: 'cash_booth_leg',
    stripeAccountId: null,
    chargeType: null,
    boothCartTransactionId: 'cart1',
    cashLegAmount: null,
    platformFeeAmount: null,
    bulkQuantity: null,
    user: null,
    sale: null,
    item: { title: 'Consigned tag $5.00', vendorBooth: { id: 'boothV', stripeAccountId: null, stripeAccountType: null, vendorName: 'Vera Vintage' } },
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

describe('executeVerifiedRefund, consignor tag minted at the hub register', () => {
  it('refuses a historical Stripe booth-leg tag purchase (Stripe retired) without claiming it', async () => {
    db.purchase.findUnique.mockResolvedValue(
      hubTagPurchase({ processor: 'STRIPE', stripePaymentIntentId: 'pi_booth_leg', stripeAccountId: 'acct_v', chargeType: 'DIRECT' })
    );
    let caught: any;
    try {
      await executeVerifiedRefund('ptag1', 5, 'organizer');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RefundError);
    expect(caught.statusCode).toBe(409);
    expect(caught.details).toMatchObject({ code: 'STRIPE_CLOSED_MANUAL_REFUND_REQUIRED' });
    expect(db.purchase.updateMany).not.toHaveBeenCalled();
  });

  it('refunds a cash hub tag and tells the vendor', async () => {
    db.purchase.findUnique.mockResolvedValue(hubTagPurchase());
    const out = await executeVerifiedRefund('ptag1', 5, 'organizer');
    expect(out.refundedAmount).toBe(5);
    expect(mockNotifyVendorRefunded).toHaveBeenCalledWith('ptag1');
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
});
