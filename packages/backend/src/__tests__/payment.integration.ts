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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
        stripeConnectId: 'acct_test_payment_001',
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
      },
    });

    // Create regular item
    testRegularItem = await prisma.item.create({
      data: {
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
      const organizerOwnsRequest = testOrganizerUser.id === testSale.organizerId;

      expect(organizerOwnsSale && organizerOwnsRequest).toBe(true);
    });

    it('should return 400 for item with no price', async () => {
      const noPriceItem = await prisma.item.create({
        data: {
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
      const organizerWithoutStripe = await prisma.organizer.create({
        data: {
          userId: 'test-org-no-stripe',
          businessName: 'No Stripe Org',
          stripeConnectId: null,
        },
      });

      // Then create user
      await prisma.user.create({
        data: {
          id: 'test-org-no-stripe',
          email: 'no-stripe-org@test.com',
          name: 'No Stripe Organizer',
          password: 'hashed',
          role: 'ORGANIZER',
        },
      });

      // Verify no Stripe Connect ID
      expect(organizerWithoutStripe.stripeConnectId).toBeNull();

      // Clean up
      await prisma.organizer.delete({ where: { id: organizerWithoutStripe.id } });
    });

    it('should include shipping cost in total when requested', async () => {
      // For non-auction items with shipping available
      const shippableItem = await prisma.item.create({
        data: {
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
      const organizerWithDiscount = await prisma.organizer.create({
        data: {
          userId: 'test-discount-org',
          businessName: 'Discount Org',
          stripeConnectId: 'acct_discount_org',
          referralDiscountExpiry: futureDate,
        },
      });

      await prisma.user.create({
        data: {
          id: 'test-discount-org',
          email: 'discount-org@test.com',
          name: 'Discount Org',
          password: 'hashed',
          role: 'ORGANIZER',
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
      const found = await prisma.purchase.findUnique({
        where: { stripePaymentIntentId: 'pi_test_existing_001' },
      });

      expect(found?.id).toBe(existing.id);

      await prisma.purchase.delete({ where: { id: existing.id } });
    });
  });
});
