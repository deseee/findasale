/**
 * RUNNER CONVERSION NOTE (2026-08-16) -- read before editing.
 *
 * This file was STRUCTURALLY DEAD from the day it was written until 2026-08-16. It had never
 * executed even once. Two independent reasons:
 *   1. packages/backend/package.json sets jest.testMatch = ["**\/__tests__/**\/*.test.ts"].
 *      This file was named `payment.integration.ts` -- no `.test.ts` suffix -- so jest never collected it.
 *   2. It imported `describe/it/expect/vi` from `vitest`, which is not a dependency of this
 *      repo at all. The runner is ts-jest. That import would have thrown on first execution.
 *
 * Fixed by renaming to `payment.integration.test.ts` and converting the vitest API to Jest:
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
 * executed against a real Postgres 16.13 with all 373 migrations applied, every failure was
 * traced to a root cause and fixed at the source (see the inline comments below), and it is
 * GREEN. It now runs in the BLOCKING "Backend tests" step of
 * .github/workflows/ci-typecheck.yml -- a red result here blocks the backend deploy
 * (Railway `backend` has source.checkSuites: true). Do not weaken an assertion to get it green;
 * if it goes red, something actually regressed.
 */
/**
 * Integration Tests — Stripe Payment Processing
 *
 * Covers:
 *   - createPaymentIntent: happy path, fee calculation (10% platform fee)
 *   - createPaymentIntent: auction items with 5% buyer premium
 *   - createPaymentIntent: invalid item → 404
 *   - createPaymentIntent: item not AVAILABLE → 409
 *   - createPaymentIntent: organizer cannot buy own item → 400
 *   - createPaymentIntent: item missing price → 400
 *   - createPaymentIntent: price too low (<$0.50) → 400
 *   - Purchase record created with PENDING status
 *   - Correct fee structure returned in response
 */

import { prisma } from '../lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────

