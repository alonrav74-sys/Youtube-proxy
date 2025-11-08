/**
 * ChordFinder Pro - Service Worker
 * Version: v14.30-FIXED
 */

const CACHE_NAME = 'chordfinder-pro-v14-30-FIXED-' + Date.now();

const urlsToCache = [
  '/',
  '/index.html',
  '/chord-engine-v14-30.js',
  '/sync-engine-v6.14.js',
  '/hebrew-spell-checker.js',
  '/manifest.json'
];

// Install - cache files
self.addEventListener('install', event => {
  console.log('🎸 Service Worker v14.30-FIXED: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching app files');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Service Worker installed');
        return self.skipWaiting(); // Activate immediately
      })
  );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  console.log('🎸 Service Worker v14.30-FIXED: Activating...');
  
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
        console.log('✅ Service Worker activated');
        return self.clients.claim(); // Take control immediately
      })
  );
});

// Fetch - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Return cached version
        }
        
        // Not in cache - fetch from network
        return fetch(event.request)
          .then(response => {
            // Don't cache if not a success
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response
            const responseToCache = response.clone();
            
            // Add to cache
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          });
      })
  );
});
