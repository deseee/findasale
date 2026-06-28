import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Dynamic sitemap INDEX.
 *
 * Background:
 *   The sitemap index used to be a committed static file at
 *   public/sitemap.xml with a hardcoded `<lastmod>2026-05-24</lastmod>`.
 *   On Vercel the `postbuild` (next-sitemap) hook is not regenerating
 *   files in production, so that index was frozen — crawlers saw a
 *   lastmod that never advanced and de-prioritised re-crawls.
 *
 * Fix:
 *   Generate the index on the server with `lastmod` computed at request
 *   time. This route is reached via a rewrite in middleware.ts
 *   (`/sitemap.xml` -> `/api/sitemap-index`), which runs before static
 *   file serving and therefore overrides the committed public file
 *   without us having to depend on the build pipeline.
 *
 * The actual content sitemap remains the dynamic /server-sitemap.xml
 * route; this index simply references it with a current lastmod.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const baseUrl = process.env.SITE_URL || 'https://finda.sale';

  // UTC YYYY-MM-DD — W3C date format accepted by Google for <lastmod>.
  const lastmod = new Date().toISOString().split('T')[0];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${baseUrl}/server-sitemap.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
</sitemapindex>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // Mirror the caching strategy used for /server-sitemap.xml in vercel.json.
  res.setHeader(
    'Cache-Control',
    'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
  );
  res.status(200).send(xml);
}
