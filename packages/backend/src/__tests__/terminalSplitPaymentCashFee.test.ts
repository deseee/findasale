/**
 * Terminal split cash+card commission — cash-half accrual (P2 fix, sibling to
 * posSplitPaymentFee.test.ts's posPaymentController coverage, same investigation).
 *
 * WHAT THIS SUITE EXISTS FOR: controllers/terminalController.ts's split-tender path
 * (createTerminalPaymentIntent -> captureTerminalPaymentIntent, triggered by an organizer
 * passing `cashAmountCents` alongside a card-present cart) charged Stripe's
 * `application_fee_amount` correctly on the CARD portion (tier-aware via `getPlatformFeeRate`,
 * not hardcoded — this file's card leg never had the posPaymentController-shaped bug), but the
 * CASH portion of the split was never charged any commission at all, on any path, ever —
 * nothing in captureTerminalPaymentIntent touched `Organizer.cashFeeBalance`, the mechanism
 * every other cash path (this same file's own `processCashSaleCore`, posPaymentController's
 * split-tender path, reservationController's RECORD mode) uses to collect commission on money
 * Stripe never sees.
 *
 * Fixed by reading `isSplitPayment` / `cashAmountCents` off the CAPTURED PaymentIntent's own
 * metadata (set at creation time in createTerminalPaymentIntent) and routing the cash portion
 * through the SAME shared, tier-aware resolvers services/cashFeeService.ts already established
 * as the precedent: `resolveCashCommissionRate` + `cashCommissionOn` + `accrueCashFeeBalance`.
 *
 * These tests assert the money on a TEAMS organizer (8% contractual rate), not the code shape:
 *   - a $100 cart split 50/50 cash/card accrues 8% of the $50 cash portion ($4.00) to
 *     `Organizer.cashFeeBalance` — NOT $0.00
 *   - the card leg's Stripe `application_fee_amount` is unaffected by this fix (still 8% of the
 *     $50 card portion, $4.00 — confirms the fix didn't touch the already-correct card math)
 *   - a non-split (card-only) Terminal capture accrues nothing to `cashFeeBalance` (control)
 *
 * MOCKING NOTES: terminalController.ts pulls in Stripe, eBay/Shopify/FB hooks, marketplace
 * stock sync and the collusion signal recorder at import time — none of them are on the
 * commission-calculation path this suite is verifying, so all are mocked exactly as
 * __tests__/posSplitPaymentFee.test.ts and __tests__/cashSaleFee.test.ts (the sibling fixes'
 * precedent tests) mock their equivalents. `sellItemUnits` (itemStockService) is left real
 * (pure DB read/write, no external calls), matching those suites' convention.
 */

import { prisma } from '../lib/prisma';

// ── Mocks (hoisted by ts-jest above these declarations — `var`, not `const`, deliberately) ──
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

// ── Imports AFTER the mocks ───────────────────────────────────────────────────────────────
import {
  createTerminalPaymentIntent,
  captureTerminalPaymentIntent,
} from '../controllers/terminalController';

