import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { paymentLimiter } from '../middleware/rateLimiter';
import {
  getSubscription,
  cancelSubscription,
  undoCancelSubscription,
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
// Undo a scheduled cancellation while the paid period is still running (DB-only, 2026-09-29).
router.post('/cancel/undo', authenticate, undoCancelSubscription);
router.get('/downgrade-preview', authenticate, getDowngradePreview);
router.post('/downgrade-confirm', authenticate, confirmDowngrade);

// Square Plan B (2026-09-13) -- PRO/TEAMS recurring billing via Cards API + FindA.Sale-owned
// scheduler (jobs/squareBillingChargeJob.ts).
router.post('/square/subscribe', authenticate, paymentLimiter, createSquareBillingSubscription);
router.post('/square/cancel', authenticate, cancelSquareBillingSubscription);

// Bring-Your-Own-Rails (BYOR, 2026-09-06) -- opt-in/consent + usage visibility. Zero Stripe
// calls in either handler (see billingController.ts's BYOR section comment).
router.post('/off-platform-sales/opt-in', authenticate, optInOffPlatformSales);
router.get('/off-platform-usage', authenticate, getOffPlatformUsage);

// POST /webhook and POST /portal were Stripe-only and are retired (2026-11-04): index.ts answers
// both with 410 STRIPE_RETIRED before this router runs.

export default router;
