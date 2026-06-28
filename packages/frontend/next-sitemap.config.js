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
