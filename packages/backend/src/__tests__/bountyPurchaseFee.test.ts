/**
 * Bounty-fulfillment purchase commission — tier-aware rate, not a hardcoded 10% (P1 fix,
 * 2026-08-24).
 *
 * WHAT THIS SUITE EXISTS FOR: controllers/bountyController.ts's completeBountyPurchase
 * (POST /api/bounties/submissions/:id/purchase) defined its OWN LOCAL `getPlatformFeeRate`
 * shadow function:
 *
 *   const getPlatformFeeRate = (tier: string): number => {
 *     const rates: Record<string, number> = { SIMPLE: 0.10, PRO: 0.10, TEAMS: 0.10 };
 *     return rates[tier] || 0.10;
 *   };
 *
 * This shadowed the SHARED, correct `getPlatformFeeRate` in utils/feeCalculator.ts (10% SIMPLE
 * / 8% PRO+TEAMS) with a local copy that returned 10% for every tier, including PRO and TEAMS.
 * It was never touched by the 2026-08-22 fee-precedence fix applied everywhere else
 * (stripeController.ts, terminalController.ts, jobs/auctionJob.ts, services/cashFeeService.ts,
 * services/nativeShippingSuggestionService.ts) because it wasn't a FeeStructure-wildcard
 * precedence bug at all -- it was a completely separate, un-imported duplicate definition that
 * those fixes never touched. Every bounty-fulfillment purchase by a PRO or TEAMS organizer was
 * silently charged 10% instead of their contractual 8%, on both the charge's application fee
 * and the `Purchase.commissionRate` snapshot.
 *
 * Fixed by importing the shared `getPlatformFeeRate` from utils/feeCalculator.ts and deleting
 * the local shadow entirely.
 *
 * These tests also seed a wildcard `FeeStructure` row (`listingType: '*'`, `feeRate: 0.10`) --
 * the row that is ACTUALLY present on every row of the production table (10/10, confirmed by
 * live query) -- to prove the fix holds even in the exact production data shape that caused the
 * sibling bug fixed 2026-08-22. This code path never reads `FeeStructure` at all (correctly --
 * see cashFeeService.ts's file header for why a wildcard row must never outrank a resolvable
 * tier rate), so the wildcard row's mere presence is a no-op here; it is seeded anyway so this
 * suite documents and guards the same production condition, not just the code shape in isolation.
 *
 * Stripe removal (2026-09-12): this file no longer seeds a Stripe-only organizer or mocks the
 * Stripe SDK -- completeBountyPurchase's Stripe branch was removed outright (a Stripe-only
 * organizer now gets a 409 SELLER_PAYMENTS_UNAVAILABLE, see that function's own comment), and
 * every organizer this suite seeds is Square-onboarded instead, exercising the
 * `organizerHasSquare` branch (Square migration Wave S2 #1) that this fee-rate fix actually
 * shares with every other processor. resolveOrganizerSquareAccessToken and createSquareCharge
 * (services/squarePaymentService.ts) are mocked directly via jest.requireActual + override --
 * everything else in that module (SquareOnboardingIncompleteError, buildSquareIdempotencyKey)
 * is left real since neither makes an external call. applyCashDebtToAppFee/
 * settleCashDebtCollection (services/cashFeeService.ts) are left real too -- pure DB reads/
 * writes against this fixture's cashFeeBalance: 0, so they're a no-op debt-wise, exactly like
 * resolvePosDiscount is left real in the sibling POS pricing suite.
 *
 * MOCKING NOTES: bountyController.ts pulls in Square, notifications, XP/spend services and the
 * collusion checkout-guard at import/call time -- none of them are on the commission-
 * calculation path this suite verifies, so all are mocked. XP is mocked outright (rather than
 * left real, as posSplitPaymentFee.test.ts does for its fire-and-forget XP calls) because
 * completeBountyPurchase's XP spend GATES the purchase (insufficient spendable XP is a 402), so
 * leaving it real would require seeding a real XP ledger unrelated to what this suite is
 * testing.
 */

import { prisma } from '../lib/prisma';
import { getPlatformFeeRate } from '../utils/feeCalculator';

