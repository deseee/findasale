module.exports = {
  siteUrl: process.env.SITE_URL || 'https://finda.sale',
  generateRobotsTxt: true,
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
  ],
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/organizer/',
          '/shopper/',
          '/creator/',
          '/profile',
          '/referral-dashboard',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
        ],
      }
    ],
    additionalSitemaps: [
      `${process.env.SITE_URL || 'https://finda.sale'}/server-sitemap.xml`,
    ],
  },
};
