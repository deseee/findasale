/**
 * POS server-authoritative catalog pricing — no-discount floor check (ADR-112, 2026-08-28).
 *
 * WHAT THIS SUITE EXISTS FOR: controllers/posPaymentController.ts's createPaymentRequest
 * already computed a correct catalogSubtotalCents from real Item.price rows, and already had a
 * floor check comparing the client-sent totalAmountCents against it -- but that floor check was
 * gated behind `discountResolution.discountAmountCents > 0`, so a request with NO discount
 * fields sent trusted totalAmountCents completely, letting a cashier (or a direct API call)
 * hand-craft a lowballed total for a real catalog item and pay less than its real price.
 *
 * ADR-112 removes that gate so the floor check runs unconditionally. These tests assert the
 * money/HTTP outcome, not the code shape:
 *   - a lowballed totalAmountCents against a real catalog item, with NO discount fields sent,
 *     is now rejected 400 -- it was previously accepted outright
 *   - a totalAmountCents that correctly matches the real catalog price, with no discount, still
 *     succeeds (control -- the fix must not reject legitimate no-discount carts)
 *   - a misc-only cart (itemIds: []) is unaffected regardless of totalAmountCents -- misc/
 *     custom-amount items stay client-priced by design, a separate trust boundary this ADR does
 *     not touch
 *
 * Stripe removal (2026-09-12): this file no longer seeds a Stripe-only organizer or mocks the
 * Stripe SDK -- createPaymentRequest forces `processor` to SQUARE unconditionally now (a
 * client-supplied value is accepted-but-ignored, see that function's own comment), and Square
 * has no "create now, confirm later" charge object at this stage (see
 * squarePosPaymentAdapter.ts's file header) -- createPaymentRequest never creates a live charge,
 * only a 201 response once squarePos.preflightAccountStatus passes. So these tests seed a
 * Square-onboarded organizer and assert the 201/400 response shape, not a mocked PaymentIntent
 * call. squarePos.preflightAccountStatus itself is mocked directly -- the same seam
 * posPaymentController.ts calls -- rather than mocking ITS dependencies
 * (resolveOrganizerSquareAccessToken, the Square SDK client): that is the narrowest correct
 * mock boundary for a controller-level test that isn't about Square account verification.
 *
 * MOCKING NOTES: same convention as posSplitPaymentFee.test.ts (this controller's sibling test
 * file) -- Square preflight, Socket.io, notifications, eBay/Shopify/FB hooks and the collusion
 * checkout-guard are mocked; resolvePosDiscount is left real/unmocked (pure DB + arithmetic, no
 * external calls), consistent with every other test file covering this controller.
 */

import { prisma } from '../lib/prisma';

// -- Mocks (hoisted by ts-jest above these declarations -- `var`, not `const`, deliberately) --
var mockPreflightAccountStatus = jest.fn();

