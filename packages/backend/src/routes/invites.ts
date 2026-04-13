import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  validateCode,
  redeemInvite,
} from '../controllers/betaInviteController';

const router = express.Router();

// Tight rate limit — prevents brute-forcing invite codes (5 attempts / 15 min per IP)
const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many invite attempts. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// These endpoints are public (no auth required)
router.post('/validate', inviteLimiter, validateCode);
router.post('/redeem', inviteLimiter, redeemInvite);

export default router;
