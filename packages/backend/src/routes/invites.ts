import express from 'express';
import {
  validateCode,
  redeemInvite,
} from '../controllers/betaInviteController';

const router = express.Router();

// These endpoints are public (no auth required)
router.post('/validate', validateCode);
router.post('/redeem', redeemInvite);

export default router;
