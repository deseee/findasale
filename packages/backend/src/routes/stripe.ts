import { Router } from 'express';
import {
  createConnectAccount,
  createPaymentIntent,
  webhookHandler,
  getPendingPayment,
  createRefund,
  recoverPaymentIntent,
  createCheckoutSession,
} from '../controllers/stripeController';
import { getAccountStatus } from '../controllers/stripeStatusController';
import { getBalance, getPayoutSchedule, updatePayoutSchedule, createPayout, getEarningsBreakdown } from '../controllers/payoutController';
import {
  createConnectionToken,
  createTerminalPaymentIntent,
  captureTerminalPaymentIntent,
  cancelTerminalPaymentIntent,
  cashPayment,
} from '../controllers/terminalController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Organizer routes
router.post('/create-connect-account', authenticate, createConnectAccount);
router.get('/account-status', authenticate, getAccountStatus);

// Buyer routes
router.post('/create-payment-intent', authenticate, createPaymentIntent);
router.get('/pending-payment/:purchaseId', authenticate, getPendingPayment);
// P2 Bug 2: Webhook failure recovery endpoint
router.post('/recover-payment-intent', authenticate, recoverPaymentIntent);

// Organizer refund
router.post('/refund/:purchaseId', authenticate, createRefund);

// Subscription checkout (#23: Pricing page)
router.post('/checkout-session', authenticate, createCheckoutSession);

// V2: Instant payouts — balance + on-demand payouts + schedule management
router.get('/balance', authenticate, getBalance);
router.get('/payout-schedule', authenticate, getPayoutSchedule);
router.patch('/payout-schedule', authenticate, updatePayoutSchedule);
router.post('/payout', authenticate, createPayout);
router.get('/earnings', authenticate, getEarningsBreakdown);

// Terminal POS — organizer-only in-person card payments
router.post('/terminal/connection-token', authenticate, createConnectionToken);
router.post('/terminal/payment-intent', authenticate, createTerminalPaymentIntent);
router.post('/terminal/capture', authenticate, captureTerminalPaymentIntent);
router.post('/terminal/cancel', authenticate, cancelTerminalPaymentIntent);
router.post('/terminal/cash-payment', authenticate, cashPayment);

// Webhook
router.post('/webhook', webhookHandler);

export default router;
