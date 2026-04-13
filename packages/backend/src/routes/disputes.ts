import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createDispute,
  getMyDisputes,
  getSellerDisputes,
  updateDisputeStatus,
  getAdminDisputes,
  getDisputeById,
} from '../controllers/disputeController';

const router = Router();

// POST /api/disputes — authenticated buyer creates dispute
router.post('/', authenticate, createDispute);

// GET /api/disputes/my — buyer sees their disputes
router.get('/my', authenticate, getMyDisputes);

// GET /api/disputes/seller — organizer sees disputes against them
router.get('/seller', authenticate, getSellerDisputes);

// GET /api/disputes/admin — admin only, all disputes with filters
router.get('/admin', authenticate, getAdminDisputes);

// GET /api/disputes/:id — get single dispute by ID
router.get('/:id', authenticate, getDisputeById);

// PATCH /api/disputes/:id/status — admin only, update status and resolution
router.patch('/:id/status', authenticate, updateDisputeStatus);

export default router;
