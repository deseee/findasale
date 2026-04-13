import { Router } from 'express';
import { getShopperReferralStats, applyShopperCredit } from '../controllers/shopperReferralController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/stats', authenticate, getShopperReferralStats);
router.post('/apply-credit', authenticate, applyShopperCredit);

export default router;
