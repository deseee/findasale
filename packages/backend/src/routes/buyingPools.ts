import { Router } from 'express';
import {
  createPool,
  joinPool,
  getPoolsForItem,
  cancelPool,
} from '../controllers/buyingPoolController';
import { authenticate } from '../middleware/auth';

const router = Router();

// POST /api/buying-pools — create a new pool for an item
router.post('/', authenticate, createPool);

// POST /api/buying-pools/:poolId/join — join an existing pool
router.post('/:poolId/join', authenticate, joinPool);

// GET /api/buying-pools/item/:itemId — get all active pools for an item
router.get('/item/:itemId', getPoolsForItem);

// DELETE /api/buying-pools/:poolId — cancel a pool (creator or organizer only)
router.delete('/:poolId', authenticate, cancelPool);

export default router;
