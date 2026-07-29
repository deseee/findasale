module.exports = {
  siteUrl: process.env.SITE_URL || 'https://finda.sale',
  // robots.txt is curated by hand at public/robots.txt (it carries the
  // /admin/, /api/, /auth/ disallows and Crawl-delay:2 that this config does
  // not). Keep this false so next-sitemap can never overwrite that curated file
  // with a weaker version — even if the Vercel postbuild hook does run.
  generateRobotsTxt: false,
  // Ensure city and cities index pages are included in the static sitemap
  additionalPaths: async (config) => [
    await config.transform(config, '/cities'),
    await config.transform(config, '/city'),
  ],
  exclude: [
    '/server-sitemap.xml',
    // Deprecated city URL families (2026-07-28) -- do not re-add.
    // next.config.js redirects() 308s each of these to /city/:citySlug/:category
    // (canonical consolidation, 2026-07-21). next-sitemap builds from the prerendered
    // getStaticPaths output, so it kept emitting 25 of each family into sitemap-0.xml
    // with a build-time (always-fresh) lastmod -- advertising redirecting URLs as the
    // current, most recently updated form. The page files stay (they must keep serving
    // the 308); only their sitemap entries are excluded.
    '/estate-sales',
    '/estate-sales/*',
    '/yard-sales',
    '/yard-sales/*',
    '/auctions',
    '/auctions/*',
    '/flea-markets',
    '/flea-markets/*',
    '/organizer',
    '/organizer/*',
    '/shopper',
    '/shopper/*',
    '/creator',
    '/creator/*',
    '/profile',
    '/referral-dashboard',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/500',
    '/embed',
    '/embed/*',
  ],
};
