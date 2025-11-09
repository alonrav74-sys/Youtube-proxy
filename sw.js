const CACHE_NAME = 'chordfinder-v14.36-ultimate';
const urlsToCache = [
  './',
  './index.html',
  './ChordEngineEnhanced_v14.36_UltimateMinorDetection.js',
  './sync-engine-v6.14.js',
  './hebrew-spell-checker.js',
  './manifest.json',
  './icon192.png',
  './icon512.png'
];

// Install event - cache critical assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Network First for API, Cache First for assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // API requests: Network First
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return new Response(JSON.stringify({ 
            error: 'offline', 
            message: 'No internet connection' 
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }
  
  // YouTube/External resources: Network Only
  if (url.hostname !== self.location.hostname) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Local assets: Cache First, fallback to Network
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(fetchResponse => {
          // Cache new resources dynamically
          if (fetchResponse && fetchResponse.status === 200) {
            const responseToCache = fetchResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return fetchResponse;
        });
      })
      .catch(() => {
        // Offline fallback
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      })
  );
});

// Handle messages from clients
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
