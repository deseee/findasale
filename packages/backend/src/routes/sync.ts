/**
 * Feature #69: Offline Sync Routes
 */

import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { batchSync } from '../controllers/syncController';

const router = express.Router();

/**
 * POST /api/sync/batch
 * Batch sync endpoint for offline operations
 * Requires: PRO subscription
 */
router.post('/batch', authenticate, requireTier('PRO'), batchSync);

export default router;
