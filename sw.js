/**
 * ChordFinder Pro - Service Worker
 * PWA offline support with cache
 */

const CACHE_NAME = 'chordfinder-pro-v14.9';
const urlsToCache = [
  '/',
  '/index.html',
  '/chord-engine-v14-9-improved.js',
  '/sync-engine-v6.14.js',
  '/hebrew-spell-checker.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install - cache files
self.addEventListener('install', event => {
  console.log('🎸 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Service Worker: Installed successfully');
        return self.skipWaiting(); // Activate immediately
      })
      .catch(err => {
        console.error('❌ Service Worker: Install failed', err);
      })
  );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  console.log('🎸 Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('🗑️ Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ Service Worker: Activated successfully');
        return self.clients.claim(); // Take control immediately
      })
  );
});

// Fetch - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip chrome extensions
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }
  
  // Skip API calls (always go to network)
  if (event.request.url.includes('/api/')) {
    return fetch(event.request);
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Cache miss - fetch from network
        return fetch(event.request)
          .then(response => {
            // Don't cache invalid responses
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }
            
            // Clone response (can only be read once)
            const responseToCache = response.clone();
            
            // Cache for future
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(err => {
            console.error('❌ Fetch failed:', err);
            
            // Return offline page if available
            return caches.match('/index.html');
          });
      })
  );
});

console.log('🎸 ChordFinder Pro Service Worker v14.7 loaded');
