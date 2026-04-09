// Service Worker for Trading PWA
// Handles push notifications and offline caching

const CACHE_NAME = 'trading-pwa-v1';
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
  const { title = 'Trading Signal', body, ticker, signal, url } = data;

  const icons = { buy: '🟢', sell: '🔴', hold: '🟡' };
  const icon = icons[signal] || '📊';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: `${icon} ${body}`,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: `signal-${ticker}-${Date.now()}`,
      data: { url: url || '/dashboard' },
      actions: [
        { action: 'view', title: 'Details ansehen' },
        { action: 'dismiss', title: 'Schließen' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(clients.openWindow(url));
});