jest.mock('../services/squarePosPaymentAdapter', () => ({
  preflightAccountStatus: (...args: any[]) => mockPreflightAccountStatus(...args),
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

// -- Imports AFTER the mocks --------------------------------------------------------------
import { createPaymentRequest } from '../controllers/posPaymentController';

const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('POS server-authoritative catalog pricing -- no-discount floor check (ADR-112)', () => {
  /** Build an isolated, Square-onboarded organizer + PUBLISHED sale + AVAILABLE $50 item + shopper. */
  const seed = async (key: string, price: number) => {
    const orgUser = await prisma.user.create({
      data: {
        id: `pricing-org-user-${key}`,
        email: `pricing-org-${key}@findasale.test`,
        name: `Pricing Organizer ${key}`,
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
      },
    });
    const organizer = await prisma.organizer.create({
      data: {
        userId: orgUser.id,
        businessName: `Pricing Estate Sales ${key}`,
        address: '219 E Michigan Ave, Paw Paw, MI 49079',
        subscriptionTier: 'TEAMS',
        squareOnboarded: true,
        squareMerchantId: `sq-merchant-pricing-${key}`,
        squareLocationId: `sq-location-pricing-${key}`,
        cashFeeBalance: 0,
      },
    });
    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: `Pricing Sale ${key}`,
        description: 'ADR-112 pricing fixture',
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
        title: `Pricing Item ${key}`,
        description: 'Fixture',
        price,
        status: 'AVAILABLE',
        draftStatus: 'PUBLISHED',
        category: 'Furniture',
        embedding: [], // NOT NULL, no DB default (migration 20260307153530 drops it)
      },
    });
    const shopper = await prisma.user.create({
      data: {
        id: `pricing-shopper-${key}`,
        email: `pricing-shopper-${key}@findasale.test`,
        name: `Pricing Shopper ${key}`,
        password: 'hashed_password',
        role: 'USER',
        roles: ['USER'],
      },
    });
    return { orgUser, organizer, sale, item, shopper };
  };

  beforeEach(() => {
    mockPreflightAccountStatus.mockReset();
    mockPreflightAccountStatus.mockResolvedValue({ ok: true, accessToken: 'fake-square-token-pricing' });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a lowballed totalAmountCents against a real $50 catalog item with NO discount fields sent', async () => {
    const { orgUser, sale, item, shopper } = await seed('lowball', 50);

    const createReq: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      body: {
        shopperUserId: shopper.id,
        saleId: sale.id,
        itemIds: [item.id],
        totalAmountCents: 100, // $1.00 for a real $50.00 item -- no discount fields sent at all
      },
    };
    const createRes = makeMockRes();
    await createPaymentRequest(createReq, createRes);

    // Before ADR-112 this succeeded with 201 and went on to create a live charge for a $1.00
    // total against a $50 item. The floor check now runs unconditionally, so this is rejected
    // before the Square preflight (or any placeholder row) is ever reached.
    expect(createRes.status).toHaveBeenCalledWith(400);
    expect(mockPreflightAccountStatus).not.toHaveBeenCalled();

    const requests = await prisma.pOSPaymentRequest.findMany({ where: { saleId: sale.id } });
    expect(requests.length).toBe(0);
  });

  it('still succeeds when totalAmountCents correctly matches the real catalog price, no discount (control)', async () => {
    const { orgUser, organizer, sale, item, shopper } = await seed('correct', 50);

    const createReq: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      body: {
        shopperUserId: shopper.id,
        saleId: sale.id,
        itemIds: [item.id],
        totalAmountCents: 5000, // exactly matches the real $50.00 catalog price
      },
    };
    const createRes = makeMockRes();
    await createPaymentRequest(createReq, createRes);

    expect(createRes.status).toHaveBeenCalledWith(201);
    expect(createRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PENDING',
        totalAmountCents: 5000,
        processor: 'SQUARE',
        squareLocationId: organizer.squareLocationId,
      })
    );
    expect(mockPreflightAccountStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: organizer.id,
        squareMerchantId: organizer.squareMerchantId,
        squareLocationId: organizer.squareLocationId,
      })
    );
  });

  it('a misc-only cart (itemIds: []) is unaffected by the floor check regardless of totalAmountCents (control)', async () => {
    const { orgUser, sale, shopper } = await seed('misc', 50);

    // No catalog items at all -- catalogSubtotalCents is 0, so any totalAmountCents >= -1 passes.
    // This is the deliberate, unchanged trust boundary for misc/custom-amount carts.
    const createReq: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      body: {
        shopperUserId: shopper.id,
        saleId: sale.id,
        itemIds: [],
        totalAmountCents: 250, // arbitrary misc amount, no catalog item to check against
      },
    };
    const createRes = makeMockRes();
    await createPaymentRequest(createReq, createRes);

    expect(createRes.status).toHaveBeenCalledWith(201);
    expect(createRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PENDING',
        totalAmountCents: 250,
        processor: 'SQUARE',
      })
    );
  });
});
