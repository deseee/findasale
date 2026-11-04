/**
 * Security fix (2026-11-04, finding #32): the Square single-item checkout validated a coupon but never
 * used it up, so one code discounted every later Square checkout until it expired, and the coupon's
 * minPurchaseAmount was never enforced.
 *
 * WHAT THIS PROVES
 *   - a successful checkout claims the coupon ACTIVE -> USED before charging and links it to the Purchase
 *   - a second checkout with the same (now USED) code is refused before any charge
 *   - a declined charge gives the coupon back (USED -> ACTIVE) so the shopper can try again
 *   - minPurchaseAmount is enforced with the same message as POST /api/coupons/validate
 *   - checkout without a coupon is untouched (legit path)
 *
 * The DB and every processor / side-effect service are mocked; fee math is the real feeCalculator.
 */

jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    item: { findUnique: jest.fn() },
    coupon: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    purchase: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));
jest.mock('../services/bulkLot/bulkLotConfig', () => ({ isBulkLotsEnabled: () => false }));
jest.mock('../services/bulkLot/bulkLotService', () => ({ BULK_LOT_MESSAGES: {}, bulkChannelRefusal: jest.fn().mockResolvedValue(null) }));
jest.mock('../services/bulkLot/bulkLotPackService', () => ({ loadLotPackSizes: jest.fn() }));
jest.mock('../controllers/bulkLotPackPaymentController', () => ({ tryHandleBulkPackPayment: jest.fn().mockResolvedValue(false) }));
jest.mock('../lib/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/receiptService', () => ({ generateReceipt: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/paymentDeduplicationService', () => ({
  checkPaymentDuplicate: jest.fn().mockResolvedValue({ isDuplicate: false }),
  storePaymentFingerprint: jest.fn().mockResolvedValue(undefined),
  logPaymentDuplicateWarning: jest.fn(),
}));
jest.mock('../services/itemStockService', () => {
  class InsufficientStockError extends Error {}
  return { sellItemUnits: jest.fn().mockResolvedValue({ fullySoldOut: true, remainingStock: 0 }), InsufficientStockError };
});
jest.mock('../services/soldFanOutService', () => ({ fanOutItemSoldWithdrawals: jest.fn() }));
jest.mock('../services/inventoryStockSync', () => ({ syncItemStock: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/checkoutGuard', () => {
  class CheckoutGuardError extends Error {}
  return {
    assertCheckoutAllowed: jest.fn().mockResolvedValue(undefined),
    assertGuestCheckoutAllowed: jest.fn().mockResolvedValue(undefined),
    recordConfirmedSignal: jest.fn(),
    CheckoutGuardError,
  };
});
jest.mock('../services/squarePaymentEligibilityService', () => ({ assertSaleCanAcceptSquarePayment: jest.fn().mockResolvedValue({ blocked: false }) }));
jest.mock('../services/squareErrorReasons', () => ({ describeSquareError: jest.fn() }));
jest.mock('../services/guestCheckoutVelocityGuard', () => ({
  checkGuestCheckoutVelocity: jest.fn(),
  recordGuestCheckoutFailure: jest.fn(),
  hashForVelocity: jest.fn(),
}));
jest.mock('../services/nativeShippingSuggestionService', () => ({ repriceNativeShippingForDestination: jest.fn(), ShippingHardBlockError: class extends Error {} }));
jest.mock('../services/squarePaymentService', () => ({
  resolveOrganizerSquareAccessToken: jest.fn().mockResolvedValue('sq_token'),
  SquareOnboardingIncompleteError: class extends Error {},
  buildSquareIdempotencyKey: jest.fn().mockReturnValue('idem_key'),
  createSquareCharge: jest.fn(),
  toSquareMoney: jest.fn(),
}));
jest.mock('../services/cashFeeService', () => ({
  applyCashDebtToAppFee: jest.fn().mockResolvedValue({ appFeeCents: 100, debtAppliedCents: 0 }),
  settleCashDebtCollection: jest.fn().mockResolvedValue(undefined),
  releaseCashDebtClaim: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/addressService', () => ({ saveOrUpdateDefaultAddress: jest.fn() }));
jest.mock('../services/creatorAffiliateService', () => ({
  recordAffiliateConversion: jest.fn(),
  resolveAffiliateAttribution: jest.fn().mockResolvedValue(null),
}));
jest.mock('../utils/square', () => ({ getSquarePlatformClient: jest.fn(), getPlatformSquareLocationId: jest.fn() }));
jest.mock('../services/squarePurchaseEngagementService', () => ({ fireSquarePurchaseEngagement: jest.fn() }));

import { prisma } from '../lib/prisma';
import { createSquarePayment } from '../controllers/squarePaymentController';
import { createSquareCharge } from '../services/squarePaymentService';

const db: any = prisma;

const ITEM = {
  id: 'item_1',
  title: 'Lamp',
  status: 'AVAILABLE',
  price: 20,
  listingType: 'FIXED',
  auctionStartPrice: null,
  organizerDiscountAmount: null,
  shippingAvailable: false,
  shippingPrice: null,
  sale: {
    id: 'sale_1',
    status: 'PUBLISHED',
    paymentsHeldAt: null,
    zip: '49079',
    organizerId: 'org_1',
    coversFee: false,
    organizer: {
      squareMerchantId: 'm_1',
      squareOnboarded: true,
      squareLocationId: 'loc_1',
      userId: 'org_user',
      referralDiscountExpiry: null,
      subscriptionTier: 'SIMPLE',
      lat: null,
      lng: null,
    },
  },
};

const COUPON = {
  id: 'cpn_1',
  code: 'SAVE5',
  userId: 'shopper_1',
  status: 'ACTIVE',
  expiresAt: new Date(Date.now() + 86400000),
  discountType: 'FIXED',
  discountValue: 5,
  maxDiscountAmount: null,
  minPurchaseAmount: null as number | null,
};

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

async function checkout(body: Record<string, unknown> = {}) {
  const res = makeRes();
  const req: any = {
    body: { itemId: 'item_1', sourceId: 'cnon_ok', ...body },
    user: { id: 'shopper_1', email: 's@example.com', name: 'Shopper' },
    headers: {},
  };
  await createSquarePayment(req, res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  db.item.findUnique.mockResolvedValue(ITEM);
  db.coupon.findUnique.mockImplementation(async () => ({ ...COUPON }));
  db.coupon.updateMany.mockResolvedValue({ count: 1 });
  db.coupon.update.mockResolvedValue({});
  db.purchase.findFirst.mockResolvedValue(null);
  db.purchase.create.mockResolvedValue({ id: 'pur_1', status: 'PAID' });
  (createSquareCharge as jest.Mock).mockResolvedValue({ ok: true, paymentId: 'sqp_1', cardFingerprint: null });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('createSquarePayment coupon redemption', () => {
  it('claims the coupon before charging, discounts the charge, and links it to the Purchase', async () => {
    const res = await checkout({ couponCode: 'save5' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(db.coupon.updateMany).toHaveBeenCalledWith({
      where: { id: 'cpn_1', userId: 'shopper_1', status: 'ACTIVE' },
      data: { status: 'USED', usedAt: expect.any(Date) },
    });
    const claimOrder = db.coupon.updateMany.mock.invocationCallOrder[0];
    const chargeOrder = (createSquareCharge as jest.Mock).mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(chargeOrder);
    expect((createSquareCharge as jest.Mock).mock.calls[0][0].amountCents).toBe(1500);
    expect(db.coupon.update).toHaveBeenCalledWith({ where: { id: 'cpn_1' }, data: { status: 'USED', redeemedPurchaseId: 'pur_1' } });
  });

  it('refuses a second checkout with a coupon that is already used, without charging', async () => {
    db.coupon.findUnique.mockImplementation(async (args: any) =>
      args.select ? { status: 'USED', redeemedPurchaseId: 'pur_other' } : { ...COUPON }
    );
    db.coupon.updateMany.mockResolvedValue({ count: 0 });
    db.purchase.findUnique.mockResolvedValue({ itemId: 'item_other', userId: 'shopper_1' });
    const res = await checkout({ couponCode: 'SAVE5' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(createSquareCharge).not.toHaveBeenCalled();
  });

  it('refuses a coupon whose status flipped to USED by the time it is claimed (race), without charging', async () => {
    db.coupon.findUnique.mockImplementation(async (args: any) =>
      args.select ? { status: 'USED', redeemedPurchaseId: null } : { ...COUPON }
    );
    db.coupon.updateMany.mockResolvedValue({ count: 0 });
    const res = await checkout({ couponCode: 'SAVE5' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(createSquareCharge).not.toHaveBeenCalled();
  });

  it('gives the coupon back when the card is declined', async () => {
    (createSquareCharge as jest.Mock).mockResolvedValue({ ok: false, message: 'Card declined' });
    const res = await checkout({ couponCode: 'SAVE5' });
    expect(res.status).toHaveBeenCalledWith(402);
    expect(db.coupon.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'cpn_1', status: 'USED', redeemedPurchaseId: null },
      data: { status: 'ACTIVE', usedAt: null },
    });
    expect(db.purchase.create).not.toHaveBeenCalled();
  });

  it('enforces minPurchaseAmount with the validate endpoint wording', async () => {
    db.coupon.findUnique.mockImplementation(async () => ({ ...COUPON, minPurchaseAmount: 25 }));
    const res = await checkout({ couponCode: 'SAVE5' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Minimum purchase of $25.00 required' });
    expect(db.coupon.updateMany).not.toHaveBeenCalled();
    expect(createSquareCharge).not.toHaveBeenCalled();
  });

  it('accepts a coupon when the purchase meets minPurchaseAmount', async () => {
    db.coupon.findUnique.mockImplementation(async () => ({ ...COUPON, minPurchaseAmount: 20 }));
    const res = await checkout({ couponCode: 'SAVE5' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('checkout without a coupon is unchanged and touches no coupon', async () => {
    const res = await checkout();
    expect(res.status).toHaveBeenCalledWith(200);
    expect((createSquareCharge as jest.Mock).mock.calls[0][0].amountCents).toBe(2000);
    expect(db.coupon.updateMany).not.toHaveBeenCalled();
    expect(db.coupon.update).not.toHaveBeenCalled();
  });
});
