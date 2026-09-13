/**
 * POS manual card entry — Square rebuild (2026-09-12).
 *
 * WHAT THIS SUITE EXISTS FOR: controllers/posPaymentController.ts's manualCardPayment is a new
 * endpoint (register-entered, card-not-present charge with no shopper account and no
 * POSPaymentRequest row -- see that function's own header comment for the full design). This
 * suite covers the money/HTTP outcomes a payment endpoint needs verified before it goes live,
 * not the code shape:
 *   - happy path: a real catalog item is charged for (item price + CNP fee), Square is called
 *     with the correct total/appFee, a PAID Purchase row is created, and the item is marked sold
 *   - cross-tenant: a saleId belonging to a DIFFERENT organizer is rejected 403 before any
 *     Square call is made
 *   - unavailable item: a SOLD/non-AVAILABLE item is rejected 400 before any Square call
 *   - idempotent retry: a second call whose Square adapter call resolves to the SAME
 *     squarePaymentId (simulating a client retry after a dropped response) does not create a
 *     second Purchase row -- it returns the existing one
 *   - discount: a valid organizer-applied discount reduces the charged subtotal (and therefore
 *     the CNP fee, which is computed on the discounted subtotal)
 *
 * MOCKING NOTES: same convention as this controller's sibling test files
 * (posSplitPaymentFee.test.ts, posPaymentControllerPricing.test.ts) -- squarePos.preflightAccountStatus
 * and .createAndCapturePayment are mocked (the same seam posPaymentController.ts calls), Socket.io,
 * notifications, eBay/Shopify/FB hooks and the collusion checkout-guard are mocked, and
 * resolvePosDiscount is left real/unmocked (pure DB + arithmetic, no external calls).
 */

import { prisma } from '../lib/prisma';

// -- Mocks (hoisted by ts-jest above these declarations -- `var`, not `const`, deliberately) --
var mockPreflightAccountStatus = jest.fn();
var mockCreateAndCapturePayment = jest.fn();

jest.mock('../services/squarePosPaymentAdapter', () => ({
  preflightAccountStatus: (...args: any[]) => mockPreflightAccountStatus(...args),
  createAndCapturePayment: (...args: any[]) => mockCreateAndCapturePayment(...args),
}));

jest.mock('../lib/socket', () => ({
  getIO: jest.fn(() => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) })),
}));
jest.mock('../lib/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../controllers/ebayController', () => ({
  endEbayListingIfExists: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/shopifyService', () => ({
  markShopifyItemSold: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/facebookNudgeService', () => ({
  notifyFacebookExportedItemSold: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/marketplaceStockSyncService', () => ({
  syncMarketplaceStock: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/checkoutGuard', () => ({
  assertCheckoutAllowed: jest.fn().mockResolvedValue(undefined),
  recordSuspectedSignal: jest.fn().mockResolvedValue(undefined),
  CheckoutGuardError: class CheckoutGuardError extends Error {},
}));

// -- Import AFTER the mocks --------------------------------------------------------------
import { manualCardPayment } from '../controllers/posPaymentController';

