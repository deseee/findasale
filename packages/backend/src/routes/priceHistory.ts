import { Router } from 'express';
import { getPriceHistory } from '../controllers/priceHistoryController';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/items/:id/price-history — public
router.get('/:id/price-history', getPriceHistory);

export default router;
