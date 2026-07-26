import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { planRoute } from '../controllers/routeController';

const router = Router();

// Rate limiter — public endpoint proxies the free public OSRM router;
// unmetered traffic risks getting FindA.Sale's IP throttled/banned by OSRM.
// Health-scout finding 2026-07-26, Medium #1.
const routePlanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { error: 'Too many route requests. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/routes/plan — public, no auth required for MVP
router.post('/plan', routePlanLimiter, planRoute);

export default router;
