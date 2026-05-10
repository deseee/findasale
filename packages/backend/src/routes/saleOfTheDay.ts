/**
 * GET /api/public/sale-of-the-day — Feature #401: Sale of the Day
 *
 * Returns the highest-quality PUBLISHED sale starting within the next 7 days.
 * No auth required. Cache-Control: max-age=3600 (1 hour).
 *
 * Response: { sale: SaleOfTheDayResult | null }
 */

import { Router, Request, Response } from 'express';
import { getSaleOfTheDay } from '../services/saleOfTheDayService';
import { feedLimiter } from '../middleware/rateLimiter';

const router = Router();

router.get('/sale-of-the-day', feedLimiter, async (_req: Request, res: Response) => {
  try {
    const sale = await getSaleOfTheDay();
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=300');
    return res.json({ sale });
  } catch (error) {
    console.error('[saleOfTheDay] Error selecting sale of the day:', error);
    return res.status(500).json({ message: 'Server error loading sale of the day.' });
  }
});

export default router;
