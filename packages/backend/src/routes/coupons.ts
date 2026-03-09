import { Router, Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserCoupons, validateCoupon } from '../controllers/couponController';

// Rate limit coupon code validation to prevent brute-force enumeration of valid codes.
// Keys on user ID (not IP) since the route is auth-gated — prevents shared-IP false positives.
const couponValidateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req as AuthRequest).user?.id;
    if (userId) return userId;
    // Use ipKeyGenerator helper for proper IPv6 handling (validates against ERR_ERL_KEY_GEN_IPV6)
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    return ipKeyGenerator(ip);
  },
  message: { message: 'Too many validation attempts. Please wait before trying again.' },
});

const router = Router();

router.get('/', authenticate, getUserCoupons);
router.post('/validate', authenticate, couponValidateLimiter, validateCoupon);

export default router;
