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
import { authenticate, requireOrganizer } from '../middleware/auth';

const router = Router();

// POST /api/pricing/estimate — Estimate price for an item
router.post('/estimate', authenticate, requireOrganizer, estimatePriceController);

// GET /api/pricing/sources — List all sources and status
router.get('/sources', authenticate, requireOrganizer, listSourcesController);

// PATCH /api/pricing/sources/:sourceId — Toggle source on/off
router.patch('/sources/:sourceId', authenticate, requireOrganizer, updateSourceController);

export default router;
