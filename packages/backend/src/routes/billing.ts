import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { paymentLimiter } from '../middleware/rateLimiter';
import {
  createCheckoutSession,
  getSubscription,
  cancelSubscription,
  createBillingPortal,
  handleStripeWebhook,
  getDowngradePreview,
  confirmDowngrade,
} from '../controllers/billingController';

const router = Router();

// Protected routes (require authentication)
router.post('/checkout', authenticate, paymentLimiter, createCheckoutSession);
router.get('/subscription', authenticate, getSubscription);
router.post('/cancel', authenticate, cancelSubscription);
router.post('/portal', authenticate, paymentLimiter, createBillingPortal);
router.get('/downgrade-preview', authenticate, getDowngradePreview);
router.post('/downgrade-confirm', authenticate, confirmDowngrade);

// Webhook (no auth — signature verified in controller)
// NOTE: Raw body middleware must be applied in index.ts BEFORE json parser for this route
router.post('/webhook', handleStripeWebhook);

export default router;
