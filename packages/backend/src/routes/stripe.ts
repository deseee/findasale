import { Router } from 'express';
import { createRefund } from '../controllers/refundController';
import { getBalance, getPayoutSchedule, updatePayoutSchedule, createPayout, getEarningsBreakdown, getRefundHistory, buyShippingLabel, markPickedUp } from '../controllers/payoutController';
import { cashPayment } from '../controllers/cashPaymentController'; // moved 2026-09-09 (Square-changeover split-out) -- route path unchanged
import { authenticate } from '../middleware/auth';
import { paymentLimiter } from '../middleware/rateLimiter';

const router = Router();

// Stripe is retired (owner decision 2026-11-04). This router keeps only the processor-agnostic endpoints
// that historically live under the /api/stripe prefix. The old Stripe endpoints (/webhook,
// /pending-payment, /recover-payment-intent) answer 410 STRIPE_RETIRED from index.ts and have no
// handler here.

// Organizer / admin refund (controllers/refundController.ts). Square purchases refund through Square;
// cash rows are recorded; historical Stripe card rows get STRIPE_CLOSED_MANUAL_REFUND_REQUIRED.
// Called by organizer/payouts.tsx, organizer/orders.tsx, admin/users/[id].tsx and BulkLotFollowupPanel.tsx.
router.post('/refund/:purchaseId', authenticate, createRefund);

// Subscription checkout (#23: Pricing page) -- POST /checkout-session removed 2026-09-20,
// dead Stripe endpoint, zero callers. Square Plan B (/api/billing/square/subscribe) is live.

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

export default router;
