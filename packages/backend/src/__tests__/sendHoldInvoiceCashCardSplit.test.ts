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
 *   - a fully-cash invoice (cashAmountCents >= total) never creates a Stripe Checkout
 *     Session at all, and is recorded PAID immediately with a real Purchase row (no
 *     fabricated PaymentIntent id -- stripePaymentIntentId is null throughout, source 'POS')
 *
 * MOCKING NOTES: same convention as posCombinedInvoiceFee.test.ts / sendHoldInvoiceMergedReservation.test.ts
 * -- Stripe Checkout + PaymentIntent update mocked; commitItemSale/itemSaleGuard,
 * resolveOrganizerOrTeamMember, and holdInvoicePaymentRecorder.markHoldInvoicePaid (for the
 * fully-cash path) are left real (pure DB logic plus the function under joint test).
 */

import { prisma } from '../lib/prisma';

// -- Mocks (hoisted by ts-jest above these declarations -- `var`, not `const`, deliberately) --
var mockSessionsCreate = jest.fn();
var mockPaymentIntentsUpdate = jest.fn();

jest.mock('../utils/stripe', () => ({
  getStripe: jest.fn(() => ({
    checkout: { sessions: { create: mockSessionsCreate } },
    paymentIntents: { update: mockPaymentIntentsUpdate },
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
    mockPaymentIntentsUpdate.mockResolvedValue({});
  });

  /** Build an isolated organizer (given tier) + PUBLISHED sale + shopper + one $100 held item. */
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
        stripeConnectId: `acct_hicashsplit${key}`,
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

  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_hold_invoice_cash_split';
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('charges TEAMS 8% on the CARD portion of a split cash/card invoice (not the full total)', async () => {
    const { orgUser, hold } = await seed('teams-split', 'TEAMS');

    mockSessionsCreate.mockResolvedValueOnce({
      id: 'cs_hi_teams_split',
      payment_intent: 'pi_hi_teams_split',
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
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount_decimal: '6000',
            }),
          }),
        ],
        payment_intent_data: expect.objectContaining({ application_fee_amount: 480 }),
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );

    const invoice = await prisma.holdInvoice.findFirst({ where: { reservationId: hold.id } });
    expect(invoice).not.toBeNull();
    expect(invoice!.totalAmount).toBe(10000);
    expect(invoice!.cashAmountCents).toBe(4000);
    expect(invoice!.cardAmountCents).toBe(6000);
    expect(invoice!.platformFeeAmount).toBe(480);
    expect(invoice!.stripeSessionId).toBe('cs_hi_teams_split');
  });

  it('a SIMPLE-tier organizer still gets 10% on the card portion (control -- no overcorrection)', async () => {
    const { orgUser, hold } = await seed('simple-split', 'SIMPLE');

    mockSessionsCreate.mockResolvedValueOnce({
      id: 'cs_hi_simple_split',
      payment_intent: 'pi_hi_simple_split',
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
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: expect.objectContaining({ application_fee_amount: 600 }),
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );

    const invoice = await prisma.holdInvoice.findFirst({ where: { reservationId: hold.id } });
    expect(invoice).not.toBeNull();
    expect(invoice!.cardAmountCents).toBe(6000);
    expect(invoice!.platformFeeAmount).toBe(600);
  });

  it('a fully-cash invoice never touches Stripe and is recorded PAID immediately with a real Purchase row', async () => {
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
    // The whole point: no Stripe Checkout Session for a 100%-cash invoice.
    expect(mockSessionsCreate).not.toHaveBeenCalled();

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
    expect(invoice!.platformFeeAmount).toBe(0);

    // Item marked SOLD and reservation COMPLETED -- same terminal state a real Stripe
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
