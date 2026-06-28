/**
 * Fail-safe dynamic sitemap INDEX (Pages Router).
 *
 * NOTE ON ROUTING — this page is normally NOT the path that serves
 * /sitemap.xml in production:
 *   1. The committed public/sitemap.xml static file shadows this page, and
 *   2. middleware.ts rewrites /sitemap.xml -> /api/sitemap-index (which runs
 *      before static file serving and is therefore authoritative).
 *
 * This page exists purely as defense-in-depth. If a maintainer later deletes
 * public/sitemap.xml AND removes the middleware rewrite, Next.js will fall back
 * to this route — and it still emits a fresh `lastmod` rather than a 404 or a
 * frozen file. There is intentionally no hardcoded date anywhere in this fix.
 *
 * Keep this output identical to pages/api/sitemap-index.ts.
 */
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
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
  res.setHeader(
    'Cache-Control',
    'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
  );
  res.write(xml);
  res.end();

  return { props: {} };
};

// Pages Router requires a default export; the route is fully handled in
// getServerSideProps above, so this component never renders.
export default function SitemapIndex() {
  return null;
}
