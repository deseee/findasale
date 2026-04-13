import { Router } from 'express';
import { getPosTierStatus } from '../controllers/posTiersController';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/organizer/pos-tiers — Auth required — get organizer's POS tier status
router.get('/', authenticate, getPosTierStatus);

export default router;
