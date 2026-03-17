import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import {
  createTrail,
  getMyTrails,
  getPublicTrail,
  updateTrail,
  deleteTrail,
  completeTrail,
} from '../controllers/trailController';

const router = Router();

// POST /api/trails — Create trail (auth required)
router.post('/', authenticate, createTrail);

// GET /api/trails — Get my trails (auth required, paginated)
router.get('/', authenticate, getMyTrails);

// GET /api/trails/public/:shareToken — Get public trail (no auth)
router.get('/public/:shareToken', optionalAuthenticate, getPublicTrail);

// PUT /api/trails/:trailId — Update trail (auth + ownership)
router.put('/:trailId', authenticate, updateTrail);

// DELETE /api/trails/:trailId — Delete trail (auth + ownership)
router.delete('/:trailId', authenticate, deleteTrail);

// POST /api/trails/:trailId/complete — Mark complete (auth + ownership)
router.post('/:trailId/complete', authenticate, completeTrail);

export default router;