const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('POS manual card entry -- manualCardPayment (Square rebuild)', () => {
  /** Build an isolated, Square-onboarded TEAMS organizer + PUBLISHED sale + AVAILABLE item. */
  const seed = async (key: string, price: number) => {
    const orgUser = await prisma.user.create({
      data: {
        id: `manual-card-org-user-${key}`,
        email: `manual-card-org-${key}@findasale.test`,
        name: `Manual Card Organizer ${key}`,
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
      },
    });
    const organizer = await prisma.organizer.create({
      data: {
        userId: orgUser.id,
        businessName: `Manual Card Estate Sales ${key}`,
        address: '219 E Michigan Ave, Paw Paw, MI 49079',
        subscriptionTier: 'TEAMS',
        squareOnboarded: true,
        squareMerchantId: `sq-merchant-manualcard-${key}`,
        squareLocationId: `sq-location-manualcard-${key}`,
        cashFeeBalance: 0,
      },
    });
    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: `Manual Card Sale ${key}`,
        description: 'Manual card entry fixture',
        address: '219 E Michigan Ave',
        city: 'Paw Paw',
        state: 'MI',
        zip: '49079',
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 86400000),
        status: 'PUBLISHED',
        saleType: 'ESTATE',
      },
    });
    const item = await prisma.item.create({
      data: {
        saleId: sale.id,
        title: `Manual Card Item ${key}`,
        description: 'Fixture',
        price,
        status: 'AVAILABLE',
        draftStatus: 'PUBLISHED',
        category: 'Furniture',
        embedding: [], // NOT NULL, no DB default (migration 20260307153530 drops it)
      },
    });
    return { orgUser, organizer, sale, item };
  };

  beforeEach(() => {
    mockPreflightAccountStatus.mockReset();
    mockPreflightAccountStatus.mockResolvedValue({ ok: true, accessToken: 'fake-square-token-manualcard' });
    mockCreateAndCapturePayment.mockReset();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('charges a real $50 item (subtotal + CNP fee), creates a PAID Purchase, and marks the item sold', async () => {
    const { orgUser, sale, item } = await seed('happy', 50);

    mockCreateAndCapturePayment.mockResolvedValueOnce({
      ok: true,
      paymentId: 'sqp_manual_happy',
      captured: true,
    });

    const req: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      body: {
        sourceId: 'cnon:test-manual-happy',
        saleId: sale.id,
        items: [{ itemId: item.id, amount: 50, label: item.title }],
      },
    };
    const res = makeMockRes();
    await manualCardPayment(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.status).not.toHaveBeenCalledWith(500);

    // $50.00 subtotal + CNP fee (2.9% + $0.30 placeholder -- see posPaymentController.ts's
    // CNP_FEE_RATE_PLACEHOLDER/CNP_FEE_FIXED_CENTS_PLACEHOLDER) = 5000 + 145 + 30 = 5175 cents.
    const expectedCnpFeeCents = Math.round(5000 * 0.029) + 30;
    expect(expectedCnpFeeCents).toBe(175);
    const expectedTotalCents = 5000 + expectedCnpFeeCents;

    expect(mockCreateAndCapturePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'cnon:test-manual-happy',
        amountCents: expectedTotalCents,
        posRequestId: 'cnon:test-manual-happy',
      })
    );

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.subtotalCents).toBe(5000);
    expect(body.cnpFeeCents).toBe(expectedCnpFeeCents);
    expect(body.totalChargedCents).toBe(expectedTotalCents);
    expect(body.purchaseIds.length).toBe(1);

    const purchase = await prisma.purchase.findUnique({ where: { id: body.purchaseIds[0] } });
    expect(purchase).not.toBeNull();
    expect(purchase!.status).toBe('PAID');
    expect(purchase!.processor).toBe('SQUARE');
    expect(purchase!.squarePaymentId).toBe('sqp_manual_happy');
    expect(purchase!.userId).toBeNull(); // walk-up shopper, no FindA.Sale account
    expect(purchase!.amount).toBeCloseTo(50, 2);

    const itemAfter = await prisma.item.findUnique({ where: { id: item.id } });
    expect(itemAfter!.status).toBe('SOLD');
  });

  it('rejects a saleId belonging to a DIFFERENT organizer with 403, and never calls Square', async () => {
    const { sale: otherSale } = await seed('victim', 50);
    const { orgUser: attackerUser } = await seed('attacker', 50);

    const req: any = {
      user: { id: attackerUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: attackerUser.email },
      body: {
        sourceId: 'cnon:test-cross-tenant',
        saleId: otherSale.id, // belongs to the "victim" organizer, not the requesting "attacker"
        items: [{ amount: 50, label: 'Misc' }],
      },
    };
    const res = makeMockRes();
    await manualCardPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPreflightAccountStatus).not.toHaveBeenCalled();
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('rejects a SOLD/unavailable item with 400 before ever calling Square', async () => {
    const { orgUser, sale, item } = await seed('sold', 50);
    await prisma.item.update({ where: { id: item.id }, data: { status: 'SOLD' } });

    const req: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      body: {
        sourceId: 'cnon:test-sold-item',
        saleId: sale.id,
        items: [{ itemId: item.id, amount: 50, label: item.title }],
      },
    };
    const res = makeMockRes();
    await manualCardPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCreateAndCapturePayment).not.toHaveBeenCalled();
  });

  it('an idempotent retry that lands on the SAME squarePaymentId does not create a second Purchase', async () => {
    const { orgUser, sale, item } = await seed('retry', 20);

    mockCreateAndCapturePayment.mockResolvedValue({
      ok: true,
      paymentId: 'sqp_manual_retry_same',
      captured: true,
    });

    const body = {
      sourceId: 'cnon:test-manual-retry',
      saleId: sale.id,
      items: [{ itemId: item.id, amount: 20, label: item.title }],
    };
    const user = { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email };

    const res1 = makeMockRes();
    await manualCardPayment({ user, body } as any, res1);
    const purchaseIds1: string[] = res1.json.mock.calls[0][0].purchaseIds;
    expect(purchaseIds1.length).toBe(1);

    // Second call resolves to the identical Square paymentId (e.g. the client retried after a
    // dropped response and Square's own idempotency key returned the original payment).
    const res2 = makeMockRes();
    await manualCardPayment({ user, body } as any, res2);
    const body2 = res2.json.mock.calls[0][0];
    expect(body2.purchaseIds).toEqual(purchaseIds1);

    const allPurchasesForPayment = await prisma.purchase.findMany({ where: { squarePaymentId: 'sqp_manual_retry_same' } });
    expect(allPurchasesForPayment.length).toBe(1);
  });

  it('a valid organizer-applied discount reduces the charged subtotal and the CNP fee', async () => {
    const { orgUser, sale, item } = await seed('discount', 100);

    mockCreateAndCapturePayment.mockResolvedValueOnce({
      ok: true,
      paymentId: 'sqp_manual_discount',
      captured: true,
    });

    const req: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      body: {
        sourceId: 'cnon:test-manual-discount',
        saleId: sale.id,
        items: [{ itemId: item.id, amount: 100, label: item.title }],
        discountType: 'PERCENT',
        discountValue: 10, // 10% off a $100 item => $90 subtotal
      },
    };
    const res = makeMockRes();
    await manualCardPayment(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody.subtotalCents).toBe(9000); // $90.00 after the 10% discount
    const expectedCnpFeeCents = Math.round(9000 * 0.029) + 30;
    expect(responseBody.cnpFeeCents).toBe(expectedCnpFeeCents);

    const purchase = await prisma.purchase.findUnique({ where: { id: responseBody.purchaseIds[0] } });
    expect(purchase!.discountAmountCents).toBe(1000); // $10.00 discount on the $100 item
    expect(purchase!.discountType).toBe('PERCENT');
  });
});
