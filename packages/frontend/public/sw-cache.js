/**
 * Cache Strategy Service Worker
 *
 * Manages offline caching with multiple strategies:
 * - Cache-first: Static assets (JS, CSS, fonts, images)
 * - Network-first: API responses with offline fallback
 * - Stale-while-revalidate: Sale list pages
 *
 * This SW is registered separately from the next-pwa generated SW to avoid conflicts.
 * Note: next-pwa's own SW already handles most caching. This augments with offline UX.
 */

const CACHE_VERSION = 'v1';
const OFFLINE_PAGE_CACHE = `offline-page-${CACHE_VERSION}`;
const OFFLINE_ASSET_CACHE = `offline-assets-${CACHE_VERSION}`;

// Assets to pre-cache for offline experience
const OFFLINE_ASSETS = [
  '/offline',
  '/icons/icon-192x192.png',
  '/icons/icon-72x72.png',
];

/**
 * Install: Pre-cache offline page and key assets
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const pageCache = await caches.open(OFFLINE_PAGE_CACHE);
      const assetCache = await caches.open(OFFLINE_ASSET_CACHE);

      // Pre-cache offline page
      try {
        await pageCache.add('/offline');
      } catch (err) {
        console.warn('Failed to cache offline page:', err);
      }

      // Pre-cache offline assets
      const assetRequests = OFFLINE_ASSETS.map((url) => new Request(url));
      for (const req of assetRequests) {
        try {
          const res = await fetch(req);
          if (res.ok) {
            assetCache.put(req, res.clone());
          }
        } catch (err) {
          console.warn(`Failed to pre-cache asset ${req.url}:`, err);
        }
      }

      self.skipWaiting();
    })()
  );
});

/**
 * Activate: Clean up old cache versions
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(
            (name) =>
              (name.startsWith('offline-page-') || name.startsWith('offline-assets-')) &&
              !name.endsWith(CACHE_VERSION)
          )
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

/**
 * Fetch: Route-based cache strategies
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Stripe and payment URLs
  if (url.hostname.includes('stripe') || url.pathname.includes('payment')) {
    return;
  }

  // Handle offline page requests — always serve from cache
  if (url.pathname === '/offline' || url.pathname === '/offline/') {
    event.respondWith(
      caches.match(request).then((response) => {
        return response || fetch(request);
      })
    );
    return;
  }

  // Network-first for navigation (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          // Cache successful navigation responses
          const cache = caches.open(`pages-${CACHE_VERSION}`);
          cache.then((c) => c.put(request, response.clone()));
          return response;
        })
        .catch(() => {
          // On network error, try cache
          return caches.match(request).then((cached) => {
            return cached || caches.match('/offline');
          });
        })
    );
    return;
  }

  // API requests — network-first with fallback
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          // Cache successful API responses
          const cache = caches.open(`api-cache-${CACHE_VERSION}`);
          cache.then((c) => c.put(request, response.clone()));
          return response;
        })
        .catch(() => {
          // Return cached API response or empty fallback
          return caches.match(request).then((cached) => {
            return (
              cached ||
              new Response(
                JSON.stringify({ error: 'Offline — data not available' }),
                { status: 503, contentType: 'application/json' }
              )
            );
          });
        })
    );
    return;
  }

  // Static assets — cache-first (JS, CSS, images, fonts)
  if (
    url.pathname.includes('/_next/') ||
    url.pathname.match(/\.(js|css|woff2?|ttf|png|jpg|jpeg|gif|svg|webp)$/i)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          const cache = caches.open(OFFLINE_ASSET_CACHE);
          cache.then((c) => c.put(request, response.clone()));
          return response;
        });
      })
    );
    return;
  }

  // Default: network-first
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
