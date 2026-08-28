/**
 * Terminal server-authoritative catalog pricing (ADR-112, 2026-08-28).
 *
 * WHAT THIS SUITE EXISTS FOR: controllers/terminalController.ts's createTerminalPaymentIntent
 * already fetched Item.price for every cart row with an itemId, and already computed a correct
 * catalogSubtotalCents from those real prices to feed resolvePosDiscount -- but the actual
 * per-row charged amount (chargedItems) was ALWAYS derived from the client-sent `i.amount`, in
 * BOTH the no-discount branch (amount trusted outright) AND the discount branch (the discount
 * RATIO was authorized correctly, but applied to the client's own lowballed `amount` rather than
 * the real catalog price -- so the underlying base price was never actually verified either
 * way). A cart row could carry a real itemId and a hand-crafted low `amount`, discount fields
 * present or not, and it would charge that low amount.
 *
 * ADR-112 makes every catalog row (itemId present) ALWAYS priced from the real
 * dbItems[itemId].price, ignoring the client's `amount` for that row entirely; the discount
 * ratio (0 when no discount was requested) is applied on top of the real price, never the
 * client's number. Misc/custom-amount rows (no itemId) are unaffected -- they keep using the
 * client's `amount` verbatim, the deliberate, unchanged trust boundary for those items.
 *
 * These tests assert the money, not the code shape:
 *   - a real $75 catalog item sent with a hand-crafted `amount: 1` and no discount fields is
 *     charged the real $75 (Stripe PI amount + Purchase.amount), not the lowballed $1
 *   - a misc item (no itemId) with a client-supplied `amount` is charged exactly that amount,
 *     unaffected by this fix (control)
 *
 * MOCKING NOTES: same convention as terminalSplitPaymentCashFee.test.ts (this controller's
 * sibling test file) -- Stripe is mocked; resolvePosDiscount is left real/unmocked.
 */

import { prisma } from '../lib/prisma';

// -- Mocks (hoisted by ts-jest above these declarations -- `var`, not `const`, deliberately) --
var mockPaymentIntentCreate = jest.fn();
var mockPaymentIntentCapture = jest.fn();

jest.mock('../utils/stripe', () => ({
  getStripe: jest.fn(() => ({
    paymentIntents: {
      create: mockPaymentIntentCreate,
      capture: mockPaymentIntentCapture,
    },
  })),
  default: jest.fn(),
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
jest.mock('../services/stripeConnectService', () => ({
  shouldUseDirectCharge: jest.fn().mockResolvedValue(false),
  getAccountStatus: jest.fn().mockResolvedValue({ chargesEnabled: true }),
}));
jest.mock('../services/checkoutGuard', () => ({
  recordSuspectedSignal: jest.fn().mockResolvedValue(undefined),
}));

// -- Imports AFTER the mocks --------------------------------------------------------------
import { createTerminalPaymentIntent } from '../controllers/terminalController';

const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('Terminal server-authoritative catalog pricing (ADR-112)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** Build an isolated organizer + PUBLISHED sale + AVAILABLE item at the given real price. */
  const seed = async (key: string, price: number) => {
    const orgUser = await prisma.user.create({
      data: {
        id: `terminal-pricing-org-user-${key}`,
        email: `terminal-pricing-org-${key}@findasale.test`,
        name: `Terminal Pricing Organizer ${key}`,
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
      },
    });
    const organizer = await prisma.organizer.create({
      data: {
        userId: orgUser.id,
        businessName: `Terminal Pricing Estate Sales ${key}`,
        address: '219 E Michigan Ave, Paw Paw, MI 49079',
        subscriptionTier: 'TEAMS',
        stripeConnectId: `acct_terminalpricing${key}`,
        cashFeeBalance: 0,
      },
    });
    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: `Terminal Pricing Sale ${key}`,
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
        title: `Terminal Pricing Item ${key}`,
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

  beforeAll(() => {
    delete process.env.STRIPE_TERMINAL_SIMULATED;
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_terminal_pricing';
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('charges the real $75 catalog price, not a hand-crafted $1 amount, with no discount fields sent', async () => {
    const { orgUser, item } = await seed('lowball', 75);

    mockPaymentIntentCreate.mockResolvedValueOnce({
      id: 'pi_terminal_pricing_lowball',
      client_secret: 'secret_terminal_pricing_lowball',
    });

    const createReq: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'] },
      body: {
        // A real itemId paired with a hand-crafted low amount and no discount fields at all --
        // before ADR-112 this charged $1.00 for a real $75.00 item.
        items: [{ itemId: item.id, amount: 1 }],
      },
    };
    const createRes = makeMockRes();
    await createTerminalPaymentIntent(createReq, createRes);

    expect(createRes.status).not.toHaveBeenCalledWith(400);
    expect(createRes.status).not.toHaveBeenCalledWith(500);
    const piParams = mockPaymentIntentCreate.mock.calls[0][0];
    expect(piParams.amount).toBe(7500); // the real catalog price, not the hand-crafted $1

    const createBody = createRes.json.mock.calls[0][0];
    const purchase = await prisma.purchase.findFirst({
      where: { id: { in: createBody.purchaseIds ?? [] } },
    });
    // Fall back to a saleId-scoped lookup if the response shape doesn't expose purchaseIds
    // directly -- either way, the persisted Purchase.amount must reflect the real price.
    const persisted = purchase ?? (await prisma.purchase.findFirst({ where: { itemId: item.id } }));
    expect(persisted).not.toBeNull();
    expect(persisted!.amount).toBeCloseTo(75, 2);
  });

  it('a misc item (no itemId) is still charged exactly the client-supplied amount (control)', async () => {
    const { orgUser, sale } = await seed('misc', 75);

    mockPaymentIntentCreate.mockResolvedValueOnce({
      id: 'pi_terminal_pricing_misc',
      client_secret: 'secret_terminal_pricing_misc',
    });

    const createReq: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'] },
      body: {
        // Misc/custom-amount row: no itemId at all, so no catalog price exists to check
        // against -- this is the deliberate, unchanged trust boundary ADR-112 does not touch.
        // saleId is required in the body for a misc-only cart (no itemId to derive it from).
        items: [{ amount: 12.5, label: 'Custom tip' }],
        saleId: sale.id,
      },
    };
    const createRes = makeMockRes();
    await createTerminalPaymentIntent(createReq, createRes);

    expect(createRes.status).not.toHaveBeenCalledWith(400);
    expect(createRes.status).not.toHaveBeenCalledWith(500);
    const piParams = mockPaymentIntentCreate.mock.calls[0][0];
    expect(piParams.amount).toBe(1250); // unaffected -- misc rows stay client-priced
  });
});
