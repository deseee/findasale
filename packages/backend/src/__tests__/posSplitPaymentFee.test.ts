/**
 * POS split-payment commission — cash-half accrual + tier-aware rate (P2 fix, 2026-08-22).
 *
 * WHAT THIS SUITE EXISTS FOR: controllers/posPaymentController.ts's split-tender flow
 * (createPaymentRequest -> acceptPaymentRequest -> confirmPaymentRequest) had two bugs in
 * one line:
 *
 *   1. `const platformFeeCents = Math.round(splitCardAmountCents! * 0.1);` — a LITERAL 10%,
 *      not the organizer's resolved tier rate. Every PRO/TEAMS organizer was overcharged on
 *      the CARD half of a split tender (10% instead of their contractual 8%).
 *   2. The CASH half of a split tender was never charged any commission at all — nothing in
 *      this file ever touched `Organizer.cashFeeBalance`, the mechanism every other cash path
 *      (terminalController.processCashSaleCore, reservationController's RECORD mode) uses to
 *      collect commission on money Stripe never sees.
 *
 * Both are fixed by routing BOTH halves through the same shared, tier-aware resolvers
 * services/cashFeeService.ts already established as the precedent (fixed there, and at
 * stripeController/terminalController's analogous card paths, the same project-day): the card
 * half via `getPlatformFeeRate` (+ referral-discount override, mirroring
 * terminalController.createTerminalPaymentIntent exactly), the cash half via
 * `resolveCashCommissionRate` + `accrueCashFeeBalance`.
 *
 * These tests assert the money on a TEAMS organizer (8% contractual rate), not the code shape:
 *   - the card half's application fee and the Purchase's `platformFeeAmount` reflect 8% of
 *     the card portion, NOT the old hardcoded 10%
 *   - the cash half accrues 8% of the cash portion to `Organizer.cashFeeBalance` — NOT $0
 *   - combined, the platform collects exactly 8% of the full $100 cart ($8.00), split evenly
 *     across the two legs by design of this fixture (50/50 cash/card)
 *
 * Stripe removal (2026-09-12): this file no longer seeds a Stripe-only organizer or mocks the
 * Stripe SDK. createPaymentRequest forces `processor` to SQUARE unconditionally now, and
 * platformFeeCents (the tier-rate math this suite actually verifies) is computed the same way
 * regardless of processor -- it's persisted on the POSPaymentRequest row at create time and
 * only spent (as `appFeeCents`) at confirm time, once squarePos.createAndCapturePayment
 * actually charges the card. squarePos.preflightAccountStatus and .createAndCapturePayment are
 * mocked directly (the same seam posPaymentController.ts calls), and confirmPaymentRequest is
 * driven with `sourceId` (the Square Web Payments SDK card token) instead of `paymentIntentId`
 * for a SQUARE-processor row -- see posPaymentController.ts's own comment on that field pair.
 *
 * MOCKING NOTES: posPaymentController.ts pulls in Square, Socket.io, notifications, eBay/
 * Shopify/FB hooks and the collusion checkout-guard at import time — none of them are on the
 * commission-calculation path this suite is verifying, so all are mocked exactly as
 * __tests__/cashSaleFee.test.ts (the sibling fix's precedent test) mocks them. XP/achievement
 * services are left real (pure DB reads/writes, no external calls) since they run
 * fire-and-forget in the code under test and mocking them would add nothing to the assertions
 * below.
 */

import { prisma } from '../lib/prisma';

// ── Mocks (hoisted by ts-jest above these declarations — `var`, not `const`, deliberately) ──
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

// ── Imports AFTER the mocks ─────────────────────────────────────────────────────────────
import {
  createPaymentRequest,
  acceptPaymentRequest,
  confirmPaymentRequest,
} from '../controllers/posPaymentController';