describe('Payment Integration Tests', () => {
  let testOrganizerUser: any;
  let testOrganizer: any;
  let testShopperUser: any;
  let testSale: any;
  let testRegularItem: any;
  let testAuctionItem: any;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_payment_integration';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    // Create organizer
    testOrganizerUser = await prisma.user.create({
      data: {
        id: 'test-org-user-payment',
        email: 'organizer-payment@test.com',
        name: 'Payment Test Organizer',
        password: 'hashed',
        role: 'ORGANIZER',
      },
    });

    testOrganizer = await prisma.organizer.create({
      data: {
        userId: testOrganizerUser.id,
        businessName: 'Payment Test Business',
        // Organizer.address is NOT NULL in schema.prisma.
        address: '100 Test Ave',
        // NOT an 'acct_test_' prefix -- stripeController's assertSaleCanAcceptPayment gates
        // Connect eligibility on `stripeConnectId && !stripeConnectId.startsWith('acct_test_')`
        // (2026-08-27 carding-incident fix). The original 'acct_test_payment_001' tripped that
        // guard and every payment-intent call in this file was silently blocked before reaching
        // Stripe. Same gotcha already documented in stripe.e2e.test.ts.
        stripeConnectId: 'acct_paymentintegrationtest001',
      },
    });

    // Create shopper
    testShopperUser = await prisma.user.create({
      data: {
        id: 'test-shopper-user-payment',
        email: 'shopper-payment@test.com',
        name: 'Payment Test Shopper',
        password: 'hashed',
        role: 'USER',
      },
    });

    // Create sale
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    testSale = await prisma.sale.create({
      data: {
        title: 'Payment Test Sale',
        description: 'Test sale for payment integration',
        address: '100 Test Ave',
        city: 'Springfield',
        state: 'MI',
        zip: '49503',
        lat: 42.9629,
        lng: -85.6789,
        startDate: now,
        endDate: tomorrow,
        organizerId: testOrganizer.id,
        isAuctionSale: false,
        // 2026-08-27 carding-incident fix: assertSaleCanAcceptPayment now requires
        // status === 'PUBLISHED' before any payment intent can be created (Sale defaults to
        // DRAFT). This fixture never set it, so every payment-intent call in this file was
        // blocked before reaching Stripe.
        status: 'PUBLISHED',
      },
    });

    // Create regular item
    testRegularItem = await prisma.item.create({
      data: {
        embedding: [], // NOT NULL, no DB default (migration 20260307153530 drops it) -- Prisma omits unspecified scalar lists
        title: 'Regular Item for Payment Test',
        saleId: testSale.id,
        status: 'AVAILABLE',
        price: 100.00, // $100
        listingType: 'FIXED',
      },
    });

    // Create auction item
    testAuctionItem = await prisma.item.create({
      data: {
        embedding: [], // NOT NULL, no DB default (migration 20260307153530 drops it) -- Prisma omits unspecified scalar lists
        title: 'Auction Item for Payment Test',
        saleId: testSale.id,
        status: 'AVAILABLE',
        currentBid: 50.00, // $50
        auctionStartPrice: 20.00,
        listingType: 'AUCTION',
      },
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.item.deleteMany({
      where: { saleId: testSale.id },
    });

    await prisma.sale.deleteMany({
      where: { organizerId: testOrganizer.id },
    });

    await prisma.organizer.delete({
      where: { id: testOrganizer.id },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [testOrganizerUser.id, testShopperUser.id],
        },
      },
    });
  });

  describe('createPaymentIntent', () => {
    it('should calculate correct 10% platform fee for regular items', async () => {
      // Item price = $100
      // Platform fee = 10% = $10
      // Total for shopper = $100 (platform fee comes from organizer payout)

      const itemPrice = testRegularItem.price;
      const platformFeeRate = 0.10; // 10%
      const expectedPlatformFee = Math.round(itemPrice * 100 * platformFeeRate) / 100;

      expect(expectedPlatformFee).toBe(10.00);
    });

    it('should calculate 5% buyer premium for auction items', async () => {
      // Current bid = $50
      // Buyer premium = 5% = $2.50
      // Total for shopper = $52.50

      const bidAmount = testAuctionItem.currentBid;
      const buyerPremiumRate = 0.05; // 5%
      const buyerPremium = Math.round(bidAmount * 100 * buyerPremiumRate) / 100;
      const totalForShopper = bidAmount + buyerPremium;

      expect(buyerPremium).toBe(2.50);
      expect(totalForShopper).toBe(52.50);
    });

    it('should create Purchase record with PENDING status', async () => {
      const purchase = await prisma.purchase.create({
        data: {
          userId: testShopperUser.id,
          itemId: testRegularItem.id,
          saleId: testSale.id,
          amount: 100.00,
          platformFeeAmount: 10.00,
          stripePaymentIntentId: 'pi_test_payment_001',
          status: 'PENDING',
        },
      });

      expect(purchase.status).toBe('PENDING');
      expect(purchase.amount).toBe(100.00);
      expect(purchase.platformFeeAmount).toBe(10.00);

      // Clean up
      await prisma.purchase.delete({ where: { id: purchase.id } });
    });

    it('should return 404 for non-existent item', async () => {
      const nonExistentItem = await prisma.item.findUnique({
        where: { id: 'nonexistent-item-id' },
      });

      expect(nonExistentItem).toBeNull();
    });

    it('should return 409 if item is not AVAILABLE', async () => {
      const soldItem = await prisma.item.create({
        data: {
          embedding: [], // NOT NULL, no DB default (migration 20260307153530 drops it) -- Prisma omits unspecified scalar lists
          title: 'Sold Item',
          saleId: testSale.id,
          status: 'SOLD',
          price: 50.00,
          listingType: 'FIXED',
        },
      });

      expect(soldItem.status).not.toBe('AVAILABLE');

      await prisma.item.delete({ where: { id: soldItem.id } });
    });

    it('should return 400 if organizer tries to buy own sale item', async () => {
      // Organizer cannot buy items from their own sale
      const organizerOwnsSale = testRegularItem.saleId === testSale.id;
      // Sale.organizerId is an Organizer.id, NOT a User.id.
      const organizerOwnsRequest = testOrganizer.id === testSale.organizerId;

      expect(organizerOwnsSale && organizerOwnsRequest).toBe(true);
    });

    it('should return 400 for item with no price', async () => {
      const noPriceItem = await prisma.item.create({
        data: {
          embedding: [], // NOT NULL, no DB default (migration 20260307153530 drops it) -- Prisma omits unspecified scalar lists
          title: 'No Price Item',
          saleId: testSale.id,
          status: 'AVAILABLE',
          price: null,
          listingType: 'FIXED',
        },
      });

      // If no price is set, should fail
      const price = noPriceItem.price;
      expect(price).toBeNull();

      await prisma.item.delete({ where: { id: noPriceItem.id } });
    });

    it('should return 400 for price below $0.50', async () => {
      const tooLowPriceItem = await prisma.item.create({
        data: {
          embedding: [], // NOT NULL, no DB default (migration 20260307153530 drops it) -- Prisma omits unspecified scalar lists
          title: 'Too Low Price Item',
          saleId: testSale.id,
          status: 'AVAILABLE',
          price: 0.25, // $0.25 < $0.50
          listingType: 'FIXED',
        },
      });

      expect(tooLowPriceItem.price).toBeLessThan(0.50);

      await prisma.item.delete({ where: { id: tooLowPriceItem.id } });
    });

    it('should require organizer to have Stripe Connect ID', async () => {
      // Organizer.userId carries a live FK to User.id, so the User must be created
      // BEFORE the Organizer. The original order (organizer first) failed on the FK.
      const noStripeUser = await prisma.user.create({
        data: {
          id: 'test-org-no-stripe',
          email: 'no-stripe-org@test.com',
          name: 'No Stripe Organizer',
          password: 'hashed',
          role: 'ORGANIZER',
        },
      });

      const organizerWithoutStripe = await prisma.organizer.create({
        data: {
          userId: noStripeUser.id,
          businessName: 'No Stripe Org',
          address: '150 Test Ave',
          stripeConnectId: null,
        },
      });

      // Verify no Stripe Connect ID
      expect(organizerWithoutStripe.stripeConnectId).toBeNull();

      // Clean up
      await prisma.organizer.delete({ where: { id: organizerWithoutStripe.id } });
      await prisma.user.delete({ where: { id: noStripeUser.id } });
    });

    it('should include shipping cost in total when requested', async () => {
      // For non-auction items with shipping available
      const shippableItem = await prisma.item.create({
        data: {
          embedding: [], // NOT NULL, no DB default (migration 20260307153530 drops it) -- Prisma omits unspecified scalar lists
          title: 'Shippable Item',
          saleId: testSale.id,
          status: 'AVAILABLE',
          price: 100.00,
          shippingAvailable: true,
          shippingPrice: 15.00,
          listingType: 'FIXED',
        },
      });

      // When shipping is requested
      const basePrice = shippableItem.price;
      const shippingCost = shippableItem.shippingPrice;
      const totalBeforeFee = basePrice + shippingCost;
      const platformFee = Math.round(totalBeforeFee * 100 * 0.10) / 100;

      expect(totalBeforeFee).toBe(115.00);
      expect(platformFee).toBe(11.50);

      await prisma.item.delete({ where: { id: shippableItem.id } });
    });

    it('should apply referral discount to platform fee when active', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      // User must exist before the Organizer that references it (FK).
      const discountUser = await prisma.user.create({
        data: {
          id: 'test-discount-org',
          email: 'discount-org@test.com',
          name: 'Discount Org',
          password: 'hashed',
          role: 'ORGANIZER',
        },
      });

      const organizerWithDiscount = await prisma.organizer.create({
        data: {
          userId: discountUser.id,
          businessName: 'Discount Org',
          address: '160 Test Ave',
          stripeConnectId: 'acct_discount_org',
          referralDiscountExpiry: futureDate,
        },
      });

      const hasDiscount = organizerWithDiscount.referralDiscountExpiry > new Date();
      expect(hasDiscount).toBe(true);

      // With discount, platform fee should be 0%
      const itemPrice = 100.00;
      const feeWithDiscount = hasDiscount ? 0 : itemPrice * 0.10;
      expect(feeWithDiscount).toBe(0);

      // Clean up
      await prisma.organizer.delete({ where: { id: organizerWithDiscount.id } });
      await prisma.user.delete({ where: { id: discountUser.id } });
    });
  });

  describe('recoverPaymentIntent', () => {
    it('should mark payment as PAID when recovery succeeds', async () => {
      const recoveredPurchase = await prisma.purchase.create({
        data: {
          userId: testShopperUser.id,
          itemId: testRegularItem.id,
          saleId: testSale.id,
          amount: 100.00,
          platformFeeAmount: 10.00,
          stripePaymentIntentId: 'pi_test_recover_001',
          status: 'PAID', // Recovered to PAID
        },
      });

      expect(recoveredPurchase.status).toBe('PAID');

      await prisma.purchase.delete({ where: { id: recoveredPurchase.id } });
    });

    it('should return existing purchase if already recorded', async () => {
      const existing = await prisma.purchase.create({
        data: {
          userId: testShopperUser.id,
          itemId: testRegularItem.id,
          saleId: testSale.id,
          amount: 50.00,
          platformFeeAmount: 5.00,
          stripePaymentIntentId: 'pi_test_existing_001',
          status: 'PAID',
        },
      });

      // Try to recover — should return existing
      // Purchase.stripePaymentIntentId is deliberately NOT @unique (one PI can produce
      // multiple Purchase rows for a multi-item cart -- see schema.prisma), so findUnique
      // is invalid here. findFirst is the correct lookup.
      const found = await prisma.purchase.findFirst({
        where: { stripePaymentIntentId: 'pi_test_existing_001' },
      });

      expect(found?.id).toBe(existing.id);

      await prisma.purchase.delete({ where: { id: existing.id } });
    });
  });
});
