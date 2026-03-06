import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  getMyTier,
  getOrganizerPublicTier,
  syncTierForOrganizer,
} from '../controllers/tierController';

const router = express.Router();

// Protected routes
router.get('/mine', authenticate, getMyTier);
router.post('/sync/:organizerId', authenticate, syncTierForOrganizer);

// Public routes
router.get('/organizer/:organizerId', getOrganizerPublicTier);

export default router;
