import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  validateCode,
  redeemInvite,
} from '../controllers/betaInviteController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Tight rate limit — prevents brute-forcing invite codes (5 attempts / 15 min per IP)
const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many invite attempts. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// /validate is public (no auth required) -- just checks if a code is usable.
// /redeem requires auth (S1140 security fix): it used to trust a client-supplied
// userId with no ownership check, letting anyone burn another user's one-time
// invite slot. Now it always redeems for the authenticated caller.
router.post('/validate', inviteLimiter, validateCode);
router.post('/redeem', inviteLimiter, authenticate, redeemInvite);

export default router;
