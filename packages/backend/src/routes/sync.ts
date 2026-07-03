/**
 * Feature #69: Offline Sync Routes
 */

import express from 'express';
import { authenticate } from '../middleware/auth';
import { batchSync } from '../controllers/syncController';

const router = express.Router();

/**
 * POST /api/sync/batch
 * Batch sync endpoint for offline operations
 *
 * Tier gate moved INSIDE batchSync (per-operation, not per-route) — #561 found that a
 * route-level requireTier('PRO') here would silently block CHECKOUT_CASH sync for
 * SIMPLE-tier organizers, permanently losing an already-collected cash sale (cash POS
 * itself has no tier gate). Item CRUD sync (CREATE_ITEM/UPDATE_ITEM/DELETE_ITEM/
 * UPLOAD_PHOTO) still requires PRO; CHECKOUT_CASH does not.
 */
router.post('/batch', authenticate, batchSync);

export default router;
