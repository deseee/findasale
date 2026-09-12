/**
 * sendHoldInvoice — cash/card split + fully-cash immediate-paid path (ADR-114, 2026-08-31).
 *
 * WHAT THIS SUITE EXISTS FOR: sendHoldInvoice (controllers/posController.ts) previously
 * ignored `cashAmountCents` entirely even though PosInvoiceModal has sent it all along --
 * every invoice charged the FULL total via card, and the platform fee was computed on the
 * full total too. This suite is the sendHoldInvoice-side counterpart to
 * posCombinedInvoiceFee.test.ts (which covered the same math on createCombinedInvoice,
 * now removed as part of the same ADR -- these assertions are ported from that file, not
 * re-derived, per the ADR's explicit instruction).
 *
 * Covers:
 *   - a TEAMS organizer's split cash/card invoice charges 8% of the CARD portion only
 *   - a SIMPLE-tier organizer (regression guard) still gets 10% of the card portion
 *   - a fully-cash invoice (cashAmountCents >= total) never creates a payment link at all,
 *     and is recorded PAID immediately with a real Purchase row (no fabricated PaymentIntent
 *     id -- stripePaymentIntentId is null throughout, source 'POS')
 *
 * Stripe removal (2026-09-12): sendHoldInvoice's card/balance-due leg no longer creates a
 * Stripe Checkout Session at all (that ~330-line block was deleted outright this session,
 * see that function's own "Stripe removal (2026-09-12) cleanup" comment) -- a Square-onboarded
 * organizer's card leg now goes through createHoldInvoiceSquareCheckout
 * (services/holdInvoiceSquareCheckoutHelper.ts), a Square Payment Link, and a Stripe-only
 * organizer instead falls through to a 409 SquareOnboardingIncompleteError. This suite now
 * seeds Square-onboarded organizers and mocks createHoldInvoiceSquareCheckout directly (the
 * same seam sendHoldInvoice itself calls) -- the fee-rate math it verifies (8%/10% of the CARD
 * portion only) is unchanged by the processor swap, since platformFeeAmount is computed
 * before the Square/Stripe branch split and merely spent as `appFeeCents` once the payment
 * link is created.
 *
 * MOCKING NOTES: same convention as posCombinedInvoiceFee.test.ts / sendHoldInvoiceMergedReservation.test.ts
 * -- Square payment-link creation, socket, notifications and transactional email are mocked;
 * commitItemSale/itemSaleGuard, resolveOrganizerOrTeamMember, and
 * holdInvoicePaymentRecorder.markHoldInvoicePaid (for the fully-cash path) are left real
 * (pure DB logic plus the function under joint test).
 */

import { prisma } from '../lib/prisma';

// -- Mocks (hoisted by ts-jest above these declarations -- `var`, not `const`, deliberately) --
var mockCreateHoldInvoiceSquareCheckout = jest.fn();

jest.mock('../services/holdInvoiceSquareCheckoutHelper', () => {
  const actual = jest.requireActual('../services/holdInvoiceSquareCheckoutHelper');
  return {
    ...actual,
    createHoldInvoiceSquareCheckout: (...args: any[]) => mockCreateHoldInvoiceSquareCheckout(...args),
  };
});

jest.mock('../lib/socket', () => ({
  getIO: jest.fn(() => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) })),
}));
jest.mock('../lib/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: { emails: { send: jest.fn().mockResolvedValue(undefined) } },
}));
jest.mock('../services/stripeConnectService', () => ({
  shouldUseDirectCharge: jest.fn().mockResolvedValue(false),
  getAccountStatus: jest.fn().mockResolvedValue({ chargesEnabled: true }),
}));

// -- Imports AFTER the mocks --------------------------------------------------------------
import { sendHoldInvoice } from '../controllers/posController';

