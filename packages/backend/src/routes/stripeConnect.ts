import { Router } from 'express';
import {
  initiateConsignorOnboarding,
  handleConnectReturn,
  getConsignorPayoutStatus,
} from '../controllers/stripeConnectController';
import { authenticate } from '../middleware/auth';
import { consignorOnboardingInviteLimiter } from '../middleware/rateLimiter';

const router = Router();

// Consignor onboarding (rate-limited: this can email a real consignor, see rateLimiter.ts)
router.post('/onboard/:consignorId', authenticate, consignorOnboardingInviteLimiter, initiateConsignorOnboarding);
router.get('/return/:consignorId', authenticate, handleConnectReturn);

// Status check
router.get('/status/:consignorId', authenticate, getConsignorPayoutStatus);

export default router;
