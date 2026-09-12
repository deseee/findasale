import { Router } from 'express';
import {
  webhookHandler,
  getPendingPayment,
  createRefund,
  recoverPaymentIntent,
  createCheckoutSession,
  testTransaction,
  testCheckoutSession,
  testInAppPayment,
  testInAppIntent,
} from '../controllers/stripeController';
import { getBalance, getPayoutSchedule, updatePayoutSchedule, createPayout, getEarningsBreakdown, getRefundHistory, buyShippingLabel, markPickedUp } from '../controllers/payoutController';
import { cashPayment } from '../controllers/cashPaymentController'; // moved 2026-09-09 (Square-changeover split-out) -- route path unchanged
import { authenticate } from '../middleware/auth';
import { paymentLimiter } from '../middleware/rateLimiter';

const router = Router();

// Buyer routes
// Stripe removal (2026-09-12): single-item and cart checkout both moved to Square-only --
// /create-payment-intent and /create-cart-checkout-session (and their stripeController.ts
// handlers) are deleted outright. CheckoutModal.tsx and CartDrawer.tsx now show a
// seller-not-ready message for any organizer without a live Square account instead of
// calling either endpoint. getPendingPayment (auction-winner resume) and recoverPaymentIntent
// (webhook failure recovery) still service historical Stripe-era rows and stay live.
router.get('/pending-payment/:purchaseId', authenticate, getPendingPayment);
// P2 Bug 2: Webhook failure recovery endpoint
router.post('/recover-payment-intent', authenticate, paymentLimiter, recoverPaymentIntent);

// Organizer refund
router.post('/refund/:purchaseId', authenticate, createRefund);

// Subscription checkout (#23: Pricing page)
router.post('/checkout-session', authenticate, paymentLimiter, createCheckoutSession);

// V2: Instant payouts — balance + on-demand payouts + schedule management
router.get('/balance', authenticate, getBalance);
router.get('/payout-schedule', authenticate, getPayoutSchedule);
router.patch('/payout-schedule', authenticate, updatePayoutSchedule);
router.post('/payout', authenticate, createPayout);
router.get('/earnings', authenticate, getEarningsBreakdown);
// Refund History (2026-07-29): organizer-facing trace of refunds — see payoutController.ts's getRefundHistory
router.get('/refunds', authenticate, getRefundHistory);
// ADR-115 Phase 2 (2026-09-05): organizer buys a real Shippo label for a ship-it purchase.
router.post('/purchases/:id/buy-shipping-label', authenticate, buyShippingLabel);
router.post('/purchases/:id/mark-picked-up', authenticate, markPickedUp); // ADR-115 Phase 3: Orders page local-pickup confirmation

// Terminal POS — hardware card-reader endpoints removed with Stripe (2026-09-12, Stripe-removal pass).
// Cash payment recording is processor-agnostic and stays live.
router.post('/terminal/cash-payment', authenticate, paymentLimiter, cashPayment);

// Test harness — verify POS + payment flows without real money
router.post('/test-transaction', authenticate, testTransaction);
router.post('/test-checkout-session', authenticate, testCheckoutSession);
router.post('/test-in-app-payment', authenticate, testInAppPayment);
router.post('/test-in-app-intent', authenticate, testInAppIntent);

// Webhook
router.post('/webhook', webhookHandler);

export default router;
