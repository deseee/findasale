import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { generateSyndicationBundle, SyndicationNotAvailableError } from '../services/syndicationFormatterService';
import { createRateLimitStore } from '../middleware/rateLimitShared';

const router = Router();

/**
 * Public syndication feed (feature #459). Mounted at /api/syndication in index.ts.
 *
 *   GET /api/syndication/sale/:saleId   (public, no auth; on the web origin it is proxied at finda.sale/api/...)
 *
 * Returns { event, org, items, dataCommons, generatedAt }: schema.org Event, Organization and Product
 * nodes plus a Data Commons entry for ONE sale. It is a machine-readable feed for partners, smart
 * assistants and MCP-style consumers, listed in llms.txt (geo-implementation-plan phases 5 and 8b).
 *
 * It is deliberately NOT listed in sitemap.xml or robots.txt: robots.txt disallows /api/ and
 * feed-style JSON is not a crawl target (sitemaps list HTML pages only). Item pages stay noindex
 * until ISR (see server-sitemap.xml.tsx), and this feed does not change that. Responses carry
 * X-Robots-Tag: noindex so the JSON itself never lands in a search index.
 *
 * Privacy: public sales only, public items only, and only fields the public sale page already shows.
 * Organizer phone and organizer street address are never returned. See generateSyndicationBundle.
 */

// Public and unauthenticated, so bound per-IP usage. Redis-backed with in-memory fallback.
const syndicationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.ip ?? '0.0.0.0',
  validate: false,
  message: { error: 'Too many requests, please try again shortly.' },
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore('rl:syndication:'),
});

// Sale ids are cuids; reject anything else before it reaches the database.
const SALE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * JSON.stringify with <, >, & and the U+2028/U+2029 separators escaped as \uXXXX. The output is the
 * same JSON value, but organizer-entered titles/descriptions can no longer close a
 * <script type="application/ld+json"> block if a consumer pastes the feed into a page.
 */
export function toScriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

router.get('/sale/:saleId', syndicationLimiter, async (req: Request, res: Response): Promise<void> => {
  const saleId = typeof req.params.saleId === 'string' ? req.params.saleId.trim() : '';

  if (!SALE_ID_PATTERN.test(saleId)) {
    res.status(400).json({ error: 'Missing or invalid saleId parameter' });
    return;
  }

  res.set('X-Robots-Tag', 'noindex');

  try {
    const bundle = await generateSyndicationBundle(saleId);

    // Sale data changes infrequently once published. Browser and CDN each hold it at most 5 minutes so a
    // sale that is unpublished, deleted or reverted to DRAFT drops out of caches quickly.
    res.set('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60');
    res.type('application/json');
    res.send(toScriptSafeJson(bundle));
  } catch (err: unknown) {
    if (err instanceof SyndicationNotAvailableError) {
      // Short cache so a sale that just published is not stuck behind a cached 404.
      res.set('Cache-Control', 'public, max-age=60');
      res.status(404).json({ error: 'Sale is not available for syndication' });
      return;
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[syndication] Error generating bundle:', message);
    res.set('Cache-Control', 'no-store');
    res.status(500).json({ error: 'Failed to generate syndication bundle' });
  }
});

export default router;
