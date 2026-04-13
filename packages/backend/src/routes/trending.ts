import { Router } from 'express';
import { getTrendingItems, getTrendingSales } from '../controllers/trendingController';

const router = Router();

router.get('/items', getTrendingItems);
router.get('/sales', getTrendingSales);

export default router;
