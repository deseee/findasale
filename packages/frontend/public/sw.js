/**
 * Feature #69: Service Worker for Offline Mode
 * Implements cache-first (static), network-first (API), and offline fallback strategies
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;
const OFFLINE_FALLBACK_URL = '/offline.html';

// Files to pre-cache on install
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/_next/static/chunks/main.js',
  '/_next/static/chunks/webpack.js',
];

/**
 * Install event — cache static assets
 */
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Some static assets failed to cache:', err);
        // Don't fail install if some assets can't be cached
      });
    })
  );
  self.skipWaiting(); // Activate immediately
});

/**
 * Activate event — clean up old caches
 */
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== STATIC_CACHE && cacheName !== API_CACHE && cacheName !== IMAGE_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Control existing clients
});

/**
 * Fetch event — implement cache strategies
 */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (POST, PUT, DELETE handled separately)
  if (event.request.method !== 'GET') {
    return;
  }

  // Static assets — cache first
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  // Images — cache first with long expiry
  if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(url.pathname) || url.hostname === 'res.cloudinary.com') {
    event.respondWith(cacheFirstImages(event.request, IMAGE_CACHE));
    return;
  }

  // API calls — network first with offline fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstAPI(event.request, API_CACHE));
    return;
  }

  // HTML pages — network first
  if (event.request.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(networkFirstHTML(event.request));
    return;
  }

  // Default — network only
  event.respondWith(fetch(event.request));
});

/**
 * Cache-first strategy: Return from cache, fallback to network
 */
function cacheFirst(request, cacheName) {
  return caches.match(request).then(response => {
    if (response) return response;
    return fetch(request)
      .then(response => {
        // Clone and cache successful responses
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(cacheName).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Return offline fallback if available
        return caches.match(OFFLINE_FALLBACK_URL);
      });
  });
}

/**
 * Cache-first for images with expiry
 */
function cacheFirstImages(request, cacheName) {
  return caches.match(request).then(response => {
    if (response) {
      // Check age (simplified: assume cached images are recent)
      return response;
    }
    return fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(cacheName).then(cache => {
            cache.put(request, clone);
            // Cleanup old images if cache is too large
            cleanupOldEntries(cacheName, 200);
          });
        }
        return response;
      })
      .catch(() => {
        // Return placeholder if image unavailable
        return new Response(
          '<svg width="200" height="200"><rect fill="#f0f0f0" width="200" height="200"/></svg>',
          { headers: { 'Content-Type': 'image/svg+xml' } }
        );
      });
  });
}

/**
 * Network-first strategy for API calls
 */
function networkFirstAPI(request, cacheName) {
  return fetch(request)
    .then(response => {
      // Cache successful responses
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(cacheName).then(cache => cache.put(request, clone));
      }
      return response;
    })
    .catch(() => {
      // Return cached version if network fails
      return caches.match(request).then(response => {
        if (response) {
          console.log('[SW] Serving cached API response:', request.url);
          return response;
        }
        // Return offline error response
        return new Response(
          JSON.stringify({ error: 'Offline', message: 'You are offline. This data is not available.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      });
    });
}

/**
 * Network-first strategy for HTML pages
 */
function networkFirstHTML(request) {
  return fetch(request)
    .then(response => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
      }
      return response;
    })
    .catch(() => {
      // Return cached page or offline fallback
      return caches.match(request).then(response => {
        return response || caches.match(OFFLINE_FALLBACK_URL);
      });
    });
}

/**
 * Cleanup old cache entries if cache is too large
 */
function cleanupOldEntries(cacheName, maxEntries) {
  caches.open(cacheName).then(cache => {
    cache.keys().then(keys => {
      if (keys.length > maxEntries) {
        // Delete first (oldest) entry
        cache.delete(keys[0]);
      }
    });
  });
}

/**
 * Handle background sync for offline operations (future enhancement)
 */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-offline-items') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        // Notify all clients to trigger sync
        clients.forEach(client => {
          client.postMessage({ type: 'BACKGROUND_SYNC_READY' });
        });
      })
    );
  }
});