const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('sendHoldInvoice -- cash/card split + fully-cash immediate-paid (ADR-114)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateHoldInvoiceSquareCheckout.mockReset();
  });

  /** Build an isolated, Square-onboarded organizer (given tier) + PUBLISHED sale + shopper +
   *  one $100 held item. */
  const seed = async (key: string, tier: 'SIMPLE' | 'TEAMS') => {
    const orgUser = await prisma.user.create({
      data: {
        id: `hi-cash-split-org-user-${key}`,
        email: `hi-cash-split-org-${key}@findasale.test`,
        name: `Cash Split Organizer ${key}`,
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
      },
    });
    const organizer = await prisma.organizer.create({
      data: {
        userId: orgUser.id,
        businessName: `Cash Split Estate Sales ${key}`,
        address: '219 E Michigan Ave, Paw Paw, MI 49079',
        subscriptionTier: tier,
        squareOnboarded: true,
        squareMerchantId: `sq-merchant-hicashsplit-${key}`,
        squareLocationId: `sq-location-hicashsplit-${key}`,
        cashFeeBalance: 0,
      },
    });
    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: `Cash Split Sale ${key}`,
        description: 'Cash/card split fixture',
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
        id: `hi-cash-split-shopper-${key}`,
        email: `hi-cash-split-shopper-${key}@findasale.test`,
        name: `Cash Split Shopper ${key}`,
        password: 'hashed_password',
        role: 'USER',
        roles: ['USER'],
      },
    });
    const item = await prisma.item.create({
      data: {
        saleId: sale.id,
        title: `Cash Split Item ${key}`,
        description: 'Fixture',
        price: 100, // dollars -- $100.00
        status: 'RESERVED',
        draftStatus: 'PUBLISHED',
        category: 'Furniture',
        embedding: [],
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
    return { orgUser, organizer, sale, shopper, item, hold };
  };

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('charges TEAMS 8% on the CARD portion of a split cash/card invoice (not the full total)', async () => {
    const { orgUser, hold } = await seed('teams-split', 'TEAMS');

    mockCreateHoldInvoiceSquareCheckout.mockResolvedValueOnce({
      ok: true,
      paymentLinkId: 'sqpl_hi_teams_split',
      orderId: 'sqorder_hi_teams_split',
      url: 'https://squareup.com/pay/hi_teams_split',
      longUrl: null,
    });

    const req: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      params: { reservationId: hold.id },
      body: { deliverVia: 'EMAIL', cashAmountCents: 4000 },
    };
    const res = makeMockRes();
    await sendHoldInvoice(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.status).not.toHaveBeenCalledWith(500);

    // $100 item, $40 cash -> $60 card leg. Fee = 8% of 6000 = 480, never 10% of the full
    // 10000 total (800) or 10% of the card leg (600).
    expect(mockCreateHoldInvoiceSquareCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 6000, appFeeCents: 480 })
    );

    const invoice = await prisma.holdInvoice.findFirst({ where: { reservationId: hold.id } });
    expect(invoice).not.toBeNull();
    expect(invoice!.totalAmount).toBe(10000);
    expect(invoice!.cashAmountCents).toBe(4000);
    expect(invoice!.cardAmountCents).toBe(6000);
    expect(invoice!.platformFeeAmount).toBe(480);
    expect(invoice!.squarePaymentLinkId).toBe('sqpl_hi_teams_split');
  });

  it('a SIMPLE-tier organizer still gets 10% on the card portion (control -- no overcorrection)', async () => {
    const { orgUser, hold } = await seed('simple-split', 'SIMPLE');

    mockCreateHoldInvoiceSquareCheckout.mockResolvedValueOnce({
      ok: true,
      paymentLinkId: 'sqpl_hi_simple_split',
      orderId: 'sqorder_hi_simple_split',
      url: 'https://squareup.com/pay/hi_simple_split',
      longUrl: null,
    });

    const req: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      params: { reservationId: hold.id },
      body: { deliverVia: 'EMAIL', cashAmountCents: 4000 },
    };
    const res = makeMockRes();
    await sendHoldInvoice(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);

    // 10% of the $60 card portion = 600 cents.
    expect(mockCreateHoldInvoiceSquareCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 6000, appFeeCents: 600 })
    );

    const invoice = await prisma.holdInvoice.findFirst({ where: { reservationId: hold.id } });
    expect(invoice).not.toBeNull();
    expect(invoice!.cardAmountCents).toBe(6000);
    expect(invoice!.platformFeeAmount).toBe(600);
  });

  it('a fully-cash invoice never touches Square and is recorded PAID immediately with a real Purchase row', async () => {
    const { orgUser, organizer, item, hold, shopper } = await seed('all-cash', 'TEAMS');

    const req: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'], email: orgUser.email },
      params: { reservationId: hold.id },
      body: { deliverVia: 'EMAIL', cashAmountCents: 10000 },
    };
    const res = makeMockRes();
    await sendHoldInvoice(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);
    // The whole point: no Square payment link for a 100%-cash invoice.
    expect(mockCreateHoldInvoiceSquareCheckout).not.toHaveBeenCalled();

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PAID', cashAmountCents: 10000, cardAmountCents: 0 })
    );

    const invoice = await prisma.holdInvoice.findFirst({ where: { reservationId: hold.id } });
    expect(invoice).not.toBeNull();
    expect(invoice!.status).toBe('PAID');
    expect(invoice!.cashAmountCents).toBe(10000);
    expect(invoice!.cardAmountCents).toBeNull();
    expect(invoice!.stripeSessionId).toBeNull();
    expect(invoice!.stripePaymentIntentId).toBeNull();
    expect(invoice!.squarePaymentLinkId).toBeNull();
    expect(invoice!.platformFeeAmount).toBe(0);

    // Item marked SOLD and reservation COMPLETED -- same terminal state a real Square
    // payment would produce via markHoldInvoicePaid.
    const itemAfter = await prisma.item.findUnique({ where: { id: item.id } });
    expect(itemAfter!.status).toBe('SOLD');
    const holdAfter = await prisma.itemReservation.findUnique({ where: { id: hold.id } });
    expect(holdAfter!.status).toBe('COMPLETED');

    // A real Purchase row exists for refund/dispute tooling to key off -- no synthetic
    // PaymentIntent id (null throughout), source 'POS' (not 'ONLINE' -- this was an
    // in-person cash sale, not a card payment).
    const purchase = await prisma.purchase.findFirst({ where: { itemId: item.id, userId: shopper.id } });
    expect(purchase).not.toBeNull();
    expect(purchase!.status).toBe('PAID');
    expect(purchase!.source).toBe('POS');
    expect(purchase!.stripePaymentIntentId).toBeNull();
    expect(purchase!.amount).toBe(100);
    void organizer;
  });
});