const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('POS split-payment commission — cash-half accrual + tier-aware rate', () => {
  /** Build an isolated, Square-onboarded TEAMS organizer + PUBLISHED sale + shopper. */
  const seed = async (key: string) => {
    const orgUser = await prisma.user.create({
      data: {
        id: `split-fee-org-user-${key}`,
        email: `split-fee-org-${key}@findasale.test`,
        name: `Split Fee Organizer ${key}`,
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
      },
    });
    const organizer = await prisma.organizer.create({
      data: {
        userId: orgUser.id,
        businessName: `Split Fee Estate Sales ${key}`,
        address: '219 E Michigan Ave, Paw Paw, MI 49079',
        subscriptionTier: 'TEAMS',
        squareOnboarded: true,
        squareMerchantId: `sq-merchant-splitfee-${key}`,
        squareLocationId: `sq-location-splitfee-${key}`,
        cashFeeBalance: 0,
      },
    });
    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: `Split Fee Sale ${key}`,
        description: 'Split-payment commission fixture',
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
    const shopper = await prisma.user.create({
      data: {
        id: `split-fee-shopper-${key}`,
        email: `split-fee-shopper-${key}@findasale.test`,
        name: `Split Fee Shopper ${key}`,
        password: 'hashed_password',
        role: 'USER',
        roles: ['USER'],
      },
    });
    return { orgUser, organizer, sale, shopper };
  };

  beforeEach(() => {
    mockPreflightAccountStatus.mockReset();
    mockPreflightAccountStatus.mockResolvedValue({ ok: true, accessToken: 'fake-square-token-splitfee' });
    mockCreateAndCapturePayment.mockReset();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('charges TEAMS 8% on the card half (not the hardcoded 10%) AND accrues 8% on the cash half (not $0)', async () => {
    const { orgUser, organizer, sale, shopper } = await seed('teams');

    // $100 cart, split 50/50 cash/card.
    const createReq: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      body: {
        shopperUserId: shopper.id,
        saleId: sale.id,
        itemIds: [],
        totalAmountCents: 10000,
        isSplitPayment: true,
        cashAmountCents: 5000,
        cardAmountCents: 5000,
      },
    };
    const createRes = makeMockRes();
    await createPaymentRequest(createReq, createRes);

    expect(createRes.status).toHaveBeenCalledWith(201);
    const createBody = createRes.json.mock.calls[0][0];
    const requestId: string = createBody.requestId;
    expect(requestId).toBeTruthy();

    // THE PLATFORM FEE MATH: platformFeeCents (persisted on the row at create time) must be
    // 8% of $50 (400 cents), never the old hardcoded 10% (500 cents). Square has no
    // "create now" charge to inspect at this point (see file header) -- the row itself is
    // the fee-math evidence, spent as appFeeCents once confirm actually charges the card.
    const posRequestAfterCreate = await prisma.pOSPaymentRequest.findUnique({ where: { id: requestId } });
    expect(posRequestAfterCreate!.platformFeeCents).toBe(400);

    // Shopper accepts.
    const acceptReq: any = { user: { id: shopper.id }, params: { requestId } };
    const acceptRes = makeMockRes();
    await acceptPaymentRequest(acceptReq, acceptRes);
    expect(acceptRes.json.mock.calls[0][0].status).toBe('ACCEPTED');

    // Shopper's device has tokenized a card via the Web Payments SDK; Square charges it.
    mockCreateAndCapturePayment.mockResolvedValueOnce({
      ok: true,
      paymentId: 'sqp_split_teams',
      captured: true,
    });

    const confirmReq: any = {
      user: { id: shopper.id },
      params: { requestId },
      body: { sourceId: 'cnon:test-split-teams' },
    };
    const confirmRes = makeMockRes();
    await confirmPaymentRequest(confirmReq, confirmRes);

    expect(confirmRes.json.mock.calls[0][0]).toEqual(
      expect.objectContaining({ success: true })
    );
    expect(confirmRes.status).not.toHaveBeenCalledWith(500);

    // THE CHARGE ACTUALLY MADE: appFeeCents on the Square charge is 8% of the card portion,
    // not the old hardcoded 10% (500 cents).
    expect(mockCreateAndCapturePayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 5000, appFeeCents: 400, sourceId: 'cnon:test-split-teams' })
    );

    // THE CARD-HALF ROW: platformFeeAmount is 8% of the card portion, not 10%.
    const purchase = await prisma.purchase.findFirst({ where: { saleId: sale.id } });
    expect(purchase).not.toBeNull();
    expect(purchase!.status).toBe('PAID');
    expect(purchase!.amount).toBeCloseTo(100, 2); // misc-only cart: one Purchase for the full cart total
    expect(purchase!.platformFeeAmount).toBeCloseTo(4, 2); // 8% of $50 card portion — was $5 (10%) before the fix

    // THE CASH-HALF LEDGER: the organizer now owes 8% of the $50 cash portion ($4.00) against
    // their next Square payout — before this fix it was exactly $0.00, every time.
    const organizerAfter = await prisma.organizer.findUnique({ where: { id: organizer.id } });
    expect(organizerAfter!.cashFeeBalance).toBeCloseTo(4, 2);
    expect(organizerAfter!.cashFeeBalanceUpdatedAt).not.toBeNull();

    // COMBINED: the platform collected exactly 8% of the full $100 cart across both legs —
    // never the pre-fix combination of ($5 card via the hardcoded 10%) + ($0 cash).
    const totalCollected = purchase!.platformFeeAmount! + organizerAfter!.cashFeeBalance;
    expect(totalCollected).toBeCloseTo(8, 2);
  });

  it('a non-split TEAMS card-only payment request still uses the 8% tier rate (control)', async () => {
    const { orgUser, sale, shopper } = await seed('teams-nosplit');

    const createReq: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      body: {
        shopperUserId: shopper.id,
        saleId: sale.id,
        itemIds: [],
        totalAmountCents: 10000,
      },
    };
    const createRes = makeMockRes();
    await createPaymentRequest(createReq, createRes);

    expect(createRes.status).toHaveBeenCalledWith(201);
    const requestId: string = createRes.json.mock.calls[0][0].requestId;

    // Card amount is the FULL total when not split — fee is 8% of $100 = 800 cents, not the
    // old hardcoded 10% (1000 cents).
    const posRequestAfterCreate = await prisma.pOSPaymentRequest.findUnique({ where: { id: requestId } });
    expect(posRequestAfterCreate!.platformFeeCents).toBe(800);

    // Non-split: no cash leg, so no cash-fee accrual should occur.
    const organizerAfter = await prisma.organizer.findUnique({ where: { id: posRequestAfterCreate!.organizerId } });
    expect(organizerAfter!.cashFeeBalance).toBeCloseTo(0, 2);
  });
});
