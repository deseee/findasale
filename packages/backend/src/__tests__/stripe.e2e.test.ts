/**
 * RUNNER CONVERSION NOTE (2026-08-16) -- read before editing.
 *
 * This file was STRUCTURALLY DEAD from the day it was written until 2026-08-16. It had never
 * executed even once. Two independent reasons:
 *   1. packages/backend/package.json sets jest.testMatch = ["**\/__tests__/**\/*.test.ts"].
 *      This file was named `stripe.e2e.ts` -- no `.test.ts` suffix -- so jest never collected it.
 *   2. It imported `describe/it/expect/vi` from `vitest`, which is not a dependency of this
 *      repo at all. The runner is ts-jest. That import would have thrown on first execution.
 *
 * Fixed by renaming to `stripe.e2e.test.ts` and converting the vitest API to Jest:
 *   - the `from 'vitest'` import removed (jest globals are ambient, typed by @types/jest)
 *   - `vi.` -> `jest.`
 *   - `vi.hoisted(() => X)` -> plain `var` declaration. Jest has no `hoisted`; `var` (not `const`)
 *     is deliberate -- ts-jest hoists `jest.mock()` above these declarations, and `var` yields
 *     `undefined` rather than a TDZ ReferenceError if a mock factory is evaluated early.
 *   - `import { prisma } from '../index'` -> `'../lib/prisma'`. `../index` is the Express entry
 *     point: importing it boots the HTTP server, Socket.io, Redis, Sentry and ~80 cron jobs.
 *     index.ts:291 just re-exports the same singleton from lib/prisma, so this is the identical
 *     object without the server boot.
 *
 * STATUS UPDATE 2026-08-17: the conversion above is no longer unverified. This suite has been
 * executed against a real Postgres 16.13 with all 373 migrations applied. The two auction-fee
 * tests were failing on a real product bug rather than a test defect: createPaymentIntent added
 * the 5% auction buyer premium into the charge total and then added it AGAIN, so an auction
 * buyer was charged a 10% premium. That bug is now FIXED in
 * controllers/stripeController.ts (see the BUYER-PREMIUM DOUBLE-COUNT FIX comment there), and
 * the two assertions have been rewritten -- NOT to match the controller's new output, but from
 * the documented fee model; the derivation is spelled out above the auction describe block
 * below. With the fix in, this suite is folded back into the BLOCKING "Backend tests" step in
 * .github/workflows/ci-typecheck.yml.
 */
/**
 * E2E Tests — Stripe Connect Express Onboarding + Fee Capture
 *
 * Covers issue #3 (beta-blocker):
 *   - createConnectAccount: new account creation, incomplete-onboarding retry,
 *     login link for fully-onboarded account, 403 for non-organizer
 *   - createPaymentIntent: 10% platform fee on regular items, 5% buyer premium on auction items,
 *     PENDING Purchase DB record, correct response shape, 400 guard rails
 *   - webhookHandler: payment_intent.succeeded → Purchase PAID + Item SOLD + receipt email
 *   - webhookHandler: payment_intent.payment_failed → Purchase FAILED
 *   - webhookHandler: invalid signature → 400
 *   - Unhandled event types acknowledged without crashing
 *
 * ⚠️  Missing webhook handlers (document before launch):
 *   - charge.refunded       → sync Purchase to REFUNDED when refund is Stripe-initiated
 *   - transfer.created      → confirm organizer payout landed (audit trail)
 *   - account.updated       → react to Connect account status changes (deauth, restricted)
 *
 * Manual step required before closing issue #3:
 *   Run against staging with test card 4242 4242 4242 4242, confirm in Stripe dashboard
 *   that (a) the platform fee is captured and (b) the organizer receives the net payout.
 */

import { prisma } from '../lib/prisma';

// ── Stripe mock ───────────────────────────────────────────────────────────────
// jest.hoisted ensures mock fn references are available when jest.mock factory runs
var mockAccountsCreate         = jest.fn();
var mockAccountLinksCreate     = jest.fn();
var mockLoginLinkCreate        = jest.fn();
var mockPaymentIntentsCreate   = jest.fn();
var mockPaymentIntentsRetrieve = jest.fn();
var mockWebhooksConstruct      = jest.fn();
var mockRefundsCreate          = jest.fn();

jest.mock('../utils/stripe', () => ({
  getStripe: jest.fn(() => ({
    accounts: {
      create: mockAccountsCreate,
      createLoginLink: mockLoginLinkCreate,
    },
    accountLinks: { create: mockAccountLinksCreate },
    paymentIntents: {
      create: mockPaymentIntentsCreate,
      retrieve: mockPaymentIntentsRetrieve,
    },
    webhooks: { constructEvent: mockWebhooksConstruct },
    refunds: { create: mockRefundsCreate },
  })),
  default: jest.fn(),
}));

// ── Receipt-email mock ────────────────────────────────────────────────────────
// RAIL CORRECTION (2026-08-17): this mocked `resend` directly, but stripeController's
// sendReceiptEmail (line 225) calls `transactionalEmailService.emails.send(...)`. Mocking
// `resend` intercepted nothing the code under test calls, so mockResendSend was never
// invoked. Mock the service the controller actually uses -- same { from, to, subject, html }
// payload shape, so the assertions below are unchanged.
var mockResendSend = jest.fn().mockResolvedValue({ id: 'mock-receipt-id', error: null });

jest.mock('../lib/transactionalEmailService', () => ({
  transactionalEmailService: {
    emails: { send: mockResendSend },
  },
}));

// ── Import controllers AFTER mocks are hoisted ────────────────────────────────
import {
  createConnectAccount,
  createPaymentIntent,
  webhookHandler,
} from '../controllers/stripeController';
import { getEarningsBreakdown } from '../controllers/payoutController';
import { saleCreateSchema, saleUpdateSchema } from '../controllers/saleController';
import {
  AUCTION_BUYER_PREMIUM_RATE,
  calculateApplicationFee,
  formatBuyerPremiumRate,
  getPlatformFeeRate,
  isAuctionListing,
  resolveOrganizerFeeReport,
  snapshotForCommissionOnly,
  snapshotFromBreakdown,
} from '../utils/feeCalculator';

/**
 * The smallest body saleCreateSchema accepts. Used only to prove that the SAME body fails the
 * moment `buyersPremiumPct` is added — an assertion about that one field, with everything else
 * held constant, rather than about the schema in general.
 */
const VALID_SALE_BODY = {
  title: 'Schema fixture sale',
  startDate: new Date(Date.now() + 86400000).toISOString(),
  endDate: new Date(Date.now() + 172800000).toISOString(),
};

// ── Test helpers ──────────────────────────────────────────────────────────────
const makeMockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  res.send   = jest.fn().mockReturnValue(res);
  return res;
};

// ─────────────────────────────────────────────────────────────────────────────

// NOT an 'acct_test_' prefix. stripeController.ts:696 gates Connect routing on
// `stripeConnectId && !stripeConnectId.startsWith('acct_test_')` -- a deliberate guard so
// obviously-fake ids never route a live charge. The original 'acct_test_stripe_e2e' tripped
// that guard, so createPaymentIntent took the NON-Connect branch and emitted a PaymentIntent
// with no application_fee_amount and no transfer_data at all. Every fee assertion in this
// file was checking a code path the fixture had switched off.
const STRIPE_CONNECT_ID = 'acct_e2estripeconnect';

