import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
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

// Public routes (no auth required; optionalAuthenticate lets the owner see their own list when it is hidden)
router.get('/public/:userId', optionalAuthenticate, getPublicLootLog);

export default router;
