import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { getItemValuation, generateItemValuation } from '../controllers/valuationController';

const router = Router({ mergeParams: true });

// GET /api/items/:itemId/valuation — Get valuation for an item (PRO gated)
router.get('/valuation', authenticate, requireTier('PRO'), getItemValuation);

// POST /api/items/:itemId/valuation/generate — Generate fresh valuation (PRO gated)
router.post('/valuation/generate', authenticate, requireTier('PRO'), generateItemValuation);

export default router;
