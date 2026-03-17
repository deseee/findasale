/**
 * typology.ts — Routes for Feature #46: Treasure Typology Classifier
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import {
  getItemTypology,
  classifyItemEndpoint,
  batchClassifySale,
  updateItemTypology,
} from '../controllers/typologyController';

const router = Router();

/**
 * GET /api/items/:itemId/typology
 * Retrieve typology classification for an item (PRO tier)
 */
router.get(
  '/items/:itemId/typology',
  authMiddleware,
  requireTier('PRO'),
  getItemTypology
);

/**
 * POST /api/items/:itemId/classify
 * Classify an item into a typology category (PRO tier)
 */
router.post(
  '/items/:itemId/classify',
  authMiddleware,
  requireTier('PRO'),
  classifyItemEndpoint
);

/**
 * POST /api/sales/:saleId/classify-all
 * Batch classify all unclassified items in a sale (PRO tier)
 */
router.post(
  '/sales/:saleId/classify-all',
  authMiddleware,
  requireTier('PRO'),
  batchClassifySale
);

/**
 * PATCH /api/items/:itemId/typology
 * Update typology with organizer correction (PRO tier)
 */
router.patch(
  '/items/:itemId/typology',
  authMiddleware,
  requireTier('PRO'),
  updateItemTypology
);

export default router;
