const CACHE_NAME = 'chordfinder-v14.32-finetuned';
const urlsToCache = [
  '/',
  '/index.html',
  '/ChordEngineEnhanced_v14.32_FineTuned.js',
  '/sync-engine-v6.14.js',
  '/hebrew-spell-checker.js',
  '/manifest.json',
  '/icon192.png',
  '/icon512.png'
];

// Install - cache files
self.addEventListener('install', event => {
  console.log('✅ SW v14.32 Fine-Tuned installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching files...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ All files cached');
      })
      .catch(err => {
        console.error('❌ Cache failed:', err);
      })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  console.log('✅ SW v14.32 Fine-Tuned activated');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // Skip API calls and external resources
  if (
    event.request.url.includes('/api/') ||
    event.request.url.includes('youtube.com') ||
    event.request.url.includes('groq.com') ||
    event.request.url.includes('rapidapi.com')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }

        return fetch(event.request).then(
          response => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
      .catch(() => {
        // Offline fallback
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});

// Listen for SKIP_WAITING message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

---

## ✅ **סיכום השינויים:**

### **index.html:**
- ✅ שם הקובץ: `ChordEngineEnhanced_v14.32_FineTuned.js`
- ✅ גרסה: `?v=2` (cache busting)

### **sw.js:**
- ✅ CACHE_NAME: `chordfinder-v14.32-finetuned`
- ✅ הקובץ החדש ברשימת cache
- ✅ ניקוי cache ישן אוטומטי
- ✅ תמיכה ב-RapidAPI (YouTube)

---

## 🚀 **איך לבדוק?**

1. **שמור** את שני הקבצים
2. **נקה cache:**
   - Chrome: `Ctrl+Shift+Delete` → Clear cache
   - או: DevTools → Application → Clear storage
3. **רענן:**
   - `Ctrl+F5` (hard refresh)
4. **בדוק Console:**
```
   ✅ SW v14.32 Fine-Tuned installing...
   📦 Caching files...
   ✅ All files cached