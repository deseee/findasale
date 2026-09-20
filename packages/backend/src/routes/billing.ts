import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { paymentLimiter } from '../middleware/rateLimiter';
import {
  getSubscription,
  cancelSubscription,
  createBillingPortal,
  handleStripeWebhook,
  getDowngradePreview,
  confirmDowngrade,
  optInOffPlatformSales,
  getOffPlatformUsage,
  createSquareBillingSubscription,
  cancelSquareBillingSubscription,
} from '../controllers/billingController';

const router = Router();

// Protected routes (require authentication)
// POST /checkout (Stripe subscription-checkout) removed 2026-09-20 -- dead, zero callers,
// see billingController.ts's removal note. Square Plan B below (/square/subscribe) is the
// live path.
router.get('/subscription', authenticate, getSubscription);
router.post('/cancel', authenticate, cancelSubscription);
router.post('/portal', authenticate, paymentLimiter, createBillingPortal);
router.get('/downgrade-preview', authenticate, getDowngradePreview);
router.post('/downgrade-confirm', authenticate, confirmDowngrade);

// Square Plan B (2026-09-13) -- PRO/TEAMS recurring billing via Cards API + FindA.Sale-owned
// scheduler (jobs/squareBillingChargeJob.ts). Separate endpoints, not a replacement of the
// Stripe ones above (which stay in place for any still-live legacy Stripe subscriber).
router.post('/square/subscribe', authenticate, paymentLimiter, createSquareBillingSubscription);
router.post('/square/cancel', authenticate, cancelSquareBillingSubscription);

// Bring-Your-Own-Rails (BYOR, 2026-09-06) -- opt-in/consent + usage visibility. Zero Stripe
// calls in either handler (see billingController.ts's BYOR section comment).
router.post('/off-platform-sales/opt-in', authenticate, optInOffPlatformSales);
router.get('/off-platform-usage', authenticate, getOffPlatformUsage);

// Webhook (no auth — signature verified in controller)
// NOTE: Raw body middleware must be applied in index.ts BEFORE json parser for this route
router.post('/webhook', handleStripeWebhook);

export default router;