const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('Terminal split cash+card commission — cash-half accrual', () => {
  // Root cause of a false-failure found 2026-08-24: mockPaymentIntentCreate/mockPaymentIntentCapture
  // are module-level `var` mocks shared across both `it()` blocks below with no reset between them.
  // The second test hardcodes `mockPaymentIntentCreate.mock.calls[0][0]`, which — without this
  // clear — still points at the FIRST test's call object (isSplitPayment: 'true') instead of its
  // own (index 1). clearAllMocks() resets call/instance history only, not mockResolvedValue
  // implementations set in the jest.mock() factories above, so those stay intact.
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** Build an isolated TEAMS organizer + PUBLISHED sale + AVAILABLE item. */
  const seed = async (key: string, price: number) => {
    const orgUser = await prisma.user.create({
      data: {
        id: `terminal-split-org-user-${key}`,
        email: `terminal-split-org-${key}@findasale.test`,
        name: `Terminal Split Organizer ${key}`,
        password: 'hashed_password',
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
      },
    });
    const organizer = await prisma.organizer.create({
      data: {
        userId: orgUser.id,
        businessName: `Terminal Split Estate Sales ${key}`,
        address: '219 E Michigan Ave, Paw Paw, MI 49079',
        subscriptionTier: 'TEAMS',
        stripeConnectId: `acct_terminalsplit${key}`,
        cashFeeBalance: 0,
      },
    });
    const sale = await prisma.sale.create({
      data: {
        organizerId: organizer.id,
        title: `Terminal Split Sale ${key}`,
        description: 'Terminal split-payment commission fixture',
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
        title: `Terminal Split Item ${key}`,
        description: 'Fixture',
        price,
        status: 'AVAILABLE',
        // Schema default is 'DRAFT' (not null) — createTerminalPaymentIntent's validation
        // (`draftStatus !== null && draftStatus !== 'PUBLISHED'`) would 400 a DRAFT item.
        draftStatus: 'PUBLISHED',
        category: 'Furniture',
        embedding: [], // NOT NULL, no DB default (migration 20260307153530 drops it)
      },
    });
    return { orgUser, organizer, sale, item };
  };

  beforeAll(() => {
    // Ensure the live/organizer-account path runs (not the simulated-mode shortcut).
    delete process.env.STRIPE_TERMINAL_SIMULATED;
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_terminal_split';
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accrues TEAMS 8% on the cash half of a split terminal tender (was $0 before the fix)', async () => {
    const { orgUser, organizer, item } = await seed('teams', 100);

    mockPaymentIntentCreate.mockResolvedValueOnce({
      id: 'pi_terminal_split_teams',
      client_secret: 'secret_terminal_split_teams',
    });

    // $100 item, $50 cash / $50 card split.
    const createReq: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'] },
      body: {
        items: [{ itemId: item.id, amount: 100 }],
        cashAmountCents: 5000,
      },
    };
    const createRes = makeMockRes();
    await createTerminalPaymentIntent(createReq, createRes);

    expect(createRes.json).toHaveBeenCalled();
    const createBody = createRes.json.mock.calls[0][0];
    const paymentIntentId: string = createBody.paymentIntentId;
    expect(paymentIntentId).toBe('pi_terminal_split_teams');

    // THE CARD LEG (unaffected by this fix — confirms the fix didn't disturb the already-
    // correct math): application_fee_amount is 8% of the $50 card portion ($4.00 = 400 cents).
    const piParams = mockPaymentIntentCreate.mock.calls[0][0];
    expect(piParams.amount).toBe(5000); // card-only PI amount: $50
    expect(piParams.application_fee_amount).toBe(400);
    expect(piParams.metadata.isSplitPayment).toBe('true');
    expect(piParams.metadata.cashAmountCents).toBe('5000');
    expect(piParams.metadata.cardAmountCents).toBe('5000');

    // Capture: echo back the SAME metadata createTerminalPaymentIntent actually generated,
    // so this test exercises the real production metadata shape (not a hand-picked fixture)
    // through the cash-commission read added by this fix.
    mockPaymentIntentCapture.mockResolvedValueOnce({
      id: paymentIntentId,
      status: 'succeeded',
      metadata: piParams.metadata,
    });

    const captureReq: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'] },
      body: { paymentIntentId },
    };
    const captureRes = makeMockRes();
    await captureTerminalPaymentIntent(captureReq, captureRes);

    expect(captureRes.status).not.toHaveBeenCalledWith(500);
    expect(captureRes.json.mock.calls[0][0].status).toBe('PAID');

    // THE CASH-HALF LEDGER: the organizer now owes 8% of the $50 cash portion ($4.00) against
    // their next Stripe payout — before this fix it was exactly $0.00, every time.
    const organizerAfter = await prisma.organizer.findUnique({ where: { id: organizer.id } });
    expect(organizerAfter!.cashFeeBalance).toBeCloseTo(4, 2);
    expect(organizerAfter!.cashFeeBalanceUpdatedAt).not.toBeNull();

    // Item was fully sold out (single unit) — captured normally despite the added commission
    // logic running in between.
    const itemAfter = await prisma.item.findUnique({ where: { id: item.id } });
    expect(itemAfter!.status).toBe('SOLD');
  });

  it('a non-split (card-only) Terminal capture accrues nothing to cashFeeBalance (control)', async () => {
    const { orgUser, organizer, item } = await seed('teams-nosplit', 100);

    mockPaymentIntentCreate.mockResolvedValueOnce({
      id: 'pi_terminal_nosplit_teams',
      client_secret: 'secret_terminal_nosplit_teams',
    });

    const createReq: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'] },
      body: {
        items: [{ itemId: item.id, amount: 100 }],
        // No cashAmountCents — full card payment.
      },
    };
    const createRes = makeMockRes();
    await createTerminalPaymentIntent(createReq, createRes);

    const createBody = createRes.json.mock.calls[0][0];
    const paymentIntentId: string = createBody.paymentIntentId;
    const piParams = mockPaymentIntentCreate.mock.calls[0][0];
    expect(piParams.metadata.isSplitPayment).toBeUndefined();

    mockPaymentIntentCapture.mockResolvedValueOnce({
      id: paymentIntentId,
      status: 'succeeded',
      metadata: piParams.metadata,
    });

    const captureReq: any = {
      user: { id: orgUser.id, role: 'ORGANIZER', roles: ['ORGANIZER'] },
      body: { paymentIntentId },
    };
    const captureRes = makeMockRes();
    await captureTerminalPaymentIntent(captureReq, captureRes);

    expect(captureRes.json.mock.calls[0][0].status).toBe('PAID');

    const organizerAfter = await prisma.organizer.findUnique({ where: { id: organizer.id } });
    expect(organizerAfter!.cashFeeBalance).toBeCloseTo(0, 2);
  });
});
