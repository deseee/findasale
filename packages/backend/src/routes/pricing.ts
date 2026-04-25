/**
 * Pricing Routes
 * Phase 1: POST /api/pricing/estimate, GET /api/pricing/sources, PATCH /api/pricing/sources/:sourceId
 */

import { Router } from 'express';
import {
  estimatePriceController,
  listSourcesController,
  updateSourceController,
} from '../controllers/pricingController';
import { requireOrganizer } from '../middleware/auth'; // TODO: Verify middleware exists

const router = Router();

// POST /api/pricing/estimate — Estimate price for an item
router.post('/estimate', requireOrganizer, estimatePriceController);

// GET /api/pricing/sources — List all sources and status
router.get('/sources', requireOrganizer, listSourcesController);

// PATCH /api/pricing/sources/:sourceId — Toggle source on/off
router.patch('/sources/:sourceId', requireOrganizer, updateSourceController);

export default router;
