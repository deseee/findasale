/**
 * POS combined-invoice commission -- tier-aware rate on the card leg (P0 fix, 2026-08-24).
 *
 * WHAT THIS SUITE EXISTS FOR: controllers/posController.ts's createCombinedInvoice
 * (the "Create Invoice" button on a POS held-items cart) resolved the organizer's
 * platform fee rate via a local `roleSubscriptions?.some(rs => rs.subscriptionTier
 * === 'PRO')` check that silently excluded TEAMS -- the same copy-pasted bug already
 * found and fixed in posPaymentController.ts (split-tender, see
 * __tests__/posSplitPaymentFee.test.ts), terminalController.ts, and
 * reservationController.ts's ONLINE Hold-to-Pay path. Every TEAMS organizer invoicing
 * a held-items cart through this endpoint was charged the SIMPLE-tier 10% instead of
 * their contractual 8%.
 *
 * The fix replaces the local check with the shared canonical resolver
 * `getPlatformFeeRate(organizer.subscriptionTier as SubscriptionTier)` from
 * utils/feeCalculator.ts, using `organizer.subscriptionTier` already carried on the
 * `ResolvedPosActor` returned by utils/posAuth.ts's resolveOrganizerOrTeamMember
 * (covers both the ORGANIZER and TEAM_MEMBER-acting-for-owner branches).
 *
 * UNLIKE the sibling split-tender flow, createCombinedInvoice charges the platform fee
 * ONLY on the CARD portion of the invoice (`cardAmountCents`) -- there is no
 * `Organizer.cashFeeBalance` accrual anywhere in this function for the cash portion.
 * That asymmetry is confirmed by reading the full function body (no reference to
 * cashFeeBalance / accrueCashFeeBalance / resolveCashCommissionRate anywhere in
 * posController.ts) and is intentional scope for this suite: these tests assert the
 * CARD-leg fee math only, not a cash-leg accrual this code path does not perform.
 *
 * These tests assert the money on real organizers (TEAMS 8% + a SIMPLE 10% control),
 * not the code shape:
 *   - a TEAMS organizer's split cash/card invoice charges 8% of the CARD portion only,
 *     never the old hardcoded 10%
 *   - a TEAMS organizer's all-card (no cash) invoice charges 8% of the full total
 *   - a SIMPLE-tier organizer (regression guard against overcorrecting) still gets 10%
 * In every case the assertion covers both the Stripe `application_fee_amount` sent on
 * the Checkout Session's `payment_intent_data` AND the `HoldInvoice.platformFeeAmount`
 * row persisted to Postgres (HoldInvoice stores amounts in CENTS, unlike
 * Purchase.platformFeeAmount elsewhere in the codebase which is dollars -- confirmed via
 * packages/database/prisma/schema.prisma's HoldInvoice model, `totalAmount Int // in
 * cents` / `platformFeeAmount Int // in cents`).
 *
 * MOCKING NOTES: posController.ts's actual imports (confirmed via `grep -n "^import"`)
 * are narrower than the sibling posPaymentController.ts -- it never touches eBay,
 * Shopify, Facebook-nudge, marketplace-stock-sync, or checkoutGuard, so none of those
 * are mocked here. What IS mocked: ../utils/stripe (Checkout Session create +
 * PaymentIntent metadata backfill), ../lib/socket, ../lib/notificationService,
 * ../lib/transactionalEmailService (the fire-and-forget invoice email), and
 * ../services/stripeConnectService's shouldUseDirectCharge (forced to the DESTINATION-
 * charge default so the Checkout Session create call's shape is deterministic). Real,
 * unmocked: utils/feeCalculator (the fix under test), services/itemSaleGuard
 * (commitItemSale -- pure DB atomic-transition logic), utils/posAuth
 * (resolveOrganizerOrTeamMember -- pure DB lookup), utils/stripeCheckoutExpiry (pure
 * clamp math), and services/holdInvoiceClaim (pure DB helpers).
 */

import { prisma } from '../lib/prisma';

