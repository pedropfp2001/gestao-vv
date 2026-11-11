const CACHE_NAME = 'traviu-cache-v3';

// Install event - activate immediately
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate event - delete all older caches to ensure users get latest UI immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    })
  );
  self.clients.claim();
});

// Fetch event - ALWAYS NETWORK-FIRST for fresh app updates, fallback to cache if offline
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Nunca guardar respostas da API (pedidos, fotos, PDFs): dados sempre frescos e
  // nada de uma pessoa fica em cache no aparelho para outra pessoa ver.
  if (url.pathname.startsWith('/api/')) return;

  // Network-first strategy for everything (HTML, JS, CSS, APIs)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache successful responses for offline fallback
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline fallback to cache
        return caches.match(event.request);
      })
  );
});
