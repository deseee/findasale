// cache-bust: 2026-07-02T17:00Z — force Vercel build of add-items delete fix f61b7e23 (docs-tip push was skipped by Ignored Build Step)
const { withSentryConfig } = require('@sentry/nextjs');

const withPWA = require('next-pwa')({
  dest: 'public',
  register: false,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // Merges worker/index.js into the generated public/sw.js on every build
  // (Workbox's runtimeCaching below is unaffected -- see worker/index.js's
  // header comment for the full explanation). Fixes Feature #69 offline
  // mode + push notifications both silently never surviving a real build.
  // S1141, 2026-07-20.
  customWorkerDir: 'worker',
  // S1145, 2026-07-21: public/offline.html is shadowed in production by
  // pages/offline.tsx (a real page route at /offline collides with it at
  // the Vercel/Next.js static-file layer -- GET /offline.html returns
  // Next's own 404 even though the file is committed). Workbox's
  // precacheAndRoute() was still globbing it in from public/ automatically
  // and fetch-failing on it during install, which rejected the whole
  // install waitUntil() and sent the SW straight to 'redundant' on every
  // load (the Feature #69 P0-REOPENED bug). The real fallback page moved to
  // public/pwa-offline.html (see worker/index.js) -- excluding the old,
  // permanently-404 offline.html here stops it from ever breaking install
  // again, regardless of whether the orphaned file itself still exists on
  // disk (device_bash cannot delete files in this environment).
  publicExcludes: ['!noprecache/**/*', '!offline.html'],
  // Disable dynamic start-url re-fetching on every navigation.
  // When true (the default), next-pwa injects a cacheOnFrontEndNav helper into
  // main.js that calls fetch('/') on every history.pushState/replaceState.
  // On iOS Safari with a flaky or offline connection that fetch() rejects and
  // — because the returned promise is fire-and-forget — becomes an unhandled
  // rejection captured by Sentry (issue 7342457975, "TypeError: Load failed").
  // Setting this false removes the dynamic fetch entirely; the start URL is
  // still pre-cached at SW install time via cacheStartUrl: true (default).
  dynamicStartUrl: false,
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
    // Cloudinary product images — stale-while-revalidate
    {
      urlPattern: /^https:\/\/res\.cloudinary\.com\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'cloudinary-images',
        expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
    // nothing is cached yet (first load, offline, offline, etc.).
    {
      urlPattern: /^https:\/\/unpkg\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'unpkg-cdn',
        expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // HTML pages — network first (Stripe + eBay CDN excluded so SW never intercepts them)
    // i.ebayimg.com excluded: eBay CDN has no CORS headers; any SW fetch() fails.
    // findasale-image-proxy.findasale.workers.dev excluded: CF Worker proxies ESN/eBay images;
    //   SW fetch() fails silently for this domain (same pattern as eBay CDN).
    //   Exclusion lets the browser handle these img requests natively — which works.
    // Unmatched URLs bypass SW entirely and load natively in browser no-cors mode.
    {
      urlPattern: /^https?:\/\/(?!(?:js|hooks|m|api)\.stripe\.com|i\.ebayimg\.com|findasale-image-proxy\.findasale\.workers\.dev)[^/]+\/(?!api\/).*/i,
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

// Derive WebSocket origin from API origin for CSP connect-src.
// Converts https:// → wss:// and http:// → ws://.
const wsOrigin = apiOrigin.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  // Limit static-generation worker parallelism to 1. Default spawns a worker
  // per available CPU core, each a separate Node process with its own V8
  // heap -- with 300+ prerendered pages (47-market city/estate-sales/
  // yard-sales/auctions/flea-markets/this-weekend/companies pages) this can
  // exceed available system memory (confirmed 2026-07-20: native build hit
  // "FATAL ERROR: Zone Allocation failed - process out of memory" right
  // after "Collecting page data" succeeded; GC log showed the JS heap itself
  // was tiny (13-31MB), so --max-old-space-size did NOT help -- this is an
  // OS-level allocation failure from too many concurrent workers, not a V8
  // heap ceiling). Trades build time for memory; safe, no runtime effect.
  experimental: { cpus: 1 },

  // Prevent Vercel's edge layer from issuing a trailing-slash redirect that
  // would strip query params (including UTM params) before Next.js sees them.
  // Without this, a request to /trending?utm_source=outreach can be redirected
  // to /trending/ by Vercel's platform-level cleanUrls/trailingSlash logic,
  // arriving at Next.js with an empty query string. (#462/#463/#464)
  skipTrailingSlashRedirect: true,

  // Ensure guide data is included in Vercel serverless bundle for server-sitemap.xml
  outputFileTracingIncludes: {
    '/pages/server-sitemap.xml': ['./data/seo-pages/slugs.json'],
  },

  // Force webpack to bundle these ESM packages rather than loading them natively.
  // @tanstack/react-query v5 ships a "modern" ESM build that uses
  // `import { jsx } from "react/jsx-runtime"` — React is CJS so Node.js 24's
  // ESM loader can't resolve the named export, causing a 500 on any SSR page
  // (e.g. /items/[id] with getServerSideProps). Transpiling forces the CJS path.
  transpilePackages: ['@tanstack/react-query', '@tanstack/query-core'],

  // Cloudinary image optimisation
  images: {
    remotePatterns: [
      // Cloudinary — all subdomains (res.cloudinary.com is primary)
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '**.cloudinary.com' },
      // Cloudflare image proxy — routes estatesales.net, liveauctioneers.com, eBay images
      { protocol: 'https', hostname: 'findasale-image-proxy.findasale.workers.dev' },
      // External CDNs (placeholder, testing, map tiles, QR code generation)
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'api.qrserver.com' },
      { protocol: 'https', hostname: 'i.ebayimg.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
    formats: ['image/webp'],
    // Vercel image-optimization cost guidance: photos are immutable once uploaded
    // (Cloudinary/CF-proxy already serve stable URLs), so cache transforms for the
    // max 31 days instead of the 60s default to cut repeat transformation+cache-write cost.
    minimumCacheTTL: 2678400,
  },

  // Route aliases for backwards compatibility
  async redirects() {
    return [
      // Canonical domain: redirect www → non-www (fixes Google "duplicate without canonical")
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.finda.sale' }],
        destination: 'https://finda.sale/:path*',
        permanent: true,
      },
      { source: '/create-sale', destination: '/organizer/create-sale', permanent: true },
      { source: '/manage-sales', destination: '/organizer/sales', permanent: true },
      { source: '/organizer/manage-sales', destination: '/organizer/sales', permanent: true },
      // S237: /auth/* used to be valid routes — redirect to /login to prevent 404s from old bookmarks/emails
      { source: '/auth/login', destination: '/login', permanent: true },
      { source: '/auth/:path*', destination: '/login', permanent: true },
      // /organizer/inventory/[id] never existed as a page — redirect to edit-item
      { source: '/organizer/inventory/:id', destination: '/organizer/edit-item/:id', permanent: false },
      // Hall of fame pages redirect to leaderboard (hall-of-fame feature is future-phase)
      { source: '/hall-of-fame', destination: '/leaderboard', permanent: true },
      { source: '/shopper/hall-of-fame', destination: '/leaderboard', permanent: true },
      // S1: /consignment category renamed to /resale (RETAIL bucket was mislabeled) — 2026-07-09
      { source: '/city/:slug/consignment', destination: '/city/:slug/resale', permanent: true },
    ];
  },

  // Static HTML rewrites — serve public/*.html files at clean URLs
  // S651: catch-all /api/:path* proxy → Railway backend.
  //
  // S673 PATH C — NextAuth at /api/auth/ + beforeFiles for backend auth routes.
  // Next.js routing order: beforeFiles → filesystem/static → afterFiles → dynamic routes → fallback.
  //
  // Problem: NextAuth catch-all at pages/api/auth/[...nextauth].ts intercepts ALL /api/auth/* traffic
  // — including backend routes like /api/auth/refresh, /api/auth/me, /api/auth/logout — because
  // dynamic routes run before the fallback rewrite.
  //
  // Solution: beforeFiles rewrites run BEFORE all filesystem routes (including specific API routes).
  // Listing each backend auth path in beforeFiles ensures Railway handles them; NextAuth only sees
  // its own paths (session, csrf, providers, callback, signin, signout, _log, error).
  async rewrites() {
    const railwayApi = (process.env.NEXT_PUBLIC_API_URL || 'https://api.finda.sale/api').replace(/\/$/, '');
    return {
      // beforeFiles: run BEFORE all Next.js filesystem routes (including pages/api/auth/[...nextauth].ts).
      // Backend auth endpoints must be listed here explicitly so NextAuth never intercepts them.
      beforeFiles: [
        { source: '/api/auth/login',               destination: `${railwayApi}/auth/login` },
        { source: '/api/auth/register',            destination: `${railwayApi}/auth/register` },
        // P0 fix (2026-07-19): new PoW challenge endpoint fell into the NextAuth catch-all
        // (returned 400 "not supported by NextAuth.js") until added here — same SH-020 class
        // of conflict as every other backend /api/auth/* route above.
        { source: '/api/auth/register-challenge', destination: `${railwayApi}/auth/register-challenge` },
        { source: '/api/auth/logout',              destination: `${railwayApi}/auth/logout` },
        { source: '/api/auth/refresh',             destination: `${railwayApi}/auth/refresh` },
        { source: '/api/auth/me',                  destination: `${railwayApi}/auth/me` },
        { source: '/api/auth/oauth',               destination: `${railwayApi}/auth/oauth` },
        { source: '/api/auth/oauth/link',          destination: `${railwayApi}/auth/oauth/link` }, // Roadmap #422: authenticated OAuth linking
        { source: '/api/auth/oauth-verify-age',    destination: `${railwayApi}/auth/oauth-verify-age` },
        { source: '/api/auth/forgot-password',     destination: `${railwayApi}/auth/forgot-password` },
        { source: '/api/auth/reset-password',      destination: `${railwayApi}/auth/reset-password` },
        { source: '/api/auth/verify-email',        destination: `${railwayApi}/auth/verify-email` },
        { source: '/api/auth/verify-email/:token', destination: `${railwayApi}/auth/verify-email/:token` },
        { source: '/api/auth/change-password',     destination: `${railwayApi}/auth/change-password` },
        { source: '/api/auth/redeem-invite',       destination: `${railwayApi}/auth/redeem-invite` },
        { source: '/api/auth/resend-verification', destination: `${railwayApi}/auth/resend-verification` },
        { source: '/api/auth/passkey/:path*',        destination: `${railwayApi}/auth/passkey/:path*` },
      ],
      // afterFiles: static file rewrites (no API involvement)
      afterFiles: [
        // Marketing landing page
        { source: '/video', destination: '/video.html' },
      ],
      // fallback: only reached if no pages/api/* route matched — safe for Railway proxy
      fallback: [
        // Proxy unmatched /api/* → Railway (fallback ensures NextAuth dynamic catch-all runs first
        // for its own paths: session, csrf, providers, callback, signin, signout, _log, error)
        { source: '/api/:path*', destination: `${railwayApi}/:path*` },
      ],
    };
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
            // microphone=(self): VoiceDescriptionInput + RapidCapture's VoiceTagButtonThumbnail use
            // SpeechRecognition + getUserMedia for voice notes. Previously '()' (blocked) — that's
            // why the browser never showed Microphone in Site Settings and SpeechRecognition fired
            // 'not-allowed' instantly with no prompt. Fixed 2026-05-13.
            value: 'camera=(self), microphone=(self), geolocation=(self), payment=(self)',
          },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
              "font-src 'self' https://fonts.gstatic.com https://unpkg.com",
              // raw.githubusercontent.com: Leaflet colored marker icons (green/amber/gray/orange)
              // These are used in SaleMapInner.tsx for status-based pin coloring.
              // Blocked by CSP → all pins invisible. Must be alongside unpkg.com (default icons).
              // api.qrserver.com: SaleQRCode component fetches QR images and downloads via fetch().
              // Missing from img-src → blank QR on dashboard. Missing from connect-src → download fails.
              "img-src 'self' data: blob: https://res.cloudinary.com https://*.cloudinary.com https://picsum.photos https://images.unsplash.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://maps.googleapis.com https://unpkg.com https://raw.githubusercontent.com https://api.qrserver.com https://i.ebayimg.com https://picturescdn.estatesales.net https://findasale-image-proxy.findasale.workers.dev",
              `connect-src 'self' https://api.stripe.com https://m.stripe.network https://terminal-simulator.stripe.com wss://terminal-simulator.stripe.com wss://ws.stripe.com https://nominatim.openstreetmap.org https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://maps.googleapis.com https://fonts.googleapis.com https://fonts.gstatic.com https://unpkg.com https://raw.githubusercontent.com https://res.cloudinary.com https://*.cloudinary.com http://localhost:5000 ${apiOrigin} ${wsOrigin} https://o4508108217778176.ingest.us.sentry.io https://api.qrserver.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com`,
              // S486: 'self' added so /video can embed /organizer-video-ad.html in same-origin iframe
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://m.stripe.network",
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
      // Service worker — must never be cached by the browser (ensures update checks work)
      // Service-Worker-Allowed: / grants the SW scope over the full origin even if the
      // script path is at the root, which some strict UA implementations require explicitly.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      // Workbox companion file — same no-cache treatment
      {
        source: '/workbox-:hash.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      // ISR page routes — all revalidate at 86400s (24h; see each page's
      // getStaticProps). CDN cache lifetime (s-maxage) is set to match so
      // Vercel's edge serves cached HTML for the full ISR window instead of
      // re-invoking the origin function on every hit, cutting Edge Request /
      // Function-invocation volume. stale-while-revalidate=86400 lets the CDN
      // serve a stale copy while ISR regenerates in the background rather than
      // blocking the request. (/sales/:id has edge-case revalidate values —
      // 3600 on fetch failure, 2592000 for ended sales — 86400 is its common
      // live-sale case and the correct CDN baseline.)
      {
        source: '/sales/:id',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=86400, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/city/:slug',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=86400, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/city/:slug/:category',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=86400, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/estate-sales/:citySlug',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=86400, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/yard-sales/:citySlug',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=86400, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/auctions/:citySlug',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=86400, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/flea-markets/:citySlug',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=86400, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/this-weekend/:city',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=86400, stale-while-revalidate=86400' },
        ],
      },
      {
        // Same city-aggregation ISR shape as the routes above (revalidate: 86400 in
        // getStaticProps) but was missed from this list on 2026-07-15 -- added
        // 2026-07-16 as part of the Edge Requests overage follow-up.
        source: '/companies/:citySlug',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=86400, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

module.exports = withSentryConfig(withPWA(nextConfig), {
  // Suppress non-essential Sentry CLI output during builds
  silent: true,
  // hideSourceMaps removed in Sentry SDK v9/v10 -- no replacement needed.
  // The SDK now emits client bundles without a sourceMappingURL by default,
  // so hidden source maps are the automatic behavior. (Verified via Sentry
  // docs during the v8->v10 bump, S1141 2026-07-20.)
  // Tree-shake Sentry logger in production
  disableLogger: true,
  // Source map upload requires SENTRY_AUTH_TOKEN — skipped until configured
  sourcemaps: { disable: true },
});
