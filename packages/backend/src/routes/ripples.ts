import { Router } from 'express';
import { createRipple, getRippleSummaryHandler, getRippleTrendHandler } from '../controllers/rippleController';

const router = Router({ mergeParams: true });

// POST /api/sales/:saleId/ripples — record a ripple event (view, share, save, bid)
// Auth: Optional (anonymous and authenticated users supported)
router.post('/', createRipple);

// GET /api/sales/:saleId/ripples/summary — get ripple counts by type
// Auth: Public
router.get('/summary', getRippleSummaryHandler);

// GET /api/sales/:saleId/ripples/trend — get ripple trend data over a time period
// Auth: Public
// Query: ?hours=24 (default)
router.get('/trend', getRippleTrendHandler);

export default router;