// -- Mocks (hoisted by ts-jest above these declarations -- `var`, not `const`, deliberately) --
var mockSessionsCreate = jest.fn();
var mockPaymentIntentsUpdate = jest.fn();

jest.mock('../utils/stripe', () => ({
  getStripe: jest.fn(() => ({
    checkout: {
      sessions: {
        create: mockSessionsCreate,
      },
    },
    paymentIntents: {
      update: mockPaymentIntentsUpdate,
    },
  })),
  default: jest.fn(),
}));

jest.mock('../lib/socket', () => ({
  getIO: jest.fn(() => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) })),
}));
jest.mock('../lib/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: {
    emails: {
      send: jest.fn().mockResolvedValue(undefined),
    },
  },
}));
jest.mock('../services/stripeConnectService', () => ({
  shouldUseDirectCharge: jest.fn().mockResolvedValue(false),
  getAccountStatus: jest.fn().mockResolvedValue({ chargesEnabled: true }),
}));

// -- Imports AFTER the mocks --------------------------------------------------------------
import { createCombinedInvoice } from '../controllers/posController';

const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('POS combined-invoice commission -- tier-aware rate on the card leg', () => {
  /** Build an isolated organizer (given tier) + PUBLISHED sale + shopper + POSSession + a
   *  single held item (price $100) already in HOLD_IN_CART, ready to be invoiced. */
  const seed = async (key: string, tier: 'SIMPLE' | 'TEAMS') => {
    const orgUser = await prisma.user.create({
      data: {
        id: `combined-inv-fee-org-user-${key}`,
        email: `combined-inv-fee-org-${key}@findasale.test`,
        name: `Combined Invoice Fee Organizer ${key}`,
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
      },
    });
    const organizer = await prisma.organizer.create({
      data: {
        userId: orgUser.id,
        businessName: `Combined Invoice Fee Estate Sales ${key}`,
        address: '219 E Michigan Ave, Paw Paw, MI 49079',
        subscriptionTier: tier,
        stripeConnectId: `acct_combinedinvfee${key}`,
      },
    });
    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: `Combined Invoice Fee Sale ${key}`,
        description: 'Combined-invoice commission fixture',
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
        id: `combined-inv-fee-shopper-${key}`,
        email: `combined-inv-fee-shopper-${key}@findasale.test`,
        name: `Combined Invoice Fee Shopper ${key}`,
        password: 'hashed_password',
        role: 'USER',
        roles: ['USER'],
      },
    });
    const session = await prisma.pOSSession.create({
      data: {
        organizerId: organizer.id,
        saleId: sale.id,
        shopperId: shopper.id,
        status: 'OPEN',
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });
    const item = await prisma.item.create({
      data: {
        id: `combined-inv-fee-item-${key}`,
        title: `Combined Invoice Fee Item ${key}`,
        price: 100, // dollars -- $100.00
        photoUrls: [],
        status: 'RESERVED', // commitItemSale's allowed fromStatuses cover RESERVED
        saleId: sale.id,
      },
    });
    const hold = await prisma.itemReservation.create({
      data: {
        itemId: item.id,
        userId: shopper.id,
        status: 'HOLD_IN_CART',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    return { orgUser, organizer, sale, shopper, session, item, hold };
  };

  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_combined_invoice_fee';
    // Force shouldUseDirectCharge's real allowlist gate closed too, belt-and-suspenders
    // alongside the module mock above.
    delete process.env.STRIPE_DIRECT_CHARGES_ORGANIZER_ALLOWLIST;
  });

  beforeEach(() => {
    mockSessionsCreate.mockReset();
    mockPaymentIntentsUpdate.mockReset().mockResolvedValue({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('charges TEAMS 8% on the CARD portion of a split cash/card invoice (not the hardcoded 10%)', async () => {
    const { orgUser, organizer, session, shopper, hold } = await seed('teams-split', 'TEAMS');

    mockSessionsCreate.mockResolvedValueOnce({
      id: 'cs_combined_teams_split',
      payment_intent: 'pi_combined_teams_split',
    });

    // $100 item, $40 collected in cash at POS -> $60 remaining on the card leg.
    const req: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      params: { sessionId: session.id },
      body: {
        shopperId: shopper.id,
        invoiceMode: 'QUICK',
        cashAmountCents: 4000,
        holdIds: [hold.id],
      },
    };
    const res = makeMockRes();
    await createCombinedInvoice(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.status).not.toHaveBeenCalledWith(500);

    // THE STRIPE CHARGE: application_fee_amount on the card leg must be 8% of the $60
    // card portion (600 cents -> 480 cents), never the old hardcoded 10% (600 cents).
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: expect.objectContaining({ application_fee_amount: 480 }),
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );

    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody.cashAmountCents).toBe(4000);
    expect(responseBody.cardAmountCents).toBe(6000);
    expect(responseBody.platformFeeAmount).toBe(480);

    // THE PERSISTED ROW: HoldInvoice.platformFeeAmount is stored in CENTS and must match
    // 8% of the $60 card portion -- was 60 cents short of that (600 = 10%) before the fix.
    const invoice = await prisma.holdInvoice.findFirst({ where: { cartSessionId: session.id } });
    expect(invoice).not.toBeNull();
    expect(invoice!.totalAmount).toBe(10000);
    expect(invoice!.cashAmountCents).toBe(4000);
    expect(invoice!.cardAmountCents).toBe(6000);
    expect(invoice!.platformFeeAmount).toBe(480); // 8% of 6000 -- was 600 (10%) before the fix
  });

  it('charges TEAMS 8% on the full total when the invoice is all-card (no cash collected)', async () => {
    const { orgUser, organizer, session, shopper, hold } = await seed('teams-allcard', 'TEAMS');

    mockSessionsCreate.mockResolvedValueOnce({
      id: 'cs_combined_teams_allcard',
      payment_intent: 'pi_combined_teams_allcard',
    });

    const req: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      params: { sessionId: session.id },
      body: {
        shopperId: shopper.id,
        invoiceMode: 'QUICK',
        holdIds: [hold.id],
      },
    };
    const res = makeMockRes();
    await createCombinedInvoice(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);

    // Full $100 total on the card leg -- fee is 8% of $100 = 800 cents, not the old
    // hardcoded 10% (1000 cents).
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: expect.objectContaining({ application_fee_amount: 800 }),
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );

    const invoice = await prisma.holdInvoice.findFirst({ where: { cartSessionId: session.id } });
    expect(invoice).not.toBeNull();
    expect(invoice!.cashAmountCents).toBeNull();
    expect(invoice!.cardAmountCents).toBe(10000);
    expect(invoice!.platformFeeAmount).toBe(800); // 8% of 10000 -- was 1000 (10%) before the fix
  });

  it('a SIMPLE-tier organizer still gets the 10% rate on the card portion (control -- no overcorrection)', async () => {
    const { orgUser, organizer, session, shopper, hold } = await seed('simple-split', 'SIMPLE');

    mockSessionsCreate.mockResolvedValueOnce({
      id: 'cs_combined_simple_split',
      payment_intent: 'pi_combined_simple_split',
    });

    // Same $100/$40-cash/$60-card shape as the TEAMS split test above, so the ONLY
    // variable is the tier -- this is the regression guard that the fix didn't
    // overcorrect and flatten every tier to 8%.
    const req: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      params: { sessionId: session.id },
      body: {
        shopperId: shopper.id,
        invoiceMode: 'QUICK',
        cashAmountCents: 4000,
        holdIds: [hold.id],
      },
    };
    const res = makeMockRes();
    await createCombinedInvoice(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);

    // 10% of the $60 card portion = 600 cents.
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: expect.objectContaining({ application_fee_amount: 600 }),
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );

    const invoice = await prisma.holdInvoice.findFirst({ where: { cartSessionId: session.id } });
    expect(invoice).not.toBeNull();
    expect(invoice!.cardAmountCents).toBe(6000);
    expect(invoice!.platformFeeAmount).toBe(600); // 10% of 6000 -- SIMPLE tier, correctly unchanged
  });
});
