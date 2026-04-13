import { Router } from 'express';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { couponRateLimiter } from '../middleware/couponRateLimiter';
import { getUserCoupons, validateCoupon, generateXpSinkCoupon, generateShopperCoupon } from '../controllers/couponController';

const router = Router();

router.get('/', authenticate, getUserCoupons);
// Redis-based rate limiter prevents coupon code enumeration (10 req/user/min)
router.post('/validate', authenticate, couponRateLimiter, validateCoupon);
// XP sink: organizer spends 50 XP to generate a $1-off single-use code (max 5/month)
router.post('/generate', authenticate, requireOrganizer, generateXpSinkCoupon);
// Phase 2b: XP sink for shoppers — 3 tiers (100/150/500 XP), generates personal coupon
router.post('/generate-from-xp', authenticate, generateShopperCoupon);

export default router;
