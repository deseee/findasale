import { Router, Request, Response } from 'express';
import { generateSyndicationBundle } from '../services/syndicationFormatterService';

const router = Router();

/**
 * GET /api/syndication/sale/:saleId
 *
 * Returns a syndication bundle for a published sale.
 * Public endpoint — no auth required (data is for structured syndication).
 * Only published sales are accessible; unpublished/draft/ended sales return 404.
 */
router.get('/sale/:saleId', async (req: Request, res: Response): Promise<void> => {
  const { saleId } = req.params;

  if (!saleId || typeof saleId !== 'string' || saleId.trim().length === 0) {
    res.status(400).json({ error: 'Missing or invalid saleId parameter' });
    return;
  }

  try {
    const bundle = await generateSyndicationBundle(saleId.trim());

    // Cache for 5 minutes — sale data changes infrequently once published
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.set('Content-Type', 'application/ld+json; charset=utf-8');
    res.json(bundle);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('not found')) {
      res.status(404).json({ error: 'Sale not found' });
      return;
    }

    if (message.includes('not published')) {
      res.status(404).json({ error: 'Sale is not available for syndication' });
      return;
    }

    console.error('[syndication] Error generating bundle:', message);
    res.status(500).json({ error: 'Failed to generate syndication bundle' });
  }
});

export default router;
