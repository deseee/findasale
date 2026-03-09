import { Router, Request } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserCoupons, validateCoupon } from '../controllers/couponController';

// Rate limit coupon code validation to prevent brute-force enumeration of valid codes.
// Keys on user ID (not IP) since the route is auth-gated — prevents shared-IP false positives.
// Strip ::ffff: prefix from IPv6-mapped IPv4 addresses to silence ERR_ERL_KEY_GEN_IPV6 warning.
const couponValidateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req as AuthRequest).user?.id;
    if (userId) return userId;
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    return ip.replace(/^::ffff:/, '');
  },
  message: { message: 'Too many validation attempts. Please wait before trying again.' },
});

const router = Router();

router.get('/', authenticate, getUserCoupons);
router.post('/validate', authenticate, couponValidateLimiter, validateCoupon);

export default router;
