import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';
import {
  getMyTier,
  getOrganizerPublicTier,
  syncTierForOrganizer,
} from '../controllers/tierController';

const router = express.Router();

// Protected routes
router.get('/mine', authenticate, getMyTier);
router.post('/sync/:organizerId', authenticate, requireAdmin, syncTierForOrganizer);

// Public routes
router.get('/organizer/:organizerId', getOrganizerPublicTier);

export default router;
