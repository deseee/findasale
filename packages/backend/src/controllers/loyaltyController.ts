import { Request, Response } from 'express';
import { getPassport } from '../services/loyaltyService';

/**
 * GET /api/loyalty/passport
 * Authenticated endpoint. Returns user's loyalty passport data.
 */
export async function getMyPassport(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const passport = await getPassport(userId);
    res.json(passport);
  } catch (error) {
    console.error('Error fetching passport:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
