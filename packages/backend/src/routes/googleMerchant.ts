import { Router, Request, Response } from 'express';
import { getCachedFeed } from '../services/googleMerchantFeedService';

const router = Router();

/**
 * GET /api/google-merchant/feed — Feature #463
 *
 * Public, unauthenticated TSV product feed for Google Merchant Center free
 * product listings. Google's crawler fetches this URL on a schedule.
 *
 * Serves the cached TSV built nightly by googleMerchantFeedCron. On a cold or
 * stale cache the service rebuilds on-demand, so this endpoint never returns a
 * 0-byte or empty body (a header-only TSV is the minimum).
 *
 * Response: text/tab-separated-values
 */
router.get('/feed', async (_req: Request, res: Response) => {
  try {
    const entry = await getCachedFeed();

    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'inline; filename="google-merchant-feed.tsv"'
    );
    // Short edge cache so feed edits propagate quickly. The backend's in-memory
    // cache (6h TTL) and the nightly cron still shield it from rebuild cost, so a
    // low max-age is cheap — it only controls how fast changes reach edges/Google.
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).send(entry.tsv);
  } catch (err) {
    console.error('[google-merchant] Feed request failed:', err);
    return res.status(500).json({ error: 'Failed to generate product feed' });
  }
});

export default router;
