import { Router } from 'express';
import {
  initiateConsignorOnboarding,
  handleConnectReturn,
  payConsignor,
  getConsignorPayoutStatus,
} from '../controllers/stripeConnectController';
import { authenticate } from '../middleware/auth';
import { paymentLimiter } from '../middleware/rateLimiter';

const router = Router();

// Consignor onboarding
router.post('/onboard/:consignorId', authenticate, initiateConsignorOnboarding);
router.get('/return/:consignorId', authenticate, handleConnectReturn);

// Payout execution
router.post('/pay/:consignorId', authenticate, paymentLimiter, payConsignor);

// Status check
router.get('/status/:consignorId', authenticate, getConsignorPayoutStatus);

export default router;
