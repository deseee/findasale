module.exports = {
  siteUrl: process.env.SITE_URL || 'https://salescout.app',
  generateRobotsTxt: true,
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
      `${process.env.SITE_URL || 'https://salescout.app'}/server-sitemap.xml`,
    ],
  },
};
