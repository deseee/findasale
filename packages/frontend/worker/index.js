/**
 * Custom service-worker extensions, merged into the Workbox-generated
 * public/sw.js on every build via next-pwa's `customWorkerDir` option
 * (see next.config.js `withPWA({ customWorkerDir: 'worker', ... })`).
 *
 * WHY THIS FILE EXISTS (read before editing):
 * next-pwa has no `swSrc` configured, so it always regenerates public/sw.js
 * from scratch via Workbox's GenerateSW on every real build -- there is no
 * built-in way to hand-maintain public/sw.js directly, it will always be
 * silently overwritten. `customWorkerDir` is next-pwa's supported mechanism
 * for adding custom service-worker code WITHOUT losing that regeneration
 * (confirmed via next-pwa's own docs: github.com/shadowwalker/next-pwa,
 * examples/custom-worker/README.md "New Method"). next-pwa auto-detects this
 * file, bundles it with webpack, and auto-injects it into the generated
 * sw.js -- so this is the one place custom SW logic can actually survive.
 *
 * This file replaces THREE previously-orphaned, never-actually-active files
 * that all hit the identical root cause (found + fixed together, S1141,
 * 2026-07-20 -- see STATE.md P0 row):
 *   - public/sw.js (Feature #69 offline-mode cache strategies) -- its own
 *     fetch-routing logic is NOT ported here; the existing `runtimeCaching`
 *     config in next.config.js already implements equivalent cache-first
 *     (static/images) and network-first (API/pages) routing via Workbox's
 *     own generated fetch listener. Porting a second competing `fetch`
 *     listener here would collide with it (both calling
 *     event.respondWith() on the same event throws at runtime) -- so only
 *     the piece Workbox doesn't already cover is ported: the offline
 *     fallback behavior, via Workbox's own supported `setCatchHandler` hook
 *     below.
 *   - public/sw-push.js (push notification handling) -- its own header
 *     comment says "merged into the generated service worker via
 *     next.config.js swSrc" but swSrc was never actually configured, so it
 *     was dead code. Ported verbatim below (no fetch/routing logic, so no
 *     collision risk).
 *   - public/sw-cache.js -- NOT ported. A third, redundant, differently
 *     versioned offline-cache implementation, self-described as "registered
 *     separately... to avoid conflicts" but never actually registered
 *     anywhere in the app (grepped `navigator.serviceWorker.register` --
 *     only `/sw.js` is ever registered, in pages/_app.tsx). Superseded by
 *     the runtimeCaching config + this file; safe to delete as dead code
 *     (flagged separately, not deleted by this change).
 *
 * All three old files remain on disk for now (historical reference / in
 * case this needs to be reverted) but are no longer the active
 * implementation once this fix ships.
 */

import { setCatchHandler } from 'workbox-routing';
import { matchPrecache } from 'workbox-precaching';

// ---------------------------------------------------------------------------
// Offline fallback (ported from Feature #69's public/sw.js catch-block
// behavior, re-expressed via Workbox's own supported extension point instead
// of a competing fetch listener).
// ---------------------------------------------------------------------------

const IMAGE_FALLBACK_SVG_BODY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#f0f0f0" width="200" height="200"/></svg>';

setCatchHandler(async ({ event }) => {
  switch (event.request.destination) {
    case 'document':
      // Navigation request failed both network and cache -- serve the
      // precached offline fallback page (already in Workbox's precache
      // manifest automatically, no separate install-time caching needed).
      //
      // NOTE (S1145, 2026-07-21): this file is public/pwa-offline.html, NOT
      // public/offline.html. Root cause of Feature #69's P0-REOPENED SW
      // install failure: public/offline.html is silently shadowed in
      // production -- pages/offline.tsx (a real page route at /offline)
      // collides with it at the Vercel/Next.js static-file layer, so
      // GET /offline.html returns Next's own 404 page even though the file
      // is committed and present in the build. Workbox's precacheAndRoute()
      // still listed /offline.html (globbed from public/ automatically) and
      // tried to fetch+cache it during install; that 404 rejected the
      // install waitUntil() promise, so the SW went straight from
      // 'installing' to 'redundant' on every load -- confirmed via a direct
      // A/B test (public/video.html, no colliding page route, served fine
      // at 200; public/offline.html, colliding with pages/offline.tsx,
      // 404'd) and via Vercel's own deployment API confirming the exact
      // live commit's build had this file in its git tree. Renamed to a
      // name no page route can ever collide with, and next.config.js's
      // publicExcludes now excludes the old offline.html from the precache
      // manifest so it can never break install again even though the
      // now-orphaned public/offline.html file itself is still on disk
      // (device_bash cannot delete files -- flagged for manual cleanup).
      try {
        const cached = await matchPrecache('/pwa-offline.html');
        if (cached) return cached;
      } catch {
        // fall through to Response.error() below
      }
      return Response.error();

    case 'image':
      // Image failed both network and cache -- inline placeholder instead
      // of a broken-image icon (same behavior as the original Feature #69
      // cacheFirstImages() catch branch).
      return new Response(IMAGE_FALLBACK_SVG_BODY, {
        headers: { 'Content-Type': 'image/svg+xml' },
      });

    default: {
      // API requests: return the same JSON offline-error shape the original
      // networkFirstAPI() catch branch returned, so client code expecting
      // JSON doesn't choke on a parse failure.
      const url = new URL(event.request.url);
      if (url.pathname.startsWith('/api/')) {
        return new Response(
          JSON.stringify({ error: 'Offline', message: 'You are offline. This data is not available.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return Response.error();
    }
  }
});

// ---------------------------------------------------------------------------
// Push notifications (ported verbatim from public/sw-push.js -- independent
// of fetch routing, no collision risk with Workbox's generated listeners).
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'FindA.Sale', body: event.data ? event.data.text() : 'New notification' };
  }

  const title = data.title || 'FindA.Sale';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// ---------------------------------------------------------------------------
// Background sync stub (ported verbatim from Feature #69's public/sw.js --
// independent of fetch routing).
// ---------------------------------------------------------------------------

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-items') {
    event.waitUntil(
      self.clients.matchAll().then((matchedClients) => {
        matchedClients.forEach((client) => {
          client.postMessage({ type: 'BACKGROUND_SYNC_READY' });
        });
      })
    );
  }
});
