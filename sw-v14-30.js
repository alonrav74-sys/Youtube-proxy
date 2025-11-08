/**
 * ChordFinder Pro v14.30 - Service Worker
 * PWA offline support with cache
 */

const CACHE_NAME = 'chordfinder-pro-v14-30-ultimate-enharmonic';
const urlsToCache = [
  '/',
  '/index.html',
  '/chord-engine-v14-30.js',
  '/sync-engine-v6.14.js',
  '/hebrew-spell-checker.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install - cache files
self.addEventListener('install', event => {
  console.log('🎸 Service Worker v14.30: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching files...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Service Worker v14.30: Installed');
        return self.skipWaiting();
      })
  );
});

// Activate - cleanup old caches
self.addEventListener('activate', event => {
  console.log('🎸 Service Worker v14.30: Activating...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ Service Worker v14.30: Activated');
        return self.clients.claim();
      })
  );
});

// Fetch - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
  );
});

// Message - force update
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
