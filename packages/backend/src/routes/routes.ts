import { Router } from 'express';
import { planRoute } from '../controllers/routeController';

const router = Router();

// POST /api/routes/plan — public, no auth required for MVP
router.post('/plan', planRoute);

export default router;