// ── Mocks (hoisted by ts-jest above these declarations — `var`, not `const`, deliberately) ──
var mockResolveOrganizerSquareAccessToken = jest.fn();
var mockCreateSquareCharge = jest.fn();

jest.mock('../services/squarePaymentService', () => {
  const actual = jest.requireActual('../services/squarePaymentService');
  return {
    ...actual,
    resolveOrganizerSquareAccessToken: (...args: any[]) => mockResolveOrganizerSquareAccessToken(...args),
    createSquareCharge: (...args: any[]) => mockCreateSquareCharge(...args),
  };
});

jest.mock('../services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/checkoutGuard', () => ({
  assertCheckoutAllowed: jest.fn().mockResolvedValue(undefined),
  recordSuspectedSignal: jest.fn().mockResolvedValue(undefined),
  CheckoutGuardError: class CheckoutGuardError extends Error {},
}));

jest.mock('../services/xpService', () => ({
  getSpendableXp: jest.fn().mockResolvedValue(1000),
  spendXp: jest.fn().mockResolvedValue(true),
  awardXp: jest.fn().mockResolvedValue(undefined),
  XP_AWARDS: {},
}));

// ── Import AFTER the mocks ────────────────────────────────────────────────────────────────
import { completeBountyPurchase } from '../controllers/bountyController';

