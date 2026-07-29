import { Router } from 'express';
import {
  initiateConsignorOnboarding,
  handleConnectReturn,
  payConsignor,
  getConsignorPayoutStatus,
} from '../controllers/stripeConnectController';
import { authenticate } from '../middleware/auth';
import { paymentLimiter, consignorOnboardingInviteLimiter } from '../middleware/rateLimiter';

const router = Router();

// Consignor onboarding (rate-limited: this can email a real consignor, see rateLimiter.ts)
router.post('/onboard/:consignorId', authenticate, consignorOnboardingInviteLimiter, initiateConsignorOnboarding);
router.get('/return/:consignorId', authenticate, handleConnectReturn);

// Payout execution
router.post('/pay/:consignorId', authenticate, paymentLimiter, payConsignor);

// Status check
router.get('/status/:consignorId', authenticate, getConsignorPayoutStatus);

export default router;
