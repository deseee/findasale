/**
 * GET /api/public/sale-of-the-day — Feature #401: Sale of the Day
 *
 * Returns the highest-quality PUBLISHED sale starting within the next 7 days.
 * No auth required. Cache-Control: max-age=300 (5 min), stale-while-revalidate=60.
 *
 * Cache window was 1 hour (3600s) until 2026-08-29 (weekly-full-site-audit finding, HIGH):
 * a sale that qualified and got selected, then got soft-deleted (deletedAt set) shortly
 * after, kept being served from CDN/browser cache for up to ~65 minutes -- real visitors
 * clicked through to a 404 "Sale not found" page. selectSaleOfTheDay() already correctly
 * filters deletedAt:null/status:PUBLISHED on every fresh run; the bug was purely cache
 * staleness outliving a sale's deletion, not a selection-query gap. Shortened here to
 * bound worst-case exposure to ~6 minutes instead of redesigning cache invalidation.
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
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    return res.json({ sale });
  } catch (error) {
    console.error('[saleOfTheDay] Error selecting sale of the day:', error);
    return res.status(500).json({ message: 'Server error loading sale of the day.' });
  }
});

export default router;
