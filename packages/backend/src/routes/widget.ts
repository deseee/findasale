import express from 'express';
import { getWidgetInventory } from '../controllers/widgetController';
import { widgetInventoryLimiter } from '../middleware/rateLimiter';

const router = express.Router();

/**
 * Public embeddable widget inventory endpoint.
 * Auth: NONE
 * CORS: wildcard set per-route in index.ts mount — do NOT change global CORS config.
 * Rate limit: widgetInventoryLimiter (60 req/min, IP-keyed)
 *
 * GET /api/widget/inventory?organizer=<cuid|slug>&limit=24&category=...&status=AVAILABLE
 */
router.get('/inventory', widgetInventoryLimiter, getWidgetInventory);

export default router;
