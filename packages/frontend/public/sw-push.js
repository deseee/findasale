/**
 * PWA Push Notification Service Worker handler.
 *
 * This file is merged into the generated service worker via next.config.js swSrc.
 * next-pwa v5 supports swSrc to append custom SW code to the Workbox-generated SW.
 *
 * If swSrc integration causes issues, self-register this file as a separate SW
 * alongside the next-pwa SW (less preferred — two SWs can conflict).
 */

// Handle incoming push events
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

// Handle notification click — open/focus the linked URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if already open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
