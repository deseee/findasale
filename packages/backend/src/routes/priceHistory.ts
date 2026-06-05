import { Router } from 'express';
import { getPriceHistory } from '../controllers/priceHistoryController';
import { optionalAuthenticate } from '../middleware/auth';

const router = Router();

// GET /api/items/:id/price-history — public but auth-aware (owners/admins bypass PUBLISHED gate)
router.get('/:id/price-history', optionalAuthenticate, getPriceHistory);

export default router;