const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('Bounty-fulfillment purchase commission — tier rate, not a hardcoded 10%', () => {
  /** Build an isolated, Square-onboarded {tier} organizer + shopper + PUBLISHED sale + item +
   *  bounty + APPROVED submission, ready for completeBountyPurchase. */
  const seed = async (key: string, tier: 'SIMPLE' | 'PRO' | 'TEAMS', price: number) => {
    const orgUser = await prisma.user.create({
      data: {
        id: `bounty-fee-org-user-${key}`,
        email: `bounty-fee-org-${key}@findasale.test`,
        name: `Bounty Fee Organizer ${key}`,
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
      },
    });
    const organizer = await prisma.organizer.create({
      data: {
        userId: orgUser.id,
        businessName: `Bounty Fee Estate Sales ${key}`,
        address: '219 E Michigan Ave, Paw Paw, MI 49079',
        subscriptionTier: tier,
        squareOnboarded: true,
        squareMerchantId: `sq-merchant-bountyfee-${key}`,
        squareLocationId: `sq-location-bountyfee-${key}`,
        cashFeeBalance: 0,
      },
    });
    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: `Bounty Fee Sale ${key}`,
        description: 'Bounty-fulfillment commission fixture',
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
        embedding: [], // NOT NULL, no DB default -- Prisma omits unspecified scalar lists
        title: `Bounty Item ${key}`,
        price,
        status: 'AVAILABLE',
        saleId: sale.id,
      },
    });
    const shopper = await prisma.user.create({
      data: {
        id: `bounty-fee-shopper-${key}`,
        email: `bounty-fee-shopper-${key}@findasale.test`,
        name: `Bounty Fee Shopper ${key}`,
        password: 'hashed_password',
        role: 'USER',
        roles: ['USER'],
      },
    });
    const bounty = await prisma.missingListingBounty.create({
      data: {
        userId: shopper.id,
        itemName: `Bounty Item ${key}`,
        status: 'OPEN',
      },
    });
    const submission = await prisma.bountySubmission.create({
      data: {
        bountyId: bounty.id,
        organizerId: orgUser.id,
        itemId: item.id,
        status: 'APPROVED',
        expiresAt: new Date(Date.now() + 3 * 86400000),
      },
    });
    return { orgUser, organizer, sale, item, shopper, bounty, submission };
  };

  beforeAll(async () => {
    // The exact production data shape (10/10 rows, confirmed by live query) that caused the
    // sibling FeeStructure-precedence bug fixed 2026-08-22 -- seeded here to prove this path
    // (which never reads FeeStructure) is unaffected by its presence either way.
    await prisma.feeStructure.deleteMany({ where: { listingType: '*' } }).catch(() => {});
    await prisma.feeStructure.create({ data: { listingType: '*', feeRate: 0.10 } });
  });

  beforeEach(() => {
    mockResolveOrganizerSquareAccessToken.mockReset();
    mockResolveOrganizerSquareAccessToken.mockResolvedValue('fake-square-token-bountyfee');
    mockCreateSquareCharge.mockReset();
  });

  afterAll(async () => {
    await prisma.feeStructure.deleteMany({ where: { listingType: '*' } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('resolves PRO to 0.08 (not the old hardcoded 0.10) even with a wildcard FeeStructure row present', async () => {
    const { shopper, submission } = await seed('pro', 'PRO', 100);

    mockCreateSquareCharge.mockResolvedValueOnce({
      ok: true,
      paymentId: 'sqp_bounty_pro',
      status: 'COMPLETED',
      cardFingerprint: null,
      riskLevel: null,
    });

    const req: any = {
      user: { id: shopper.id },
      params: { id: submission.id },
      body: { sourceId: 'cnon:test-bounty-pro' },
    };
    const res = makeMockRes();
    await completeBountyPurchase(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.status).not.toHaveBeenCalledWith(402);
    expect(res.status).not.toHaveBeenCalledWith(409);

    // $10.00 (10%) if the old hardcoded shadow function were still in place -- must be $8.00 (8%).
    expect(mockCreateSquareCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 10000, appFeeCents: 800, sourceId: 'cnon:test-bounty-pro' })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ squarePaymentId: 'sqp_bounty_pro', processor: 'SQUARE' })
    );

    const purchase = await prisma.purchase.findFirst({
      where: { squarePaymentId: 'sqp_bounty_pro' },
    });
    expect(purchase).not.toBeNull();
    expect(purchase!.platformFeeAmount).toBeCloseTo(8, 2);
    expect(purchase!.commissionAmount).toBeCloseTo(8, 2);
    expect(purchase!.commissionRate).toBeCloseTo(getPlatformFeeRate('PRO'), 4); // 0.08
  });

  it('resolves TEAMS to 0.08 (not the old hardcoded 0.10) even with a wildcard FeeStructure row present', async () => {
    const { shopper, submission } = await seed('teams', 'TEAMS', 100);

    mockCreateSquareCharge.mockResolvedValueOnce({
      ok: true,
      paymentId: 'sqp_bounty_teams',
      status: 'COMPLETED',
      cardFingerprint: null,
      riskLevel: null,
    });

    const req: any = {
      user: { id: shopper.id },
      params: { id: submission.id },
      body: { sourceId: 'cnon:test-bounty-teams' },
    };
    const res = makeMockRes();
    await completeBountyPurchase(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.status).not.toHaveBeenCalledWith(402);
    expect(res.status).not.toHaveBeenCalledWith(409);

    expect(mockCreateSquareCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 10000, appFeeCents: 800, sourceId: 'cnon:test-bounty-teams' })
    );

    const purchase = await prisma.purchase.findFirst({
      where: { squarePaymentId: 'sqp_bounty_teams' },
    });
    expect(purchase).not.toBeNull();
    expect(purchase!.platformFeeAmount).toBeCloseTo(8, 2);
    expect(purchase!.commissionRate).toBeCloseTo(getPlatformFeeRate('TEAMS'), 4); // 0.08 (TEAMS shares PRO's rate)
  });

  it('resolves SIMPLE to 0.10 whether or not the wildcard row is present (control)', async () => {
    const { shopper, submission } = await seed('simple', 'SIMPLE', 100);

    mockCreateSquareCharge.mockResolvedValueOnce({
      ok: true,
      paymentId: 'sqp_bounty_simple',
      status: 'COMPLETED',
      cardFingerprint: null,
      riskLevel: null,
    });

    const req: any = {
      user: { id: shopper.id },
      params: { id: submission.id },
      body: { sourceId: 'cnon:test-bounty-simple' },
    };
    const res = makeMockRes();
    await completeBountyPurchase(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);

    expect(mockCreateSquareCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 10000, appFeeCents: 1000, sourceId: 'cnon:test-bounty-simple' })
    );

    const purchase = await prisma.purchase.findFirst({
      where: { squarePaymentId: 'sqp_bounty_simple' },
    });
    expect(purchase!.commissionRate).toBeCloseTo(getPlatformFeeRate('SIMPLE'), 4); // 0.10
  });
});
