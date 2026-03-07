import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getUserCoupons, validateCoupon } from '../controllers/couponController';

const router = Router();

router.get('/', authenticate, getUserCoupons);
router.post('/validate', authenticate, validateCoupon);

export default router;
