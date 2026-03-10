import { Router } from 'express';
import {
  createConnectAccount,
  createPaymentIntent,
  webhookHandler,
  getPendingPayment,
  createRefund,
} from '../controllers/stripeController';
import { getAccountStatus } from '../controllers/stripeStatusController';
import { getBalance, getPayoutSchedule, updatePayoutSchedule, createPayout, getEarningsBreakdown } from '../controllers/payoutController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Organizer routes
router.post('/create-connect-account', authenticate, createConnectAccount);
router.get('/account-status', authenticate, getAccountStatus);

// Buyer routes
router.post('/create-payment-intent', authenticate, createPaymentIntent);
router.get('/pending-payment/:purchaseId', authenticate, getPendingPayment);

// Organizer refund
router.post('/refund/:purchaseId', authenticate, createRefund);

// V2: Instant payouts — balance + on-demand payouts + schedule management
router.get('/balance', authenticate, getBalance);
router.get('/payout-schedule', authenticate, getPayoutSchedule);
router.patch('/payout-schedule', authenticate, updatePayoutSchedule);
router.post('/payout', authenticate, createPayout);
router.get('/earnings', authenticate, getEarningsBreakdown);

// Webhook
router.post('/webhook', webhookHandler);

export default router;