describe('Stripe Connect + Fee Capture E2E', () => {
  let testOrganizerUser: any;
  let testOrganizer: any;
  let testShopper: any;
  let testSale: any;
  let testAuctionSale: any;
  let testItem: any;
  let testAuctionItem: any;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY     = 'sk_test_fake_stripe_e2e';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_stripe_e2e';
    process.env.SMTP_USERNAME        = 'test_smtp_user_stripe_e2e';
    process.env.SES_FROM_EMAIL     = 'receipts@finda.sale';
    process.env.FRONTEND_URL          = 'http://localhost:3000';

    // Organizer user (User must exist before Organizer — FK constraint)
    testOrganizerUser = await prisma.user.create({
      data: {
        id:       'test-organizer-user-stripe-e2e',
        email:    'organizer-stripe-e2e@findasale.test',
        name:     'Stripe E2E Organizer',
        password: 'hashed_password',
        role:     'ORGANIZER',
      },
    });

    // Organizer profile with a pre-set Connect ID (simulates fully-onboarded state)
    testOrganizer = await prisma.organizer.create({
      data: {
        businessName:   'Stripe E2E Estate Sales',
        phone:          '5551110001',
        address:        '100 Test Ave',
        userId:         testOrganizerUser.id,
        stripeConnectId: STRIPE_CONNECT_ID,
      },
    });

    // Shopper user
    testShopper = await prisma.user.create({
      data: {
        id:       'test-shopper-stripe-e2e',
        email:    'shopper-stripe-e2e@findasale.test',
        name:     'Stripe E2E Shopper',
        password: 'hashed_password',
        role:     'USER',
      },
    });

    const now      = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dayAfter = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Regular sale (isAuctionSale = false → 10% platform fee, buyer pays item price only)
    testSale = await prisma.sale.create({
      data: {
        title:        'Stripe E2E Regular Sale',
        description:  'Created by stripe.e2e.ts — safe to delete',
        address:      '100 Test Ave',
        city:         'Springfield',
        state:        'MI',
        zip:          '49503',
        lat:          42.9629,   // schema field is `lat`, not `latitude`
        lng:          -85.6789,  // schema field is `lng`, not `longitude`
        startDate:    tomorrow,
        endDate:      dayAfter,
        status:       'PUBLISHED',
        isAuctionSale: false,
        organizerId:  testOrganizer.id,
      },
    });

    // Auction sale (isAuctionSale = true → buyer pays winning bid + one 5% buyer premium)
    testAuctionSale = await prisma.sale.create({
      data: {
        title:        'Stripe E2E Auction Sale',
        description:  'Created by stripe.e2e.ts — safe to delete',
        address:      '100 Test Ave',
        city:         'Springfield',
        state:        'MI',
        zip:          '49503',
        lat:          42.9629,
        lng:          -85.6789,
        startDate:    tomorrow,
        endDate:      dayAfter,
        status:       'PUBLISHED',
        isAuctionSale: true,
        organizerId:  testOrganizer.id,
      },
    });

    // Regular item ($100.00)
    testItem = await prisma.item.create({
      data: {
        embedding: [], // NOT NULL, no DB default (migration 20260307153530 drops it) -- Prisma omits unspecified scalar lists
        title:  'Vintage Lamp',
        price:  100.00,
        status: 'AVAILABLE',
        saleId: testSale.id,
      },
    });

    // Auction item (currentBid $200.00, auctionStartPrice $50.00)
    testAuctionItem = await prisma.item.create({
      data: {
        embedding: [], // NOT NULL, no DB default (migration 20260307153530 drops it) -- Prisma omits unspecified scalar lists
        title:             'Antique Clock',
        auctionStartPrice: 50.00,
        currentBid:        200.00,
        status:            'AVAILABLE',
        saleId:            testAuctionSale.id,
      },
    });

    // Fee-precedence fix (2026-08-22): stripeController.createPaymentIntent now always uses
    // getPlatformFeeRate(tier) -- a wildcard FeeStructure row can no longer override it (see
    // utils/feeCalculator.ts / services/cashFeeService.ts for the full incident writeup).
    // Cleared anyway as a defensive no-op in case a stray row from another suite is present.
    await prisma.feeStructure.deleteMany({ where: { listingType: '*' } }).catch(() => {});

    console.log('✓ Stripe E2E test data created');
  });

  afterAll(async () => {
    // Delete in FK-safe order: purchases → items → sales → organizer → users
    await prisma.purchase.deleteMany({ where: { userId: testShopper?.id } }).catch(() => {});
    if (testItem)        await prisma.item.delete({ where: { id: testItem.id } }).catch(() => {});
    if (testAuctionItem) await prisma.item.delete({ where: { id: testAuctionItem.id } }).catch(() => {});
    if (testSale)        await prisma.sale.delete({ where: { id: testSale.id } }).catch(() => {});
    if (testAuctionSale) await prisma.sale.delete({ where: { id: testAuctionSale.id } }).catch(() => {});
    if (testOrganizer)   await prisma.organizer.delete({ where: { id: testOrganizer.id } }).catch(() => {});
    if (testOrganizerUser) await prisma.user.delete({ where: { id: testOrganizerUser.id } }).catch(() => {});
    if (testShopper)     await prisma.user.delete({ where: { id: testShopper.id } }).catch(() => {});

    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.SMTP_USERNAME;
    delete process.env.SES_FROM_EMAIL;
    delete process.env.FRONTEND_URL;
    console.log('✓ Stripe E2E test data cleaned up');
  });

  // ── createConnectAccount — onboarding ────────────────────────────────────────

  describe('createConnectAccount — onboarding', () => {
    it('should return a login link for an already fully-onboarded organizer', async () => {
      mockLoginLinkCreate.mockResolvedValueOnce({ url: 'https://connect.stripe.com/login/test' });

      const req: any = {
        user: { id: testOrganizerUser.id, role: 'ORGANIZER', email: testOrganizerUser.email },
      };
      const res = makeMockRes();

      await createConnectAccount(req, res);

      expect(mockLoginLinkCreate).toHaveBeenCalledWith(STRIPE_CONNECT_ID);
      expect(res.json).toHaveBeenCalledWith({ url: 'https://connect.stripe.com/login/test' });
      console.log('✓ Login link returned for fully-onboarded organizer');
    });

    it('should return an account link when onboarding is incomplete', async () => {
      // Stripe throws when login link is requested for an incomplete account
      mockLoginLinkCreate.mockRejectedValueOnce(new Error('not completed onboarding'));
      mockAccountLinksCreate.mockResolvedValueOnce({ url: 'https://connect.stripe.com/setup/resume' });

      const req: any = {
        user: { id: testOrganizerUser.id, role: 'ORGANIZER', email: testOrganizerUser.email },
      };
      const res = makeMockRes();

      await createConnectAccount(req, res);

      expect(mockAccountLinksCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          account: STRIPE_CONNECT_ID,
          type:    'account_onboarding',
        })
      );
      expect(res.json).toHaveBeenCalledWith({ url: 'https://connect.stripe.com/setup/resume' });
      console.log('✓ Account link returned for incomplete onboarding');
    });

    it('should create a new Connect Express account and persist the ID for a fresh organizer', async () => {
      // Fresh organizer — no stripeConnectId yet
      const freshUser = await prisma.user.create({
        data: {
          id:       'test-fresh-organizer-stripe-e2e',
          email:    'fresh-organizer-stripe-e2e@findasale.test',
          name:     'Fresh Organizer',
          password: 'hashed_password',
          role:     'ORGANIZER',
        },
      });
      const freshOrganizer = await prisma.organizer.create({
        data: {
          businessName:    'Fresh Test Sales',
          phone:           '5552220002',
          address:         '200 New St',
          userId:          freshUser.id,
          stripeConnectId: null,
        },
      });

      mockAccountsCreate.mockResolvedValueOnce({ id: 'acct_new_e2e_fresh' });
      mockAccountLinksCreate.mockResolvedValueOnce({ url: 'https://connect.stripe.com/setup/new' });

      const req: any = {
        user: { id: freshUser.id, role: 'ORGANIZER', email: freshUser.email },
      };
      const res = makeMockRes();

      await createConnectAccount(req, res);

      // Stripe account created with correct type and email
      expect(mockAccountsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'express', email: freshUser.email })
      );

      // Connect ID was persisted to the DB
      const updated = await prisma.organizer.findUnique({ where: { id: freshOrganizer.id } });
      expect(updated?.stripeConnectId).toBe('acct_new_e2e_fresh');

      expect(res.json).toHaveBeenCalledWith({ url: 'https://connect.stripe.com/setup/new' });
      console.log('✓ New Connect account created and stripeConnectId persisted to DB');

      // Clean up fresh organizer (order matters for FK)
      await prisma.organizer.delete({ where: { id: freshOrganizer.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: freshUser.id } }).catch(() => {});
    });

    it('should return 403 when called by a non-organizer', async () => {
      const req: any = { user: { id: testShopper.id, role: 'USER' } };
      const res = makeMockRes();

      await createConnectAccount(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      console.log('✓ 403 returned for non-organizer user');
    });
  });

  // ── createPaymentIntent — regular sale (10% platform fee) ───────────────────────────

  describe('createPaymentIntent — regular sale (5% fee)', () => {
    const PRICE          = 100.00;
    const EXPECTED_CENTS = Math.round(PRICE * 100);          // 10000
    // 10%, not 5%. STACK.md 'Fee Structure' locks the SIMPLE-tier default platform fee at
    // 10% (8% for PRO/TEAMS), and utils/feeCalculator.getPlatformFeeRate returns 0.10 for
    // the SIMPLE tier this fixture's organizer is on. The 0.05 here was a stale figure that
    // never matched shipped behaviour -- this file had never run.
    const EXPECTED_FEE   = Math.round(PRICE * 100 * 0.10);   // 1000 (10%)

    let capturedPiArgs: any;
    let capturedRes: any;

    beforeAll(async () => {
      mockPaymentIntentsCreate.mockResolvedValueOnce({
        id:            'pi_test_regular_e2e',
        client_secret: 'pi_test_regular_e2e_secret',
      });

      const req: any = {
        user: { id: testShopper.id, role: 'USER' },
        body: { itemId: testItem.id },
      };
      capturedRes = makeMockRes();
      await createPaymentIntent(req, capturedRes);
      capturedPiArgs = mockPaymentIntentsCreate.mock.calls.at(-1)[0];
    });

    afterAll(async () => {
      await prisma.purchase.deleteMany({
        where: { stripePaymentIntentId: 'pi_test_regular_e2e' },
      }).catch(() => {});
    });

    it('should create a PaymentIntent with the correct amount and 5% platform fee', () => {
      expect(capturedPiArgs.amount).toBe(EXPECTED_CENTS);
      expect(capturedPiArgs.currency).toBe('usd');
      expect(capturedPiArgs.application_fee_amount).toBe(EXPECTED_FEE);
      expect(capturedPiArgs.transfer_data).toEqual({ destination: STRIPE_CONNECT_ID });
      console.log(`✓ PI created: $${PRICE} item → $${EXPECTED_FEE / 100} fee (10%)`);
    });

    it('should create a PENDING Purchase record in the DB', async () => {
      const purchase = await prisma.purchase.findFirst({
        where: {
          userId:               testShopper.id,
          itemId:               testItem.id,
          stripePaymentIntentId: 'pi_test_regular_e2e',
        },
      });
      expect(purchase).not.toBeNull();
      expect(purchase?.status).toBe('PENDING');
      expect(parseFloat(purchase!.platformFeeAmount!.toString())).toBeCloseTo(EXPECTED_FEE / 100, 2);
      expect(parseFloat(purchase!.amount.toString())).toBeCloseTo(PRICE, 2);
      console.log(`✓ Purchase record: status=PENDING, platformFeeAmount=$${purchase?.platformFeeAmount}`);
    });

    it('should return clientSecret, purchaseId, platformFee, and totalAmount', () => {
      const payload = capturedRes.json.mock.calls[0][0];
      expect(payload.clientSecret).toBe('pi_test_regular_e2e_secret');
      expect(payload.platformFee).toBe(EXPECTED_FEE / 100);
      expect(payload.totalAmount).toBe(PRICE);
      expect(payload.purchaseId).toBeDefined();
      console.log('✓ Response shape correct: clientSecret, purchaseId, platformFee, totalAmount');
    });

    it('should return 400 when the organizer has no Stripe Connect account', async () => {
      // Temporarily remove the Connect ID
      await prisma.organizer.update({
        where: { id: testOrganizer.id },
        data:  { stripeConnectId: null },
      });

      const req: any = {
        user: { id: testShopper.id, role: 'USER' },
        body: { itemId: testItem.id },
      };
      const res = makeMockRes();

      await createPaymentIntent(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      console.log('✓ 400 returned when organizer lacks Stripe Connect account');

      // Restore
      await prisma.organizer.update({
        where: { id: testOrganizer.id },
        data:  { stripeConnectId: STRIPE_CONNECT_ID },
      });
    });
  });

  // ── createPaymentIntent — auction sale (buyer premium + organizer commission) ───────────
  //
  // THE FEE MODEL (Patrick ruling, 2026-08-17 — AUTHORITATIVE). TWO SEPARATE FEES, and on an
  // auction BOTH apply:
  //   1. Buyer premium — 5% of the hammer price, charged ON TOP of the bid to the WINNER.
  //   2. Organizer commission — 10% SIMPLE / 8% PRO+TEAMS of the hammer price, charged to the
  //      ORGANIZER out of their payout. Applies to EVERY sale, auctions included.
  // Stripe's application_fee_amount is the SUM:
  //
  //   | Scenario                  | Buyer charged | application_fee_amount | Organizer nets |
  //   |---------------------------|---------------|------------------------|----------------|
  //   | $200 regular, SIMPLE      | $200.00       | $20.00                 | $180.00        |
  //   | $200 regular, PRO         | $200.00       | $16.00                 | $184.00        |
  //   | $200 auction win, SIMPLE  | $210.00       | $30.00 ($10 + $20)     | $180.00        |
  //   | $200 auction win, PRO     | $210.00       | $26.00 ($10 + $16)     | $184.00        |
  //
  // WHAT WAS ASSERTED HERE BEFORE, and why it went: an earlier pass the SAME DAY encoded an
  // "auction carve-out" — application_fee_amount === the 5% premium alone, organizer pays no
  // commission on an auction. Patrick ruled that wrong and it is reversed. If these numbers
  // ever drop back to the bare premium (1000 on a $200 win), the carve-out has been
  // reintroduced — do not "fix" the test to match.
  //
  // The BUYER-CHARGE side is separately settled and must NOT change: the buyer pays the hammer
  // price plus ONE 5% premium ($210.00 on a $200 win), per
  // claude_docs/architecture/AUCTION_WIN_SPEC.md L245-249, frontend CheckoutModal.tsx, and the
  // CheckoutEvidence consent string persisted for chargeback defense.
  describe('createPaymentIntent — auction sale (5% buyer premium)', () => {
    const BUYER_PREMIUM_RATE      = AUCTION_BUYER_PREMIUM_RATE;                           // 0.05
    const SIMPLE_RATE             = getPlatformFeeRate('SIMPLE');                          // 0.10
    const PRO_RATE                = getPlatformFeeRate('PRO');                             // 0.08
    const CURRENT_BID             = 200.00;
    const BID_PREMIUM             = Math.round(CURRENT_BID * 100 * BUYER_PREMIUM_RATE);   // 1000
    const BID_COMMISSION          = Math.round(CURRENT_BID * 100 * SIMPLE_RATE);          // 2000
    const BID_TOTAL               = Math.round(CURRENT_BID * 100) + BID_PREMIUM;          // 21000
    const AUCTION_APPLICATION_FEE = BID_PREMIUM + BID_COMMISSION;                          // 3000
    const PRO_APPLICATION_FEE     = BID_PREMIUM + Math.round(CURRENT_BID * 100 * PRO_RATE); // 2600
    const START_PRICE             = 50.00;
    const START_PREMIUM           = Math.round(START_PRICE * 100 * BUYER_PREMIUM_RATE);   // 250
    const START_COMMISSION        = Math.round(START_PRICE * 100 * SIMPLE_RATE);          // 500
    const START_TOTAL             = Math.round(START_PRICE * 100) + START_PREMIUM;        // 5250
    const START_APPLICATION_FEE   = START_PREMIUM + START_COMMISSION;                      // 750

    afterAll(async () => {
      await prisma.purchase.deleteMany({
        where: {
          stripePaymentIntentId: {
            in: ['pi_test_auction_e2e', 'pi_test_auction_fallback_e2e'],
          },
        },
      }).catch(() => {});
    });

    it('should charge the winning bid plus exactly ONE 5% buyer premium', async () => {
      mockPaymentIntentsCreate.mockResolvedValueOnce({
        id:            'pi_test_auction_e2e',
        client_secret: 'pi_test_auction_e2e_secret',
      });

      const req: any = {
        user: { id: testShopper.id, role: 'USER' },
        body: { itemId: testAuctionItem.id },
      };
      const res = makeMockRes();

      await createPaymentIntent(req, res);

      const args = mockPaymentIntentsCreate.mock.calls.at(-1)[0];
      // REGRESSION GUARD: the double-count bug produced 22000 here, against a $210.00 total
      // shown to the buyer in CheckoutModal. If this ever reads 22000 again, the premium is
      // being added twice — do not "fix" it by changing this number.
      expect(args.amount).toBe(BID_TOTAL);
      expect(args.amount).not.toBe(Math.round(CURRENT_BID * 100) + BID_PREMIUM * 2);
      // $30.00 = $10.00 buyer premium + $20.00 organizer commission. NOT the premium alone.
      expect(args.application_fee_amount).toBe(AUCTION_APPLICATION_FEE);
      expect(args.application_fee_amount).not.toBe(BID_PREMIUM); // carve-out regression guard
      // The organizer nets the same $180.00 they'd net on a $200 fixed-price sale — the point
      // of the ruling: an auction is not commission-exempt.
      expect(args.amount - args.application_fee_amount).toBe(
        Math.round(CURRENT_BID * 100) - BID_COMMISSION
      );
      console.log(`✓ Auction PI: $${CURRENT_BID} bid → $${BID_TOTAL / 100} charged (one 5% premium), $${AUCTION_APPLICATION_FEE / 100} application fee ($${BID_PREMIUM / 100} premium + $${BID_COMMISSION / 100} commission), organizer nets $${(args.amount - args.application_fee_amount) / 100}`);

      // The total the buyer is SHOWN must equal the total Stripe is asked to charge.
      // CheckoutModal.tsx:58 renders itemPrice + buyerPremium; the double-count bug
      // displayed $210.00 and charged $220.00.
      const payload = res.json.mock.calls[0][0];
      expect(payload.subtotal).toBe(CURRENT_BID);
      expect(payload.buyerPremiumRate).toBe(BUYER_PREMIUM_RATE);
      expect(payload.buyerPremiumAmount).toBe(BID_PREMIUM / 100);
      expect(payload.totalAmount).toBe(BID_TOTAL / 100);
      expect(payload.subtotal + payload.buyerPremiumAmount).toBe(payload.totalAmount);
      console.log(`✓ Displayed total matches charge: $${payload.subtotal} + $${payload.buyerPremiumAmount} = $${payload.totalAmount}`);
    });

    it('should fall back to auctionStartPrice when no currentBid exists', async () => {
      // Temporarily clear the current bid
      await prisma.item.update({
        where: { id: testAuctionItem.id },
        data:  { currentBid: null },
      });

      mockPaymentIntentsCreate.mockResolvedValueOnce({
        id:            'pi_test_auction_fallback_e2e',
        client_secret: 'pi_test_auction_fallback_e2e_secret',
      });

      const req: any = {
        user: { id: testShopper.id, role: 'USER' },
        body: { itemId: testAuctionItem.id },
      };
      const res = makeMockRes();

      await createPaymentIntent(req, res);

      const args = mockPaymentIntentsCreate.mock.calls.at(-1)[0];
      expect(args.amount).toBe(START_TOTAL);
      expect(args.application_fee_amount).toBe(START_APPLICATION_FEE);
      console.log(`✓ Fallback to auctionStartPrice: $${START_PRICE} → $${START_TOTAL / 100} charged, $${START_APPLICATION_FEE / 100} application fee ($${START_PREMIUM / 100} premium + $${START_COMMISSION / 100} commission)`);

      // Restore
      await prisma.item.update({
        where: { id: testAuctionItem.id },
        data:  { currentBid: CURRENT_BID },
      });
    });

    // SECURITY REGRESSION GUARD (VALID-STATE-ONLY-EXPOSURE), added 2026-08-17.
    // A live AUCTION lot must not be purchasable outright through this Buy-It-Now endpoint.
    // Before the gate in stripeController.ts, a live auction's item is still status
    // 'AVAILABLE', so nothing stopped any user -- or any guest with an email -- from POSTing
    // this route with the auction's itemId and taking the lot at `currentBid` + 5%, stranding
    // the real high bidder. The UI never offered this (pages/items/[id].tsx:975 puts "Buy It
    // Now" only in the non-auction branch); the endpoint did.
    //
    // NOTE ON THE FIXTURE: testAuctionItem above deliberately does NOT set listingType, so it
    // defaults to 'FIXED' and is treated as an auction only via `auctionStartPrice != null`
    // (stripeController's isAuctionItem). This test therefore needs its own item with an
    // explicit listingType 'AUCTION' -- which is what the gate keys on.
    it('should refuse an outright purchase of a live AUCTION lot (no Stripe call)', async () => {
      const liveLot = await prisma.item.create({
        data: {
          embedding:         [],
          title:             'Live Auction Lot — buy-it-now must be refused',
          listingType:       'AUCTION',
          auctionStartPrice: 10.00,
          currentBid:        25.00,
          auctionEndTime:    new Date(Date.now() + 60 * 60 * 1000), // still open
          auctionClosed:     false,
          status:            'AVAILABLE',
          saleId:            testAuctionSale.id,
        },
      });

      const callsBefore = mockPaymentIntentsCreate.mock.calls.length;

      const req: any = {
        user: { id: testShopper.id, role: 'USER' },
        body: { itemId: liveLot.id },
      };
      const res = makeMockRes();

      await createPaymentIntent(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      // No Stripe object may be created for a refused purchase, and no Purchase row.
      expect(mockPaymentIntentsCreate.mock.calls.length).toBe(callsBefore);
      const stranded = await prisma.purchase.findFirst({ where: { itemId: liveLot.id } });
      expect(stranded).toBeNull();
      console.log('✓ 403 on outright purchase of a live auction lot; no PaymentIntent, no Purchase row');

      await prisma.purchase.deleteMany({ where: { itemId: liveLot.id } }).catch(() => {});
      await prisma.item.delete({ where: { id: liveLot.id } }).catch(() => {});
    });

    it('should still refuse after the end time passes while auctionClosed is false (cron gap)', async () => {
      const endedNotClosed = await prisma.item.create({
        data: {
          embedding:         [],
          title:             'Ended-but-not-closed lot — cron gap',
          listingType:       'AUCTION',
          auctionStartPrice: 10.00,
          currentBid:        25.00,
          auctionEndTime:    new Date(Date.now() - 60 * 1000), // ended a minute ago
          auctionClosed:     false,                            // closing cron has not run yet
          status:            'AVAILABLE',
          saleId:            testAuctionSale.id,
        },
      });

      const req: any = {
        user: { id: testShopper.id, role: 'USER' },
        body: { itemId: endedNotClosed.id },
      };
      const res = makeMockRes();

      await createPaymentIntent(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      console.log('✓ 403 in the end-time-to-cron gap — the lot cannot be sniped before it closes');

      await prisma.purchase.deleteMany({ where: { itemId: endedNotClosed.id } }).catch(() => {});
      await prisma.item.delete({ where: { id: endedNotClosed.id } }).catch(() => {});
    });

    it('should charge a PRO organizer the same premium but only an 8% commission', async () => {
      await prisma.organizer.update({
        where: { id: testOrganizer.id },
        data:  { subscriptionTier: 'PRO' },
      });

      mockPaymentIntentsCreate.mockResolvedValueOnce({
        id:            'pi_test_auction_pro_e2e',
        client_secret: 'pi_test_auction_pro_e2e_secret',
      });

      const req: any = {
        user: { id: testShopper.id, role: 'USER' },
        body: { itemId: testAuctionItem.id },
      };
      const res = makeMockRes();

      await createPaymentIntent(req, res);

      const args = mockPaymentIntentsCreate.mock.calls.at(-1)[0];
      // The BUYER pays the same $210.00 regardless of the organizer's tier — the tier only
      // moves the organizer's commission, and with it the platform's total take.
      expect(args.amount).toBe(BID_TOTAL);
      expect(args.application_fee_amount).toBe(PRO_APPLICATION_FEE);            // 2600
      expect(args.amount - args.application_fee_amount).toBe(
        Math.round(CURRENT_BID * 100) - Math.round(CURRENT_BID * 100 * PRO_RATE)
      );                                                                        // 18400 = $184.00
      console.log(`✓ PRO auction: $${BID_TOTAL / 100} charged, $${PRO_APPLICATION_FEE / 100} application fee ($${BID_PREMIUM / 100} premium + $${Math.round(CURRENT_BID * 100 * PRO_RATE) / 100} commission), organizer nets $${(args.amount - args.application_fee_amount) / 100}`);

      await prisma.organizer.update({
        where: { id: testOrganizer.id },
        data:  { subscriptionTier: 'SIMPLE' },
      });
      await prisma.purchase.deleteMany({
        where: { stripePaymentIntentId: 'pi_test_auction_pro_e2e' },
      }).catch(() => {});
    });

    it('should charge the bid only under Sale.coversFee while the platform still collects both fees', async () => {
      // #402 "Cover the Fee" on an auction: the ORGANIZER absorbs the 5% premium instead of
      // the winner. The buyer's charge drops to the bid; the platform's take does NOT change.
      // $200 win / SIMPLE => buyer charged $200.00, application fee still $30.00, organizer
      // nets $170.00 (their $20.00 commission PLUS the $10.00 premium they absorbed).
      const coversFeeSale = await prisma.sale.create({
        data: {
          title:        'Stripe E2E Auction Sale — organizer covers the fee',
          description:  'Created by stripe.e2e.ts — safe to delete',
          address:      '100 Test Ave',
          city:         'Springfield',
          state:        'MI',
          zip:          '49503',
          lat:          42.9629,
          lng:          -85.6789,
          startDate:    new Date(Date.now() + 24 * 60 * 60 * 1000),
          endDate:      new Date(Date.now() + 48 * 60 * 60 * 1000),
          status:       'PUBLISHED',
          isAuctionSale: true,
          coversFee:    true,
          organizerId:  testOrganizer.id,
        },
      });
      const coversFeeLot = await prisma.item.create({
        data: {
          embedding:         [],
          title:             'Covered-premium lot',
          auctionStartPrice: 50.00,
          currentBid:        CURRENT_BID,
          status:            'AVAILABLE',
          saleId:            coversFeeSale.id,
        },
      });

      mockPaymentIntentsCreate.mockResolvedValueOnce({
        id:            'pi_test_auction_covers_fee_e2e',
        client_secret: 'pi_test_auction_covers_fee_e2e_secret',
      });

      const req: any = {
        user: { id: testShopper.id, role: 'USER' },
        body: { itemId: coversFeeLot.id },
      };
      const res = makeMockRes();

      await createPaymentIntent(req, res);

      const args = mockPaymentIntentsCreate.mock.calls.at(-1)[0];
      expect(args.amount).toBe(Math.round(CURRENT_BID * 100));                  // 20000, no premium
      expect(args.application_fee_amount).toBe(AUCTION_APPLICATION_FEE);        // 3000, unchanged
      expect(args.amount - args.application_fee_amount).toBe(17000);            // $170.00

      // The buyer must not be SHOWN a premium they are not being charged.
      const payload = res.json.mock.calls.at(-1)[0];
      expect(payload.buyerPremiumAmount).toBe(0);
      expect(payload.buyerPremiumRate).toBe(0);
      expect(payload.totalAmount).toBe(CURRENT_BID);
      console.log(`✓ coversFee auction: buyer charged $${payload.totalAmount} (no premium shown), application fee still $${AUCTION_APPLICATION_FEE / 100}, organizer nets $170.00`);

      await prisma.purchase.deleteMany({ where: { itemId: coversFeeLot.id } }).catch(() => {});
      await prisma.item.delete({ where: { id: coversFeeLot.id } }).catch(() => {});
      await prisma.sale.delete({ where: { id: coversFeeSale.id } }).catch(() => {});
    });
  });

  // ── webhookHandler — payment_intent.succeeded ─────────────────────────────

  describe('webhookHandler — payment_intent.succeeded', () => {
    const WEBHOOK_PI_ID = 'pi_webhook_succeeded_e2e';

    beforeAll(async () => {
      // Seed a PENDING purchase to be resolved by the webhook
      await prisma.purchase.create({
        data: {
          userId:                testShopper.id,
          itemId:                testItem.id,
          saleId:                testSale.id,
          amount:                100.00,
          platformFeeAmount:     5.00,
          stripePaymentIntentId: WEBHOOK_PI_ID,
          status:                'PENDING',
        },
      });

      mockResendSend.mockClear();

      // Fire the webhook
      mockWebhooksConstruct.mockReturnValueOnce({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id:       WEBHOOK_PI_ID,
            metadata: {
              itemId: testItem.id,
              saleId: testSale.id,
              userId: testShopper.id,
            },
          },
        },
      });

      const req: any = {
        headers: { 'stripe-signature': 'sig_test_succeeded' },
        body:    Buffer.from('{}'),
      };
      await webhookHandler(req, makeMockRes());
    });

    afterAll(async () => {
      await prisma.purchase.deleteMany({
        where: { stripePaymentIntentId: WEBHOOK_PI_ID },
      }).catch(() => {});
      // Item was marked SOLD by the webhook; restore for any subsequent tests
      await prisma.item.update({
        where: { id: testItem.id },
        data:  { status: 'AVAILABLE' },
      }).catch(() => {});
    });

    it('should update Purchase status to PAID', async () => {
      const purchase = await prisma.purchase.findFirst({
        where: { stripePaymentIntentId: WEBHOOK_PI_ID },
      });
      expect(purchase?.status).toBe('PAID');
      console.log('✓ Purchase status updated to PAID');
    });

    it('should update Item status to SOLD', async () => {
      const item = await prisma.item.findUnique({ where: { id: testItem.id } });
      expect(item?.status).toBe('SOLD');
      console.log('✓ Item status updated to SOLD');
    });

    it('should send a receipt email to the shopper via Resend', () => {
      expect(mockResendSend).toHaveBeenCalled();
      const emailPayload = mockResendSend.mock.calls[0][0];
      expect(emailPayload.to).toBe(testShopper.email);
      expect(emailPayload.subject).toContain(testItem.title);
      console.log(`✓ Receipt email sent to ${testShopper.email} for "${testItem.title}"`);
    });

    it('should return { received: true }', () => {
      // Verify the webhook handler's response contract by firing a second event
      mockWebhooksConstruct.mockReturnValueOnce({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_no_db_match', metadata: {} } },
      });
      const res = makeMockRes();
      const req: any = {
        headers: { 'stripe-signature': 'sig_test' },
        body:    Buffer.from('{}'),
      };
      return webhookHandler(req, res).then(() => {
        expect(res.json).toHaveBeenCalledWith({ received: true });
      });
    });
  });

  // ── webhookHandler — payment_intent.payment_failed ────────────────────────

  describe('webhookHandler — payment_intent.payment_failed', () => {
    const WEBHOOK_PI_ID = 'pi_webhook_failed_e2e';

    beforeAll(async () => {
      await prisma.purchase.create({
        data: {
          userId:                testShopper.id,
          itemId:                testAuctionItem.id,
          saleId:                testAuctionSale.id,
          amount:                200.00,
          platformFeeAmount:     14.00,
          stripePaymentIntentId: WEBHOOK_PI_ID,
          status:                'PENDING',
        },
      });
    });

    afterAll(async () => {
      await prisma.purchase.deleteMany({
        where: { stripePaymentIntentId: WEBHOOK_PI_ID },
      }).catch(() => {});
    });

    it('should update Purchase status to FAILED', async () => {
      mockWebhooksConstruct.mockReturnValueOnce({
        type: 'payment_intent.payment_failed',
        data: { object: { id: WEBHOOK_PI_ID } },
      });

      const req: any = {
        headers: { 'stripe-signature': 'sig_test_failed' },
        body:    Buffer.from('{}'),
      };
      const res = makeMockRes();

      await webhookHandler(req, res);

      const purchase = await prisma.purchase.findFirst({
        where: { stripePaymentIntentId: WEBHOOK_PI_ID },
      });
      expect(purchase?.status).toBe('FAILED');
      expect(res.json).toHaveBeenCalledWith({ received: true });
      console.log('✓ Purchase status updated to FAILED');
    });
  });

  // ── webhookHandler — invalid signature ────────────────────────────────────

  describe('webhookHandler — invalid signature', () => {
    it('should return 400 when Stripe signature verification fails', async () => {
      mockWebhooksConstruct.mockImplementationOnce(() => {
        throw new Error('Webhook signature verification failed');
      });

      const req: any = {
        headers: { 'stripe-signature': 'bad-sig' },
        body:    Buffer.from('{}'),
      };
      const res = makeMockRes();

      await webhookHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      console.log('✓ 400 returned for invalid webhook signature');
    });
  });

  // ── webhookHandler — unhandled event types ────────────────────────────────

  describe('webhookHandler — unhandled event types', () => {
    /**
     * ⚠️  These events reach the `default` branch and are only logged.
     *     Consider adding handlers before production launch:
     *
     *     charge.refunded     — update Purchase to REFUNDED if refund is Stripe-initiated
     *     transfer.created    — record payout confirmation for organizer audit trail
     *     account.updated     — respond to Connect account deauthorization or restrictions
     */
    it('should return { received: true } without crashing for an unhandled event type', async () => {
      mockWebhooksConstruct.mockReturnValueOnce({
        type: 'charge.refunded',
        data: { object: { id: 'ch_test_unhandled' } },
      });

      const req: any = {
        headers: { 'stripe-signature': 'sig_test_unhandled' },
        body:    Buffer.from('{}'),
      };
      const res = makeMockRes();

      await webhookHandler(req, res);

      expect(res.json).toHaveBeenCalledWith({ received: true });
      console.log('✓ Unhandled event type (charge.refunded) acknowledged without crashing');
    });
  });

  // ── organizer-facing fee reporting — commission only, premium stripped ───────────────────
  //
  // WHAT THE ORGANIZER IS TOLD THEY PAID is their COMMISSION ONLY — 10% SIMPLE / 8% PRO+TEAMS
  // of the hammer or list price, on an auction exactly as on any other sale. The auction
  // buyer's 5% premium came out of the WINNER's pocket, so it appears in neither the reported
  // revenue nor the reported fee. A $200 winning bid reports $200.00 gross / $20.00 fee /
  // $180.00 net at SIMPLE — identical to a $200 fixed-price sale.
  //
  // WHY NOT JUST READ Purchase.platformFeeAmount: that column stores the real Stripe
  // application_fee_amount, which is the COMBINED premium + commission ($30.00 on a $200 win).
  // Reporting it verbatim would tell the organizer they paid a $10 premium they never paid.
  // An earlier pass the SAME DAY did exactly that, on the (wrong) theory that the premium was
  // the entire platform take and the organizer owed no commission. Reversed by Patrick's
  // ruling; utils/feeCalculator.resolveOrganizerFeeReport recomputes from the hammer price.
  //
  // THE ONE EXCEPTION — Sale.coversFee on an auction: the buyer was charged the bid only and
  // the ORGANIZER absorbed the premium, so there it DOES belong on their fee line ($30.00 on a
  // $200 win, net $170.00).
  //
  // Production impact at the time of the fix: ZERO. A direct query against the Railway
  // production DB (2026-08-17) found 0 PAID purchases joined to an auction item (1 FAILED), all
  // 4 AUCTION items named "ZZTEST ... delete after 2026-08-08", and 3 Bid rows platform-wide.
  // No organizer was ever shown a wrong number and no one was under-charged; this is a
  // forward-looking correctness fix.
  // ── THE BUYER PREMIUM IS A PLATFORM RATE, NOT AN ORGANIZER SETTING ───────────────────
  //
  // WHAT THESE COVER: `Sale.buyersPremiumPct` (schema.prisma) was briefly an organizer-settable
  // 0-50% control, and for part of 2026-08-17 the charge paths honoured it. Reversed the same
  // day by Patrick's ruling: the premium goes into Stripe's `application_fee_amount` — it is
  // FindA.Sale's own revenue — so an organizer setting it was an organizer setting the
  // platform's income. 0% earned FindA.Sale nothing on that auction; 50% gouged shoppers in
  // FindA.Sale's name.
  //
  // The column still EXISTS (dropping a column is destructive and is queued separately) and can
  // still hold a value on a legacy row or via a direct DB write. So the tests below deliberately
  // WRITE a value into it and assert the charge, the disclosure and the consent record all
  // ignore it completely. "Nothing reads this column" is a claim that needs a test, not a
  // comment. Production blast radius when the control was retired: 21,840 sales, ZERO with a
  // non-null value (verified by direct query, 2026-08-17).
  describe('buyer premium is platform-locked (Sale.buyersPremiumPct is retired and inert)', () => {
    const CONFIGURED_BID = 200.00;

    /** Build a throwaway auction sale + lot, optionally poisoning the retired column. */
    const makeConfiguredLot = async (opts: {
      buyersPremiumPct: number | null;
      coversFee?: boolean;
      currentBid?: number;
      titleSuffix: string;
    }) => {
      const sale = await prisma.sale.create({
        data: {
          title: `Stripe E2E premium ${opts.titleSuffix}`,
          description: 'Created by stripe.e2e.test.ts — safe to delete',
          address: '100 Test Ave',
          city: 'Springfield',
          state: 'MI',
          zip: '49503',
          lat: 42.9629,
          lng: -85.6789,
          startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
          status: 'PUBLISHED',
          isAuctionSale: true,
          ...(opts.coversFee ? { coversFee: true } : {}),
          // Writes the RETIRED column directly. No application code path can do this any more
          // (no UI, and saleController's zod schema 400s on the key), which is precisely why the
          // fixture has to.
          ...(opts.buyersPremiumPct === null ? {} : { buyersPremiumPct: opts.buyersPremiumPct }),
          organizerId: testOrganizer.id,
        },
      });
      const lot = await prisma.item.create({
        data: {
          embedding: [],
          title: `Configured-premium lot ${opts.titleSuffix}`,
          auctionStartPrice: 50.00,
          currentBid: opts.currentBid ?? CONFIGURED_BID,
          status: 'AVAILABLE',
          saleId: sale.id,
        },
      });
      return { sale, lot };
    };

    const cleanupLot = async (saleId: string, lotId: string) => {
      await prisma.checkoutEvidence.deleteMany({
        where: { purchase: { itemId: lotId } },
      }).catch(() => {});
      await prisma.purchase.deleteMany({ where: { itemId: lotId } }).catch(() => {});
      await prisma.item.delete({ where: { id: lotId } }).catch(() => {});
      await prisma.sale.delete({ where: { id: saleId } }).catch(() => {});
    };

    /**
     * createPaymentIntent writes CheckoutEvidence FIRE-AND-FORGET (`prisma.checkoutEvidence
     * .create(...).catch(...)` — deliberately not awaited, so a logging failure can never
     * block a checkout). The row therefore may not exist the instant the controller returns.
     * Poll for it rather than asserting immediately; a bare read is a flaky race, and a
     * `setTimeout` guess is the same race with extra steps.
     */
    const waitForCheckoutEvidence = async (purchaseId: string, attempts = 40) => {
      for (let i = 0; i < attempts; i++) {
        const found = await prisma.checkoutEvidence.findFirst({ where: { purchaseId } });
        if (found) return found;
        await new Promise((r) => setTimeout(r, 25));
      }
      return null;
    };

    // Fixtures created here are PUBLISHED sales dated inside the next 48 hours, which puts them
    // squarely inside weeklyDigest.e2e's "sales happening this weekend" window. Every test below
    // therefore cleans up in a `finally`, and this sweep catches anything a mid-test failure
    // stranded — without it, one failing assertion here leaks a sale and fails an unrelated
    // suite, which is exactly what happened on the first run of this block.
    afterAll(async () => {
      const strays = await prisma.sale.findMany({
        where: { title: { startsWith: 'Stripe E2E premium ' } },
        select: { id: true, items: { select: { id: true } } },
      });
      for (const stray of strays) {
        for (const it of stray.items) {
          await prisma.checkoutEvidence.deleteMany({ where: { purchase: { itemId: it.id } } }).catch(() => {});
          await prisma.purchase.deleteMany({ where: { itemId: it.id } }).catch(() => {});
          await prisma.item.delete({ where: { id: it.id } }).catch(() => {});
        }
        await prisma.sale.delete({ where: { id: stray.id } }).catch(() => {});
      }
    });

    it('must IGNORE a stored 15% and charge the platform 5%', async () => {
      const { sale, lot } = await makeConfiguredLot({ buyersPremiumPct: 15, titleSuffix: '15pct' });
      try {

        mockPaymentIntentsCreate.mockResolvedValueOnce({
          id: 'pi_test_premium_15pct',
          client_secret: 'pi_test_premium_15pct_secret',
        });

        const req: any = { user: { id: testShopper.id, role: 'USER' }, body: { itemId: lot.id } };
        const res = makeMockRes();
        await createPaymentIntent(req, res);

        const args = mockPaymentIntentsCreate.mock.calls.at(-1)[0];
        // $200 bid at the platform 5% => buyer charged $210.00. The stored 15% would give
        // $230.00; if this ever reads 23000 again the organizer-settable rate is back.
        expect(args.amount).toBe(21000);
        expect(args.amount).not.toBe(23000);
        // application_fee = $10.00 premium + $20.00 SIMPLE commission.
        expect(args.application_fee_amount).toBe(1000 + 2000);
        // The organizer still nets exactly $180.00.
        expect(args.amount - args.application_fee_amount).toBe(18000);

        const payload = res.json.mock.calls.at(-1)[0];
        expect(payload.buyerPremiumRate).toBe(AUCTION_BUYER_PREMIUM_RATE);
        expect(payload.buyerPremiumAmount).toBe(10);
        expect(payload.totalAmount).toBe(210);
        expect(payload.subtotal + payload.buyerPremiumAmount).toBe(payload.totalAmount);

        // CHARGEBACK DEFENCE: the stored consent must state the rate actually charged.
        const purchase = await prisma.purchase.findFirst({
          where: { stripePaymentIntentId: 'pi_test_premium_15pct' },
        });
        expect(purchase).not.toBeNull();
        const evidence = await waitForCheckoutEvidence(purchase!.id);
        expect(evidence?.acknowledgmentText).toContain('buyer premium of 5%');
        expect(evidence?.acknowledgmentText).not.toContain('15%');
        console.log(`✓ Stored 15% ignored: buyer charged $210.00, consent says "${evidence?.acknowledgmentText}"`);

      } finally {
        await cleanupLot(sale.id, lot.id);
      }
    });

    it('must IGNORE a stored 0 and still collect the platform premium', async () => {
      // The dangerous direction. A stored 0 used to mean "FindA.Sale earns no premium on this
      // auction" — an organizer zeroing out the platform's revenue. It must now be inert.
      const { sale, lot } = await makeConfiguredLot({ buyersPremiumPct: 0, titleSuffix: '0pct' });
      try {

        mockPaymentIntentsCreate.mockResolvedValueOnce({
          id: 'pi_test_premium_0pct',
          client_secret: 'pi_test_premium_0pct_secret',
        });

        const req: any = { user: { id: testShopper.id, role: 'USER' }, body: { itemId: lot.id } };
        const res = makeMockRes();
        await createPaymentIntent(req, res);

        const args = mockPaymentIntentsCreate.mock.calls.at(-1)[0];
        expect(args.amount).toBe(21000);                      // premium still charged
        expect(args.amount).not.toBe(20000);                  // the zeroed-out-platform bug
        expect(args.application_fee_amount).toBe(1000 + 2000);
        expect(args.amount - args.application_fee_amount).toBe(18000);

        const payload = res.json.mock.calls.at(-1)[0];
        expect(payload.buyerPremiumRate).toBe(AUCTION_BUYER_PREMIUM_RATE);
        expect(payload.buyerPremiumAmount).toBe(10);
        expect(payload.totalAmount).toBe(210);

        const purchase = await prisma.purchase.findFirst({
          where: { stripePaymentIntentId: 'pi_test_premium_0pct' },
        });
        const evidence = await waitForCheckoutEvidence(purchase!.id);
        expect(evidence?.acknowledgmentText).toContain('buyer premium of 5%');
        console.log('✓ Stored 0% ignored: platform still collects its 5%');
      } finally {
        await cleanupLot(sale.id, lot.id);
      }
    });

    it('charges the platform 5% on a sale with nothing in the column', async () => {
      const { sale, lot } = await makeConfiguredLot({ buyersPremiumPct: null, titleSuffix: 'null' });
      try {
        const stored = await prisma.sale.findUnique({ where: { id: sale.id } });
        expect(stored?.buyersPremiumPct).toBeNull(); // fixture sanity: genuinely unset

        mockPaymentIntentsCreate.mockResolvedValueOnce({
          id: 'pi_test_premium_null',
          client_secret: 'pi_test_premium_null_secret',
        });

        const req: any = { user: { id: testShopper.id, role: 'USER' }, body: { itemId: lot.id } };
        const res = makeMockRes();
        await createPaymentIntent(req, res);

        const args = mockPaymentIntentsCreate.mock.calls.at(-1)[0];
        expect(args.amount).toBe(21000);                      // $200 + 5%
        expect(args.application_fee_amount).toBe(1000 + 2000); // $10 premium + $20 commission
        const payload = res.json.mock.calls.at(-1)[0];
        expect(payload.buyerPremiumRate).toBe(AUCTION_BUYER_PREMIUM_RATE);
        console.log('✓ Unset column: platform 5% charged');

      } finally {
        await cleanupLot(sale.id, lot.id);
      }
    });

    it('writes the fee SNAPSHOT on the Purchase, reconciling to application_fee_amount', async () => {
      const { sale, lot } = await makeConfiguredLot({ buyersPremiumPct: null, titleSuffix: 'snapshot' });
      try {
        mockPaymentIntentsCreate.mockResolvedValueOnce({
          id: 'pi_test_premium_snapshot',
          client_secret: 'pi_test_premium_snapshot_secret',
        });

        const req: any = { user: { id: testShopper.id, role: 'USER' }, body: { itemId: lot.id } };
        const res = makeMockRes();
        await createPaymentIntent(req, res);

        const purchase = await prisma.purchase.findFirst({
          where: { stripePaymentIntentId: 'pi_test_premium_snapshot' },
        });
        expect(purchase).not.toBeNull();
        expect(purchase!.buyerPremiumAmount).toBe(10);
        expect(purchase!.buyerPremiumRate).toBe(AUCTION_BUYER_PREMIUM_RATE);
        expect(purchase!.commissionAmount).toBe(20);
        expect(purchase!.commissionRate).toBe(0.1);
        expect(purchase!.organizerAbsorbedPremium).toBe(false);
        // THE INVARIANT.
        expect(purchase!.buyerPremiumAmount! + purchase!.commissionAmount!).toBe(
          purchase!.platformFeeAmount
        );
        console.log('✓ createPaymentIntent snapshot: $10 premium + $20 commission == $30 application fee');
      } finally {
        await cleanupLot(sale.id, lot.id);
      }
    });

    it('composes coversFee with the platform premium — buyer pays the bid, organizer absorbs 5%', async () => {
      // #402. The buyer is charged the bid only; the platform still collects premium +
      // commission; the organizer absorbs the premium out of their payout.
      const { sale, lot } = await makeConfiguredLot({
        buyersPremiumPct: 15,
        coversFee: true,
        titleSuffix: '15pct-coversfee',
      });
      try {

        mockPaymentIntentsCreate.mockResolvedValueOnce({
          id: 'pi_test_premium_15pct_covers',
          client_secret: 'pi_test_premium_15pct_covers_secret',
        });

        const req: any = { user: { id: testShopper.id, role: 'USER' }, body: { itemId: lot.id } };
        const res = makeMockRes();
        await createPaymentIntent(req, res);

        const args = mockPaymentIntentsCreate.mock.calls.at(-1)[0];
        expect(args.amount).toBe(20000);                       // bid only
        expect(args.application_fee_amount).toBe(1000 + 2000); // $10 premium + $20 commission
        expect(args.amount - args.application_fee_amount).toBe(17000); // organizer nets $170.00

        const payload = res.json.mock.calls.at(-1)[0];
        expect(payload.buyerPremiumAmount).toBe(0);
        expect(payload.buyerPremiumRate).toBe(0);
        expect(payload.totalAmount).toBe(200);
        console.log('✓ coversFee: buyer charged $200.00, platform takes $30.00, organizer nets $170.00');

        // The snapshot must record that the ORGANIZER absorbed it, and reporting must put the
        // absorbed premium on their fee line.
        const purchase = await prisma.purchase.findFirst({
          where: { stripePaymentIntentId: 'pi_test_premium_15pct_covers' },
        });
        expect(purchase!.organizerAbsorbedPremium).toBe(true);
        const report = resolveOrganizerFeeReport(purchase as any, getPlatformFeeRate('SIMPLE'));
        expect(report.grossSalePrice).toBe(200);
        expect(report.platformFee).toBe(30); // $20 commission + $10 absorbed premium

      } finally {
        await cleanupLot(sale.id, lot.id);
      }
    });

    it('rejects buyersPremiumPct at the API boundary rather than silently ignoring it', () => {
      // A zod object STRIPS unknown keys, so simply deleting the field would have made the API
      // answer 200 to `{ buyersPremiumPct: 50 }` and quietly do nothing — an integration would
      // believe it had set a premium. This is also the mass-assignment guard: there is no
      // request shape that reaches the column.
      const ok = saleCreateSchema.safeParse(VALID_SALE_BODY);
      expect(ok.success).toBe(true);

      const rejected = saleCreateSchema.safeParse({ ...VALID_SALE_BODY, buyersPremiumPct: 50 });
      expect(rejected.success).toBe(false);

      const rejectedZero = saleCreateSchema.safeParse({ ...VALID_SALE_BODY, buyersPremiumPct: 0 });
      expect(rejectedZero.success).toBe(false);

      const rejectedNull = saleCreateSchema.safeParse({ ...VALID_SALE_BODY, buyersPremiumPct: null });
      expect(rejectedNull.success).toBe(false);

      // The update schema is saleCreateSchema.partial() — the rejection must survive that.
      const rejectedUpdate = saleUpdateSchema.safeParse({ buyersPremiumPct: 15 });
      expect(rejectedUpdate.success).toBe(false);
      console.log('✓ API boundary: buyersPremiumPct is rejected on create and update, not stripped');
    });

    it('formatBuyerPremiumRate should render without fake precision', () => {
      expect(formatBuyerPremiumRate(AUCTION_BUYER_PREMIUM_RATE)).toBe('5%');
      expect(formatBuyerPremiumRate(0.125)).toBe('12.5%');
      expect(formatBuyerPremiumRate(0)).toBe('0%');
    });

    it('calculateApplicationFee applies the PLATFORM premium, and none on a regular sale', () => {
      // There is no rate parameter any more — that is the lock. A caller cannot supply a
      // different number even by mistake.
      const auction = calculateApplicationFee(20000, 0.10, true);
      expect(auction.buyerPremiumCents).toBe(1000);
      expect(auction.organizerCommissionCents).toBe(2000);
      expect(auction.applicationFeeCents).toBe(3000);
      expect(auction.buyerPremiumRate).toBe(AUCTION_BUYER_PREMIUM_RATE);

      const regular = calculateApplicationFee(20000, 0.10, false);
      expect(regular.buyerPremiumCents).toBe(0);
      expect(regular.applicationFeeCents).toBe(2000);
      expect(regular.buyerPremiumRate).toBe(0);

      // The constant is exactly 5%, stated once so a silent drift is a visible test failure.
      expect(AUCTION_BUYER_PREMIUM_RATE).toBe(0.05);
    });

    // ── the snapshot helpers and the reporting preference ────────────────────────────────
    it('snapshotFromBreakdown converts cents to the dollars the Purchase columns store', () => {
      const breakdown = calculateApplicationFee(20000, 0.10, true);
      const snap = snapshotFromBreakdown(breakdown, 0.10, false);
      expect(snap).toEqual({
        buyerPremiumAmount: 10,
        buyerPremiumRate: 0.05,
        commissionAmount: 20,
        commissionRate: 0.1,
        organizerAbsorbedPremium: false,
      });
    });

    it('snapshotForCommissionOnly records a hard zero premium, not an unknown', () => {
      // 0, not null: "this charge carried no premium" is a fact worth recording. A null there
      // would be indistinguishable from a pre-snapshot row and would send reporting down the
      // recompute path for a row we know everything about.
      expect(snapshotForCommissionOnly(16, 0.08)).toEqual({
        buyerPremiumAmount: 0,
        buyerPremiumRate: 0,
        commissionAmount: 16,
        commissionRate: 0.08,
        organizerAbsorbedPremium: false,
      });
      // A cart-level fee with no honest per-row rate stores null rather than a guess.
      expect(snapshotForCommissionOnly(3.5, null).commissionRate).toBeNull();
    });

    it('resolveOrganizerFeeReport PREFERS the snapshot over today’s tier rate', () => {
      // THE BUG THIS CLOSES: the fee an organizer sees on a past sale used to be
      // `amount * theirCurrentTierRate`. Upgrading SIMPLE -> PRO retroactively restated every
      // sale they had ever made. A snapshotted row must not move when the tier does.
      const row = {
        amount: 210,
        item: { listingType: 'AUCTION' },
        sale: { coversFee: false },
        buyerPremiumAmount: 10,
        commissionAmount: 20,
        organizerAbsorbedPremium: false,
      };
      // Handed the PRO rate, it still reports the SIMPLE commission that was actually charged.
      const asPro = resolveOrganizerFeeReport(row, getPlatformFeeRate('PRO'));
      expect(asPro.grossSalePrice).toBe(200);
      expect(asPro.platformFee).toBe(20);
      // And it is genuinely rate-independent, not coincidence.
      expect(resolveOrganizerFeeReport(row, 0.5)).toEqual(asPro);
    });

    it('resolveOrganizerFeeReport treats a zero-commission snapshot as real, not missing', () => {
      // A referral-discount charge legitimately takes 0 commission. `commissionAmount` is the
      // sentinel for "has a snapshot", so a truthiness check there would send this row down the
      // recompute path and invent a fee the organizer never paid.
      const report = resolveOrganizerFeeReport(
        {
          amount: 100,
          item: { listingType: 'FIXED' },
          buyerPremiumAmount: 0,
          commissionAmount: 0,
          organizerAbsorbedPremium: false,
        },
        getPlatformFeeRate('SIMPLE')
      );
      expect(report.grossSalePrice).toBe(100);
      expect(report.platformFee).toBe(0);
    });

    it('resolveOrganizerFeeReport falls back to the recompute for pre-snapshot rows', () => {
      // Every row written before 2026-08-17 has a NULL snapshot and MUST behave exactly as it
      // did: strip the platform premium out of the auction charge, commission on the hammer.
      const auction = resolveOrganizerFeeReport(
        { amount: 210, item: { listingType: 'AUCTION' }, sale: { coversFee: false } },
        getPlatformFeeRate('SIMPLE')
      );
      expect(auction.grossSalePrice).toBe(200);
      expect(auction.platformFee).toBe(20);

      const regular = resolveOrganizerFeeReport(
        { amount: 200, item: { listingType: 'FIXED' } },
        getPlatformFeeRate('PRO')
      );
      expect(regular.grossSalePrice).toBe(200);
      expect(regular.platformFee).toBe(16);

      // coversFee on a pre-snapshot auction row: the buyer paid the bid only, so `amount` IS
      // the hammer price and the absorbed premium belongs on the organizer's fee line.
      const covered = resolveOrganizerFeeReport(
        { amount: 200, item: { auctionStartPrice: 50 }, sale: { coversFee: true } },
        getPlatformFeeRate('SIMPLE')
      );
      expect(covered.grossSalePrice).toBe(200);
      expect(covered.platformFee).toBe(30);
    });
  });

  describe('organizer-facing fee reporting — commission only, premium stripped', () => {
    const REGULAR_PRICE   = 100.00;                                          // testItem
    const AUCTION_BID     = 200.00;                                          // testAuctionItem.currentBid
    const AUCTION_PREMIUM = parseFloat((AUCTION_BID * AUCTION_BUYER_PREMIUM_RATE).toFixed(2)); // 10.00
    const AUCTION_CHARGED = AUCTION_BID + AUCTION_PREMIUM;                   // 210.00
    const SIMPLE_RATE     = getPlatformFeeRate('SIMPLE');                    // 0.10
    const PRO_RATE        = getPlatformFeeRate('PRO');                       // 0.08
    const AUCTION_COMMISSION = parseFloat((AUCTION_BID * SIMPLE_RATE).toFixed(2));            // 20.00

    beforeAll(async () => {
      // Two PAID purchases in the same organizer's book: one regular, one auction.
      await prisma.purchase.createMany({
        data: [
          {
            id:                    'test-purchase-regular-fee-report',
            userId:                testShopper.id,
            itemId:                testItem.id,
            saleId:                testSale.id,
            amount:                REGULAR_PRICE,
            platformFeeAmount:     parseFloat((REGULAR_PRICE * SIMPLE_RATE).toFixed(2)),   // 10.00
            stripePaymentIntentId: 'pi_test_fee_report_regular',
            status:                'PAID',
          },
          {
            id:                    'test-purchase-auction-fee-report',
            userId:                testShopper.id,
            itemId:                testAuctionItem.id,
            saleId:                testAuctionSale.id,
            // Exactly what stripeController.createPaymentIntent persists on the auction path:
            // `amount` is the buyer's premium-inclusive charge, `platformFeeAmount` is the real
            // application_fee_amount (premium + commission).
            amount:                AUCTION_CHARGED,                                        // 210.00
            platformFeeAmount:     parseFloat((AUCTION_PREMIUM + AUCTION_COMMISSION).toFixed(2)), // 30.00
            stripePaymentIntentId: 'pi_test_fee_report_auction',
            status:                'PAID',
          },
        ],
      });
    });

    afterAll(async () => {
      await prisma.purchase.deleteMany({
        where: { id: { in: ['test-purchase-regular-fee-report', 'test-purchase-auction-fee-report'] } },
      }).catch(() => {});
    });

    it('should detect an auction lot from listingType OR auctionStartPrice', () => {
      expect(isAuctionListing({ listingType: 'AUCTION', auctionStartPrice: null })).toBe(true);
      expect(isAuctionListing({ listingType: 'FIXED', auctionStartPrice: 50 })).toBe(true);
      expect(isAuctionListing({ listingType: 'FIXED', auctionStartPrice: null })).toBe(false);
      expect(isAuctionListing(null)).toBe(false);
      console.log('✓ isAuctionListing matches stripeController.createPaymentIntent detection');
    });

    it('should compose application_fee_amount as premium + commission', () => {
      const simple = calculateApplicationFee(20000, SIMPLE_RATE, true);
      expect(simple.buyerPremiumCents).toBe(1000);
      expect(simple.organizerCommissionCents).toBe(2000);
      expect(simple.applicationFeeCents).toBe(3000);

      const pro = calculateApplicationFee(20000, PRO_RATE, true);
      expect(pro.applicationFeeCents).toBe(2600);

      // Regular sale: commission only, no premium.
      const regular = calculateApplicationFee(20000, SIMPLE_RATE, false);
      expect(regular.buyerPremiumCents).toBe(0);
      expect(regular.applicationFeeCents).toBe(2000);
      console.log('✓ application_fee_amount = premium + commission (auction) / commission only (regular)');
    });

    it('should report the tier COMMISSION on the hammer price for an auction — not the stored combined fee', () => {
      const report = resolveOrganizerFeeReport(
        { amount: AUCTION_CHARGED, item: { listingType: 'AUCTION', auctionStartPrice: 50.0 } },
        SIMPLE_RATE
      );
      // Gross is the hammer price, premium stripped out of the $210.00 charge.
      expect(report.grossSalePrice).toBe(AUCTION_BID);        // 200.00, not 210.00
      expect(report.platformFee).toBe(AUCTION_COMMISSION);    // 20.00
      // CARVE-OUT REGRESSION GUARD: not the bare premium, and not 10% of the charged total.
      expect(report.platformFee).not.toBe(AUCTION_PREMIUM);   // not 10.00
      expect(report.platformFee).not.toBe(parseFloat((AUCTION_CHARGED * SIMPLE_RATE).toFixed(2))); // not 21.00
      // Gross − fee is exactly what lands in the organizer's account.
      expect(report.grossSalePrice - report.platformFee).toBe(180.0);
      console.log(`✓ Auction reported as $${report.grossSalePrice} gross / $${report.platformFee} fee / $${report.grossSalePrice - report.platformFee} net`);
    });

    it('should report 8% on an auction for a PRO organizer', () => {
      const report = resolveOrganizerFeeReport(
        { amount: AUCTION_CHARGED, item: { listingType: 'AUCTION' } },
        PRO_RATE
      );
      expect(report.grossSalePrice).toBe(AUCTION_BID);   // 200.00
      expect(report.platformFee).toBe(16.0);
      expect(report.grossSalePrice - report.platformFee).toBe(184.0);
      console.log('✓ PRO auction reported as $200.00 gross / $16.00 fee / $184.00 net');
    });

    it('should put the absorbed premium on the organizer fee line under Sale.coversFee', () => {
      const report = resolveOrganizerFeeReport(
        {
          amount: AUCTION_BID,                              // buyer charged the bid only
          item:   { listingType: 'AUCTION' },
          sale:   { coversFee: true },
        },
        SIMPLE_RATE
      );
      expect(report.grossSalePrice).toBe(AUCTION_BID);                          // 200.00
      expect(report.platformFee).toBe(AUCTION_COMMISSION + AUCTION_PREMIUM);    // 30.00
      expect(report.grossSalePrice - report.platformFee).toBe(170.0);
      console.log('✓ coversFee auction reported as $200.00 gross / $30.00 fee / $170.00 net');
    });

    it('should leave the tier commission untouched on a regular sale', () => {
      const report = resolveOrganizerFeeReport(
        { amount: REGULAR_PRICE, item: { listingType: 'FIXED', auctionStartPrice: null } },
        SIMPLE_RATE
      );
      expect(report.grossSalePrice).toBe(REGULAR_PRICE);
      expect(report.platformFee).toBe(parseFloat((REGULAR_PRICE * SIMPLE_RATE).toFixed(2))); // 10.00
      // PRO/TEAMS still gets 8%, unchanged.
      expect(
        resolveOrganizerFeeReport({ amount: REGULAR_PRICE, item: { listingType: 'FIXED' } }, PRO_RATE)
          .platformFee
      ).toBe(8.0);
      console.log('✓ Regular-sale fee unchanged: 10% SIMPLE / 8% PRO');
    });

    it('getEarningsBreakdown should show $20.00 on the $200 auction win and $10.00 on the $100 regular sale', async () => {
      const req: any = { user: { id: testOrganizerUser.id, roles: ['ORGANIZER'] }, query: {} };
      const res = makeMockRes();

      await getEarningsBreakdown(req, res);

      const payload = res.json.mock.calls.at(-1)[0];
      const auctionRow = payload.items.find((i: any) => i.purchaseId === 'test-purchase-auction-fee-report');
      const regularRow = payload.items.find((i: any) => i.purchaseId === 'test-purchase-regular-fee-report');

      expect(auctionRow).toBeDefined();
      expect(regularRow).toBeDefined();

      // Auction: hammer price as gross, commission as fee. The winner's premium is invisible.
      expect(auctionRow.salePrice).toBe(AUCTION_BID);          // 200.00, not 210.00
      expect(auctionRow.platformFee).toBe(AUCTION_COMMISSION); // 20.00, not 10.00 and not 21.00
      // Regular: byte-identical to the long-standing behaviour.
      expect(regularRow.salePrice).toBe(REGULAR_PRICE);
      expect(regularRow.platformFee).toBe(parseFloat((REGULAR_PRICE * SIMPLE_RATE).toFixed(2))); // 10.00

      expect(payload.totals.totalPlatformFees).toBeCloseTo(AUCTION_COMMISSION + REGULAR_PRICE * SIMPLE_RATE, 2);
      console.log(
        `✓ getEarningsBreakdown: auction $${auctionRow.platformFee} + regular $${regularRow.platformFee} = $${payload.totals.totalPlatformFees} total platform fees`
      );
    });
  });

});
