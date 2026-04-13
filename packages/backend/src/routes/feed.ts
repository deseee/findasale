import { Router, Response, Request } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getPersonalizedFeed } from '../services/discoveryService';
import { regionConfig } from '../config/regionConfig';

const router = Router();

/**
 * GET /api/feed — AI Discovery personalization
 *
 * Returns personalized sales ranked by relevance to the authenticated user's
 * browse/buy history. Supports optional geolocation (?lat=42.96&lng=-85.67).
 *
 * Anonymous users get geo-sorted popular feed (defaults to configured region).
 * Authenticated users get scored by:
 * - Followed organizers (+30 pts)
 * - Matching item categories from purchase history (+20 pts each)
 * - Previously favorited organizers (+10 pts)
 * - Sale proximity (next 7 days, +5 pts/day)
 * - Distance bonus within 25 miles (+15 pts)
 *
 * Response includes `personalized` flag so frontend can render appropriate label.
 */
router.get('/', async (req: AuthRequest | Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.id ?? null;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;

    const { sales, personalized } = await getPersonalizedFeed(userId, lat, lng);

    // Return top 20 (vs 30 from old feed for faster response)
    res.json({
      sales: sales.slice(0, 20).map(({ score, ...sale }) => sale), // Strip score from response
      personalized,
      reason: personalized
        ? 'Ranked by your browsing history and followed organizers'
        : `Sorted by date and proximity to ${regionConfig.city}`,
    });
  } catch (error) {
    console.error('Feed error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ message: 'Server error loading feed.' });
  }
});

export default router;
