/**
 * Feature #39: Photo Op Stations Routes
 *
 * Endpoints for managing branded photo spots and user shares.
 */

import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { photoShareLimiter, shareLikeLimiter } from '../middleware/rateLimiter';
import {
  createStation,
  listStations,
  updateStation,
  deleteStation,
  submitShare,
  listShares,
  likeShare,
} from '../controllers/photoOpController';

const router = express.Router();

// Station management (organizer PRO only)
router.post('/sales/:saleId/photo-ops', authenticate, requireTier('PRO'), createStation);
router.get('/sales/:saleId/photo-ops', listStations);
router.put('/:stationId', authenticate, updateStation);
router.delete('/:stationId', authenticate, deleteStation);

// Photo shares (optional auth, rate limited)
router.post('/:stationId/shares', photoShareLimiter, submitShare);
router.get('/:stationId/shares', listShares);
router.post('/shares/:shareId/like', shareLikeLimiter, likeShare);

export default router;
