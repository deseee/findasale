const { withSentryConfig } = require('@sentry/nextjs');

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // Cache-first for static assets; network-first for API and navigation
  runtimeCaching: [
    // Google Fonts — cache first
    {
      urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // Cloudinary images — stale-while-revalidate
    {
      urlPattern: /^https:\/\/res\.cloudinary\.com\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'cloudinary-images',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // Picsum placeholder images — stale-while-revalidate
    {
      urlPattern: /^https:\/\/(?:fastly\.)?picsum\.photos\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'picsum-images',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // OSM map tiles — cache first (subdomain tiles: a/b/c.tile.openstreetmap.org)
    {
      urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'osm-tiles',
        expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // Stripe — excluded entirely from SW; browser fetches directly.
    // NetworkOnly can still reject via 'no-response' if the SW-context fetch fails
    // (e.g. CORS restrictions on clover/stripe.js). Best to not intercept at all.
    // ngrok tunnel — network only; SW must not cache or retry these.
    // axios adds ngrok-skip-browser-warning at the page level, but if the
    // tunnel is down the SW has no fallback entry and emits "no-response".
    // NetworkOnly lets the failure propagate cleanly to the app layer.
    {
      urlPattern: /^https:\/\/.*\.ngrok-free\.app\/.*/i,
      handler: 'NetworkOnly',
    },
    // FindA.Sale API — network first with offline fallback
    {
      urlPattern: /^https?:\/\/.*\/api\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // Next.js static files — cache first
    {
      urlPattern: /\/_next\/static\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-static',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // Next.js image optimization endpoint — stale while revalidate
    {
      urlPattern: /\/_next\/image\?.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'next-images',
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // unpkg.com CDN — cache first; versioned URLs are immutable.
    // Without this explicit rule, unpkg falls through to the pages catch-all
    // (NetworkFirst), which emits "no-response" when the fetch fails and
    // nothing is cached yet (first load, offline, etc.).
    {
      urlPattern: /^https:\/\/unpkg\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'unpkg-cdn',
        expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // HTML pages — network first (Stripe domains excluded so SW never intercepts them)
    {
      urlPattern: /^https?:\/\/(?!(?:js|hooks|m|api)\.stripe\.com)[^/]+\/(?!api\/).*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages',
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
});

// Derive API origin from env var so CSP stays in sync with NEXT_PUBLIC_API_URL.
// Falls back to localhost:5000 for local dev when the var isn't set.
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').origin;
  } catch {
    return 'http://localhost:5000';
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  // Cloudinary image optimisation
  images: {
    domains: ['res.cloudinary.com'],
    formats: ['image/avif', 'image/webp'],
  },

  // Security + performance headers on every response
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Stop MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Force HTTPS (enable after TLS is confirmed on your host)
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Referrer policy
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions policy
          {
            key: 'Permissions-Policy',
            // camera=(self): RapidCapture uses getUserMedia() — camera=() blocks it entirely.
            // microphone=(): No audio features in FindA.Sale — block by policy.
            value: 'camera=(self), microphone=(), geolocation=(self), payment=(self)',
          },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
              "font-src 'self' https://fonts.gstatic.com https://unpkg.com",
              // raw.githubusercontent.com: Leaflet colored marker icons (green/amber/gray/orange)
              // These are used in SaleMapInner.tsx for status-based pin coloring.
              // Blocked by CSP → all pins invisible. Must be alongside unpkg.com (default icons).
              // api.qrserver.com: SaleQRCode component fetches QR images and downloads via fetch().
              // Missing from img-src → blank QR on dashboard. Missing from connect-src → download fails.
              "img-src 'self' data: blob: https://res.cloudinary.com https://*.tile.openstreetmap.org https://unpkg.com https://raw.githubusercontent.com https://picsum.photos https://fastly.picsum.photos https://api.qrserver.com",
              `connect-src 'self' https://api.stripe.com https://m.stripe.network https://terminal-simulator.stripe.com wss://terminal-simulator.stripe.com wss://ws.stripe.com https://nominatim.openstreetmap.org https://*.tile.openstreetmap.org http://localhost:5000 ${apiOrigin} https://o4508108217778176.ingest.us.sentry.io https://api.qrserver.com`,
              "frame-src https://js.stripe.com https://hooks.stripe.com https://m.stripe.network",
              "worker-src 'self' blob:",
              "manifest-src 'self'",
            ].join('; '),
          },
        ],
      },
      // Long-lived cache for immutable Next.js chunks
      {
        source: '/_next/static/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // Icons / manifest cached for a week
      {
        source: '/(manifest.json|icons/.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

module.exports = withSentryConfig(withPWA(nextConfig), {
  // Suppress non-essential Sentry CLI output during builds
  silent: true,
  // Hide source maps from client bundle (security)\
  hideSourceMaps: true,
  // Tree-shake Sentry logger in production
  disableLogger: true,
  // Source map upload requires SENTRY_AUTH_TOKEN — skipped until configured
  sourcemaps: { disable: true },
});
