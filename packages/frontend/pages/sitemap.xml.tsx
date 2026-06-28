/**
 * Dynamic sitemap INDEX route.
 *
 * Why this exists:
 *   The sitemap index used to be a committed static file at
 *   public/frontend/public/sitemap.xml with a hardcoded
 *   `<lastmod>2026-05-24</lastmod>`. On Vercel the `postbuild`
 *   (`next-sitemap`) lifecycle hook is not regenerating these files
 *   in production, so the static index was frozen — crawlers saw a
 *   `lastmod` that never advanced and de-prioritised re-crawls.
 *
 * What this does:
 *   Emits the same sitemap index, but as a server-rendered Pages Router
 *   route. `lastmod` is computed at request time (UTC date), so every
 *   production response is fresh without relying on the build pipeline.
 *
 * IMPORTANT: For this route to be reachable, the static
 * public/sitemap.xml MUST be deleted — in the Pages Router a static
 * file in /public shadows a route of the same path. That file is
 * removed in the same change that introduced this route.
 *
 * The actual content sitemap remains the dynamic /server-sitemap.xml
 * route — this index simply points at it with a current lastmod.
 */
import type { GetServerSideProps } from 'next';

const baseUrl = process.env.SITE_URL || 'https://finda.sale';

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
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
  res.write(xml);
  res.end();

  return { props: {} };
};

// Pages Router requires a default export; the route is fully handled in
// getServerSideProps above, so this component never renders.
export default function SitemapIndex() {
  return null;
}
