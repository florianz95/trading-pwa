// Service Worker for Trading PWA
// Handles push notifications and offline caching

const CACHE_NAME = 'trading-pwa-v2';
const OFFLINE_URLS = ['/', '/dashboard', '/portfolio'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Push notification handler
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const { title = 'Trading Signal', body, ticker, signal, signal_id, url } = data;

  const icons = { buy: '🟢', sell: '🔴', hold: '🟡' };
  const icon = icons[signal] || '📊';
  const isBuy = signal === 'buy';

  const actions = isBuy
    ? [
        { action: 'accept', title: '✅ Kaufen' },
        { action: 'decline', title: '❌ Ablehnen' },
      ]
    : [
        { action: 'view', title: '👁 Details' },
      ];

  event.waitUntil(
    self.registration.showNotification(title, {
      body: `${icon} ${body}`,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: `signal-${ticker}-${Date.now()}`,
      requireInteraction: isBuy, // keep BUY notifications visible until acted on
      data: { url: url || '/dashboard', signal_id, ticker, signal },
      actions,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { signal_id, url } = event.notification.data || {};

  let targetUrl = url || '/dashboard';
  if (signal_id) {
    if (event.action === 'accept') {
      targetUrl = `/dashboard?signal=${signal_id}&action=accept`;
    } else if (event.action === 'decline') {
      targetUrl = `/dashboard?signal=${signal_id}&action=decline`;
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open, otherwise open new one
      for (const client of windowClients) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
