/**
 * RECORD-mode cash settlement — commission accrual, fee snapshot, ledger/report parity.
 *
 * WHAT THIS SUITE EXISTS FOR (revenue leak found and fixed 2026-08-17):
 *
 *   The markSold settlement router (controllers/reservationController.batchUpdateHolds) has
 *   three modes. POS_CART and CHECKOUT_LINK hand the money to Stripe, which collects the
 *   platform's commission as application_fee_amount. RECORD is the CASH / in-person mode: the
 *   organizer takes the money in hand and FindA.Sale's Stripe account never sees it. RECORD
 *   wrote `platformFeeAmount: 0` on the Purchase and did nothing else, so the platform earned
 *   exactly $0.00 on every cash sale settled from the holds screen.
 *
 *   The mechanism for charging commission on money we never touch already existed and already
 *   worked for the OTHER cash path (terminalController.processCashSaleCore): accrue it to
 *   `Organizer.cashFeeBalance`, and payoutController nets that balance out of the organizer's
 *   next Stripe payout. RECORD simply never called it. Both paths now go through
 *   services/cashFeeService.ts.
 *
 * These tests assert the money, not the code shape:
 *   - a $100 cash sale accrues $10.00 at SIMPLE and $8.00 at PRO (tier rate, not a hardcoded 10%)
 *   - `cashFeeBalance` increments by exactly that, and only that
 *   - the Purchase fee snapshot reconciles: platformFeeAmount == buyerPremiumAmount + commissionAmount
 *   - what the organizer is SHOWN (resolveOrganizerFeeReport, the helper every earnings surface
 *     calls) equals what was actually accrued — report and ledger agree
 *   - a repeated settlement of the same holds accrues NOTHING a second time
 *   - the payout path deducts the accrued balance and zeroes it
 *
 * MOCKING NOTES: reservationController pulls in Stripe, Socket.io, email, eBay/Shopify/FB and
 * the POS payment-link builder at import time. All are mocked — none of them are on the RECORD
 * path, whose entire footprint is the database. The assertions are DB rows and response bodies.
 */

import { prisma } from '../lib/prisma';

// ── Mocks (hoisted by ts-jest above these declarations — `var`, not `const`, deliberately) ──
var mockPayoutsCreate = jest.fn();

jest.mock('../utils/stripe', () => ({
  getStripe: jest.fn(() => ({
    payouts: { create: mockPayoutsCreate },
  })),
  default: jest.fn(),
}));

