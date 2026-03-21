import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { couponRateLimiter } from '../middleware/couponRateLimiter';
import { getUserCoupons, validateCoupon } from '../controllers/couponController';

const router = Router();

router.get('/', authenticate, getUserCoupons);
// Redis-based rate limiter prevents coupon code enumeration (10 req/user/min)
router.post('/validate', authenticate, couponRateLimiter, validateCoupon);

export default router;
