import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { recordRipple, getRippleSummary, getRippleTrend } from '../services/rippleService';

// Validation schema for recording a ripple
const recordRippleSchema = z.object({
  type: z.enum(['VIEW', 'SHARE', 'SAVE', 'BID'], {
    errorMap: () => ({ message: 'Invalid ripple type. Must be one of: VIEW, SHARE, SAVE, BID' }),
  }),
  metadata: z.record(z.any()).optional(),
});

/**
 * POST /api/sales/:saleId/ripples
 * Record a ripple event (view, share, save, bid) for a sale.
 * Auth: Optional (supports anonymous and authenticated users)
 */
export const createRipple = async (req: Request | AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const result = recordRippleSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({ error: 'Invalid request body', details: result.error.errors });
    }

    const { type, metadata } = result.data;
    const userId = (req as AuthRequest).user?.id;

    await recordRipple(saleId, type, userId, metadata);

    res.status(201).json({ message: 'Ripple recorded', saleId, type });
  } catch (error) {
    console.error('Error recording ripple:', error);
    res.status(500).json({ error: 'Failed to record ripple' });
  }
};

/**
 * GET /api/sales/:saleId/ripples/summary
 * Get ripple summary for a sale (counts by type).
 * Auth: Public
 */
export const getRippleSummaryHandler = async (req: Request, res: Response) => {
  try {
    const { saleId } = req.params;

    const summary = await getRippleSummary(saleId);

    res.json(summary);
  } catch (error) {
    console.error('Error getting ripple summary:', error);
    res.status(500).json({ error: 'Failed to get ripple summary' });
  }
};

/**
 * GET /api/sales/:saleId/ripples/trend
 * Get ripple trend data for a sale over a time period.
 * Query params: hours (default 24)
 * Auth: Public
 */
export const getRippleTrendHandler = async (req: Request, res: Response) => {
  try {
    const { saleId } = req.params;
    const { hours } = req.query;

    const trendHours = hours ? Math.min(parseInt(hours as string, 10), 720) : 24; // Max 30 days

    if (isNaN(trendHours) || trendHours < 1) {
      return res.status(400).json({ error: 'Invalid hours parameter. Must be a positive number.' });
    }

    const trend = await getRippleTrend(saleId, trendHours);

    res.json(trend);
  } catch (error) {
    console.error('Error getting ripple trend:', error);
    res.status(500).json({ error: 'Failed to get ripple trend' });
  }
};
