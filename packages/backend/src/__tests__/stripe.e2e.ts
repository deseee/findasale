/**
 * E2E Tests — Stripe Connect Express Onboarding + Fee Capture
 *
 * Covers issue #3 (beta-blocker):
 *   - createConnectAccount: new account creation, incomplete-onboarding retry,
 *     login link for fully-onboarded account, 403 for non-organizer
 *   - createPaymentIntent: 5% fee on regular items, 7% fee on auction items,
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

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../index';

// ── Stripe mock ───────────────────────────────────────────────────────────────
// vi.hoisted ensures mock fn references are available when vi.mock factory runs
const mockAccountsCreate         = vi.hoisted(() => vi.fn());
const mockAccountLinksCreate     = vi.hoisted(() => vi.fn());
const mockLoginLinkCreate        = vi.hoisted(() => vi.fn());
const mockPaymentIntentsCreate   = vi.hoisted(() => vi.fn());
const mockPaymentIntentsRetrieve = vi.hoisted(() => vi.fn());
const mockWebhooksConstruct      = vi.hoisted(() => vi.fn());
const mockRefundsCreate          = vi.hoisted(() => vi.fn());

vi.mock('../utils/stripe', () => ({
  getStripe: vi.fn(() => ({
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
  default: vi.fn(),
}));

// ── Resend mock (receipt emails) ──────────────────────────────────────────────
const mockResendSend = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: 'mock-receipt-id', error: null })
);

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockResendSend },
  })),
}));

// ── Import controllers AFTER mocks are hoisted ────────────────────────────────
import {
  createConnectAccount,
  createPaymentIntent,
  webhookHandler,
} from '../controllers/stripeController';

// ── Test helpers ──────────────────────────────────────────────────────────────
const makeMockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json   = vi.fn().mockReturnValue(res);
  res.send   = vi.fn().mockReturnValue(res);
  return res;
};

// ─────────────────────────────────────────────────────────────────────────────

const STRIPE_CONNECT_ID = 'acct_test_stripe_e2e';

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
    process.env.RESEND_API_KEY        = 'test_resend_key_stripe_e2e';
    process.env.RESEND_FROM_EMAIL     = 'receipts@finda.sale';
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

    // Regular sale (isAuctionSale = false → 5% fee)
    testSale = await prisma.sale.create({
      data: {
        title:        'Stripe E2E Regular Sale',
        description:  'Created by stripe.e2e.ts — safe to delete',
        address:      '100 Test Ave',
        city:         'Grand Rapids',
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

    // Auction sale (isAuctionSale = true → 7% fee)
    testAuctionSale = await prisma.sale.create({
      data: {
        title:        'Stripe E2E Auction Sale',
        description:  'Created by stripe.e2e.ts — safe to delete',
        address:      '100 Test Ave',
        city:         'Grand Rapids',
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
        title:  'Vintage Lamp',
        price:  100.00,
        status: 'AVAILABLE',
        saleId: testSale.id,
      },
    });

    // Auction item (currentBid $200.00, auctionStartPrice $50.00)
    testAuctionItem = await prisma.item.create({
      data: {
        title:             'Antique Clock',
        auctionStartPrice: 50.00,
        currentBid:        200.00,
        status:            'AVAILABLE',
        saleId:            testAuctionSale.id,
      },
    });

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
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
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

  // ── createPaymentIntent — regular sale (5% fee) ───────────────────────────

  describe('createPaymentIntent — regular sale (5% fee)', () => {
    const PRICE          = 100.00;
    const EXPECTED_CENTS = Math.round(PRICE * 100);          // 10000
    const EXPECTED_FEE   = Math.round(PRICE * 100 * 0.05);   // 500 (5%)

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
      console.log(`✓ PI created: $${PRICE} item → $${EXPECTED_FEE / 100} fee (5%)`);
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

  // ── createPaymentIntent — auction sale (7% fee) ───────────────────────────

  describe('createPaymentIntent — auction sale (7% fee)', () => {
    const CURRENT_BID      = 200.00;
    const AUCTION_FEE      = Math.round(CURRENT_BID * 100 * 0.07); // 1400
    const START_PRICE      = 50.00;
    const START_PRICE_FEE  = Math.round(START_PRICE * 100 * 0.07);  // 350

    afterAll(async () => {
      await prisma.purchase.deleteMany({
        where: {
          stripePaymentIntentId: {
            in: ['pi_test_auction_e2e', 'pi_test_auction_fallback_e2e'],
          },
        },
      }).catch(() => {});
    });

    it('should apply 7% platform fee using currentBid for auction items', async () => {
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
      expect(args.amount).toBe(Math.round(CURRENT_BID * 100));
      expect(args.application_fee_amount).toBe(AUCTION_FEE);
      console.log(`✓ Auction PI: $${CURRENT_BID} currentBid → $${AUCTION_FEE / 100} fee (7%)`);
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
      expect(args.amount).toBe(Math.round(START_PRICE * 100));
      expect(args.application_fee_amount).toBe(START_PRICE_FEE);
      console.log(`✓ Fallback to auctionStartPrice: $${START_PRICE} → $${START_PRICE_FEE / 100} fee`);

      // Restore
      await prisma.item.update({
        where: { id: testAuctionItem.id },
        data:  { currentBid: CURRENT_BID },
      });
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
      const purchase = await prisma.purchase.findUnique({
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

      const purchase = await prisma.purchase.findUnique({
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
});
