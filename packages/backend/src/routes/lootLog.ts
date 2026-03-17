import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getMyLootLog,
  getLootLogStats,
  getLootLogItem,
  getPublicLootLog,
} from '../controllers/lootLogController';

const router = Router();

// Authenticated routes
router.get('/', authenticate, getMyLootLog);
router.get('/stats', authenticate, getLootLogStats);
router.get('/:purchaseId', authenticate, getLootLogItem);

// Public routes (no auth required)
router.get('/public/:userId', getPublicLootLog);

export default router;
