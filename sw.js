/**
 * 🎸 ChordFinder Pro - Service Worker
 * PWA with offline support and caching
 */

const CACHE_NAME = 'chordfinder-v7.1';
const RUNTIME_CACHE = 'chordfinder-runtime';

// Files to cache immediately on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/chord-engine-unified.js',
  '/sync-engine.js',
  '/manifest.json'
];

// Install event - cache core files
self.addEventListener('install', event => {
  console.log('🔧 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Service Worker: Caching core files');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('✅ Service Worker: Installation complete');
        return self.skipWaiting(); // Activate immediately
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map(name => {
              console.log('🗑️ Service Worker: Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('✅ Service Worker: Activation complete');
        return self.clients.claim(); // Take control immediately
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip external requests (API calls, YouTube, etc)
  if (url.origin !== location.origin) {
    return;
  }
  
  // Skip API routes
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          console.log('📦 Serving from cache:', url.pathname);
          return cachedResponse;
        }
        
        console.log('🌐 Fetching from network:', url.pathname);
        
        return fetch(request)
          .then(response => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }
            
            // Clone the response
            const responseToCache = response.clone();
            
            // Cache runtime resources
            caches.open(RUNTIME_CACHE)
              .then(cache => {
                cache.put(request, responseToCache);
              });
            
            return response;
          })
          .catch(error => {
            console.error('❌ Fetch failed:', error);
            
            // Return offline page if available
            return caches.match('/index.html');
          });
      })
  );
});

// Message event - for manual cache updates
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('⏩ Service Worker: Skip waiting');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('🗑️ Service Worker: Clearing cache');
    event.waitUntil(
      caches.keys()
        .then(names => Promise.all(names.map(name => caches.delete(name))))
        .then(() => {
          event.ports[0].postMessage({ success: true });
        })
    );
  }
});

// Sync event - for background sync (future feature)
self.addEventListener('sync', event => {
  console.log('🔄 Service Worker: Background sync:', event.tag);
  
  if (event.tag === 'sync-chords') {
    event.waitUntil(
      // Future: sync detected chords to cloud
      Promise.resolve()
    );
  }
});

// Push event - for notifications (future feature)
self.addEventListener('push', event => {
  console.log('🔔 Service Worker: Push received');
  
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'New chord sheet available!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    vibrate: [200, 100, 200],
    data: data
  };
  
  event.waitUntil(
    self.registration.showNotification(
      data.title || 'ChordFinder Pro',
      options
    )
  );
});

console.log('🎸 ChordFinder Pro Service Worker loaded');