jest.mock('../lib/socket', () => ({ getIO: jest.fn(() => null) }));
jest.mock('../services/liveFeedService', () => ({ pushEvent: jest.fn() }));
jest.mock('../services/saleStatusService', () => ({ pushSaleStatus: jest.fn() }));
jest.mock('../services/saleAlertEmailService', () => ({
  sendHoldPlacedAlert: jest.fn().mockResolvedValue(undefined),
  sendHoldPlacedToShopper: jest.fn().mockResolvedValue(undefined),
  sendHoldStatusToShopper: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/fraudDetectionService', () => ({
  checkForFraud: jest.fn().mockResolvedValue(undefined),
  calculateConfidenceScore: jest.fn().mockResolvedValue(100),
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
jest.mock('../services/crewInvasionService', () => ({
  checkCrewInvasion: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/emailService', () => ({
  emailService: { emails: { send: jest.fn().mockResolvedValue({ id: 'mock' }) } },
}));
jest.mock('../services/suppressionService', () => ({
  suppressionService: { isHardSuppressed: jest.fn().mockResolvedValue(false) },
}));
jest.mock('../lib/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../controllers/posController', () => ({
  createPaymentLinkInternal: jest.fn(),
}));
jest.mock('../services/stripeConnectService', () => ({
  shouldUseDirectCharge: jest.fn().mockResolvedValue(false),
  getAccountStatus: jest.fn().mockResolvedValue({ chargesEnabled: true }),
}));
jest.mock('../services/checkoutGuard', () => ({
  assertCheckoutAllowed: jest.fn().mockResolvedValue(undefined),
  recordSuspectedSignal: jest.fn().mockResolvedValue(undefined),
  CheckoutGuardError: class CheckoutGuardError extends Error {},
}));

// ── Imports AFTER the mocks ───────────────────────────────────────────────────────────────
import { batchUpdateHolds } from '../controllers/reservationController';
import { createPayout } from '../controllers/payoutController';
import { getPlatformFeeRate, resolveOrganizerFeeReport } from '../utils/feeCalculator';

const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const SIMPLE_RATE = 0.1;
const PRO_RATE = 0.08;

describe('RECORD-mode cash settlement — commission accrual', () => {
  let shopper: any;

  /** Build an isolated organizer + sale + item + CONFIRMED hold. */
  const seed = async (key: string, tier: 'SIMPLE' | 'PRO' | 'TEAMS', price: number) => {
    const orgUser = await prisma.user.create({
      data: {
        id: `cashfee-org-user-${key}`,
        email: `cashfee-org-${key}@findasale.test`,
        name: `Cash Fee Organizer ${key}`,
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
      },
    });
    const organizer = await prisma.organizer.create({
      data: {
        userId: orgUser.id,
        businessName: `Cash Fee Estate Sales ${key}`,
        address: '219 E Michigan Ave, Paw Paw, MI 49079',
        subscriptionTier: tier,
        stripeConnectId: `acct_cashfee${key}`,
        cashFeeBalance: 0,
      },
    });
    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: `Cash Fee Sale ${key}`,
        description: 'Cash settlement fixture',
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
        title: `Cash Fee Item ${key}`,
        description: 'Fixture',
        price,
        status: 'RESERVED',
        category: 'Furniture',
        embedding: [], // NOT NULL, no DB default (migration 20260307153530 drops it)
      },
    });
    const hold = await prisma.itemReservation.create({
      data: {
        itemId: item.id,
        userId: shopper.id,
        status: 'CONFIRMED',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    return { orgUser, organizer, sale, item, hold };
  };

  const recordSold = async (orgUser: any, holdIds: string[]) => {
    const req: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      body: { ids: holdIds, action: 'markSold', settlementMode: 'RECORD' },
    };
    const res = makeMockRes();
    await batchUpdateHolds(req, res);
    return res;
  };

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_cash_fee';
    shopper = await prisma.user.create({
      data: {
        id: 'cashfee-shopper',
        email: 'cashfee-shopper@findasale.test',
        name: 'Cash Fee Shopper',
        password: 'hashed_password',
        role: 'USER',
        roles: ['USER'],
      },
    });
    // The rate resolution consults the global FeeStructure override row before falling back to
    // the tier rate (the convention every charge path in this codebase follows). The test DB has
    // no such row, so the tier rate is what applies — which is exactly the behaviour under test.
    await prisma.feeStructure.deleteMany({ where: { listingType: '*' } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accrues the SIMPLE tier commission on a $100 cash sale, and writes it on the Purchase', async () => {
    const { orgUser, organizer, item, hold } = await seed('simple', 'SIMPLE', 100);

    const res = await recordSold(orgUser, [hold.id]);

    const body = res.json.mock.calls[0][0];
    expect(body.settlementMode).toBe('RECORD');
    expect(body.updated).toBe(1);
    expect(body.platformFee).toBe(10);

    // THE LEDGER: the organizer now owes $10.00 against their next payout.
    const after = await prisma.organizer.findUnique({ where: { id: organizer.id } });
    expect(after!.cashFeeBalance).toBeCloseTo(10, 2);
    expect(after!.cashFeeBalanceUpdatedAt).not.toBeNull();
    expect(body.cashFeeBalance).toBeCloseTo(10, 2);

    // THE ROW: platformFeeAmount is no longer the literal 0 it used to be.
    const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
    expect(purchase).not.toBeNull();
    expect(purchase!.status).toBe('PAID');
    expect(purchase!.amount).toBeCloseTo(100, 2);
    expect(purchase!.platformFeeAmount).toBeCloseTo(10, 2);

    // THE SNAPSHOT INVARIANT: platformFeeAmount == buyerPremiumAmount + commissionAmount.
    expect(purchase!.buyerPremiumAmount).toBe(0);
    expect(purchase!.buyerPremiumRate).toBe(0);
    expect(purchase!.commissionAmount).toBeCloseTo(10, 2);
    expect(purchase!.commissionRate).toBeCloseTo(SIMPLE_RATE, 4);
    expect(purchase!.organizerAbsorbedPremium).toBe(false);
    expect(purchase!.buyerPremiumAmount! + purchase!.commissionAmount!).toBeCloseTo(
      purchase!.platformFeeAmount!,
      2
    );
  });

  it('charges PRO the 8% rate, not a hardcoded 10%', async () => {
    const { orgUser, organizer, item, hold } = await seed('pro', 'PRO', 100);

    const res = await recordSold(orgUser, [hold.id]);

    expect(res.json.mock.calls[0][0].platformFee).toBe(8);

    const after = await prisma.organizer.findUnique({ where: { id: organizer.id } });
    expect(after!.cashFeeBalance).toBeCloseTo(8, 2);

    const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
    expect(purchase!.platformFeeAmount).toBeCloseTo(8, 2);
    expect(purchase!.commissionRate).toBeCloseTo(PRO_RATE, 4);
    expect(purchase!.commissionAmount).toBeCloseTo(8, 2);
  });

  it('reports to the organizer exactly what was accrued — report and ledger agree', async () => {
    const { orgUser, organizer, item, hold } = await seed('parity', 'PRO', 250);

    await recordSold(orgUser, [hold.id]);

    const organizerAfter = await prisma.organizer.findUnique({ where: { id: organizer.id } });
    const purchase = await prisma.purchase.findFirst({
      where: { itemId: item.id },
      include: { item: { select: { listingType: true, auctionStartPrice: true } } },
    });

    // resolveOrganizerFeeReport is the single helper every organizer earnings surface calls
    // (payoutController.getEarningsBreakdown, routes/organizers.ts, earningsPdfController).
    // Fed this row it must return the accrued number, NOT amount * currentTierRate.
    const report = resolveOrganizerFeeReport(
      purchase as any,
      getPlatformFeeRate('PRO')
    );
    expect(report.grossSalePrice).toBeCloseTo(250, 2);
    expect(report.platformFee).toBeCloseTo(organizerAfter!.cashFeeBalance, 2);
    expect(report.platformFee).toBeCloseTo(20, 2);

    // And it stays pinned when the organizer's tier changes — the whole point of the snapshot.
    const afterUpgrade = resolveOrganizerFeeReport(purchase as any, getPlatformFeeRate('SIMPLE'));
    expect(afterUpgrade.platformFee).toBeCloseTo(20, 2);
  });

  it('does not accrue twice when the same holds are settled again', async () => {
    const { orgUser, organizer, item, hold } = await seed('double', 'SIMPLE', 40);

    const first = await recordSold(orgUser, [hold.id]);
    expect(first.json.mock.calls[0][0].platformFee).toBe(4);

    const balanceAfterFirst = (await prisma.organizer.findUnique({ where: { id: organizer.id } }))!
      .cashFeeBalance;
    expect(balanceAfterFirst).toBeCloseTo(4, 2);

    // Repeat submit. Two guards stand between a double-click and a double charge, and this
    // asserts the OUTER one: the first settlement moved the hold to the terminal 'COMPLETED'
    // state, so the router's `status: { in: ['PENDING','CONFIRMED'] }` lookup finds nothing and
    // returns 404 before the transaction is even opened. (The inner guard — the conditional
    // updateMany claim inside the transaction, which returns 409 — is what catches a genuinely
    // CONCURRENT pair, where both requests read the hold as CONFIRMED. Both end in zero
    // additional accrual, which is the property that matters here.)
    const second = await recordSold(orgUser, [hold.id]);
    expect(second.status).toHaveBeenCalledWith(404);

    const balanceAfterSecond = (await prisma.organizer.findUnique({ where: { id: organizer.id } }))!
      .cashFeeBalance;
    expect(balanceAfterSecond).toBeCloseTo(4, 2);
    expect(await prisma.purchase.count({ where: { itemId: item.id } })).toBe(1);
  });

  it('accrues the sum across a multi-item batch', async () => {
    const a = await seed('batch', 'SIMPLE', 30);
    // Second item + hold on the SAME sale/organizer.
    const item2 = await prisma.item.create({
      data: {
        saleId: a.sale.id,
        title: 'Cash Fee Item batch-2',
        description: 'Fixture',
        price: 70,
        status: 'RESERVED',
        category: 'Furniture',
        embedding: [], // NOT NULL, no DB default (migration 20260307153530 drops it)
      },
    });
    const hold2 = await prisma.itemReservation.create({
      data: {
        itemId: item2.id,
        userId: shopper.id,
        status: 'CONFIRMED',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    const res = await recordSold(a.orgUser, [a.hold.id, hold2.id]);
    const body = res.json.mock.calls[0][0];
    expect(body.updated).toBe(2);
    expect(body.platformFee).toBeCloseTo(10, 2); // $3.00 + $7.00

    const after = await prisma.organizer.findUnique({ where: { id: a.organizer.id } });
    expect(after!.cashFeeBalance).toBeCloseTo(10, 2);
  });

  it('deducts the accrued balance from a payout and zeroes it', async () => {
    const { orgUser, organizer, hold } = await seed('payout', 'SIMPLE', 100);
    await recordSold(orgUser, [hold.id]);
    expect((await prisma.organizer.findUnique({ where: { id: organizer.id } }))!.cashFeeBalance)
      .toBeCloseTo(10, 2);

    mockPayoutsCreate.mockResolvedValueOnce({
      id: 'po_cashfee',
      amount: 9000,
      method: 'standard',
      status: 'pending',
      arrival_date: Math.floor(Date.now() / 1000),
    });

    const req: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'] },
      body: { amount: 100, method: 'standard' },
    };
    const res = makeMockRes();
    await createPayout(req, res);

    // Stripe is asked for the NET amount: $100.00 requested − $10.00 owed = $90.00.
    expect(mockPayoutsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 9000 }),
      expect.objectContaining({ stripeAccount: organizer.stripeConnectId })
    );
    expect(res.json.mock.calls[0][0].cashFeeDeducted).toBeCloseTo(10, 2);

    // Debt settled — balance back to zero.
    const after = await prisma.organizer.findUnique({ where: { id: organizer.id } });
    expect(after!.cashFeeBalance).toBeCloseTo(0, 2);
  });

  it('refuses a payout smaller than the commission owed', async () => {
    const { orgUser, organizer, hold } = await seed('refuse', 'SIMPLE', 100);
    await recordSold(orgUser, [hold.id]);

    const req: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'] },
      body: { amount: 5, method: 'standard' },
    };
    const res = makeMockRes();
    await createPayout(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].cashFeeDeduction).toBeCloseTo(10, 2);
    // Nothing paid out, so the debt is untouched.
    const after = await prisma.organizer.findUnique({ where: { id: organizer.id } });
    expect(after!.cashFeeBalance).toBeCloseTo(10, 2);
  });

  it('rejects a settlement against another organizer’s hold and accrues nothing', async () => {
    const victim = await seed('victim', 'SIMPLE', 100);
    const attacker = await seed('attacker', 'SIMPLE', 5);

    const res = await recordSold(attacker.orgUser, [victim.hold.id]);
    expect(res.status).toHaveBeenCalledWith(404);

    expect((await prisma.organizer.findUnique({ where: { id: attacker.organizer.id } }))!
      .cashFeeBalance).toBeCloseTo(0, 2);
    expect((await prisma.organizer.findUnique({ where: { id: victim.organizer.id } }))!
      .cashFeeBalance).toBeCloseTo(0, 2);
    expect(await prisma.purchase.count({ where: { itemId: victim.item.id } })).toBe(0);
  });

  it('ignores any fee, rate or balance field supplied by the client', async () => {
    const { orgUser, organizer, item, hold } = await seed('massassign', 'SIMPLE', 100);

    const req: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      body: {
        ids: [hold.id],
        action: 'markSold',
        settlementMode: 'RECORD',
        // None of these are read. The rate comes from the organizer's own record, server-side.
        platformFeeAmount: 0,
        platformFee: 0,
        commissionAmount: 0,
        commissionRate: 0,
        cashFeeBalance: 0,
        feeRate: 0,
        amount: 1,
      },
    };
    const res = makeMockRes();
    await batchUpdateHolds(req, res);

    expect(res.json.mock.calls[0][0].platformFee).toBe(10);
    const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id } });
    expect(purchase!.platformFeeAmount).toBeCloseTo(10, 2);
    expect(purchase!.amount).toBeCloseTo(100, 2);
    expect((await prisma.organizer.findUnique({ where: { id: organizer.id } }))!.cashFeeBalance)
      .toBeCloseTo(10, 2);
  });

  it('rejects a non-organizer caller', async () => {
    const { hold } = await seed('anon', 'SIMPLE', 100);

    const anonRes = makeMockRes();
    await batchUpdateHolds(
      { body: { ids: [hold.id], action: 'markSold', settlementMode: 'RECORD' } } as any,
      anonRes
    );
    expect(anonRes.status).toHaveBeenCalledWith(401);

    const shopperRes = makeMockRes();
    await batchUpdateHolds(
      {
        user: { id: shopper.id, role: 'USER', roles: ['USER'] },
        body: { ids: [hold.id], action: 'markSold', settlementMode: 'RECORD' },
      } as any,
      shopperRes
    );
    expect(shopperRes.status).toHaveBeenCalledWith(403);
  });
});
