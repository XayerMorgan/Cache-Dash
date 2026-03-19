const CACHE_NAME = 'locus-offline-v2';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json' // Optional if added
  // Vite assets are dynamically hashed so we rely on fetch caching
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Map Tile Caching Strategy (Cache First, network fallback)
  if (requestUrl.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // Default Strategy (Network First, local fallback)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache the dynamically hashed assets JS/CSS from Vite
        if (networkResponse.ok && event.request.method === 'GET' && !requestUrl.protocol.startsWith('chrome-extension')) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
