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
import { authenticate, requireOrganizer, requireAdmin } from '../middleware/auth';

const router = Router();

// POST /api/pricing/estimate — Estimate price for an item
router.post('/estimate', authenticate, requireOrganizer, estimatePriceController);

// GET /api/pricing/sources — List all sources and status
router.get('/sources', authenticate, requireOrganizer, listSourcesController);

// PATCH /api/pricing/sources/:sourceId — Toggle source on/off
// 2026-09-29 security fix: this updates a GLOBAL pricingSourceConfig row (affects every organizer),
// so it is admin-only. It used to be open to any organizer. No frontend caller exists.
router.patch('/sources/:sourceId', authenticate, requireAdmin, updateSourceController);

export default router;
