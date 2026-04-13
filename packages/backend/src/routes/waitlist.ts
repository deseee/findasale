import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  joinWaitlist,
  leaveWaitlist,
  getWaitlistStatus,
} from '../controllers/waitlistController';

const router = express.Router();

// Join waitlist (authenticated)
router.post('/:itemId', authenticate, joinWaitlist);

// Leave waitlist (authenticated)
router.delete('/:itemId', authenticate, leaveWaitlist);

// Get waitlist status (public, but checks auth if provided)
router.get('/status/:itemId', getWaitlistStatus);

export default router;
