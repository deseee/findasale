import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import {
  requestVerification,
  getVerificationStatus,
  adminApproveVerification,
  adminRejectVerification
} from '../controllers/verificationController';

const router = Router();

// POST /api/verification/request — organizer requests verification
// Requires: auth + PRO tier
router.post('/request', authenticate, requireTier('PRO'), requestVerification);

// GET /api/verification/status — organizer checks their status
// Requires: auth
router.get('/status', authenticate, getVerificationStatus);

// POST /api/verification/admin/:organizerId/approve — admin approves verification
router.post('/admin/:organizerId/approve', adminApproveVerification);

// POST /api/verification/admin/:organizerId/reject — admin rejects verification
router.post('/admin/:organizerId/reject', adminRejectVerification);

export default router;
