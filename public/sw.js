/**
 * EverShine Academy LMS PWA Service Worker
 * 
 * Cache strategies:
 *   - _next/static/*  → Not handled by the SW (content-hashed by Next.js).
 *   - /brand/         → Cache-First (logo/icons unchanged between deployments).
 *   - /assets/images/banner/* → Network-First: banners change on deploy; always
 *                               fetch fresh from server, fall back to cache offline.
 *   - Other images/fonts → Cache-First.
 *   - API routes       → Network only.
 *   - Navigation       → Network only with offline fallback.
 * 
 * CACHE_VERSION bump → forces ALL stale caches to be deleted on next activate.
 * Bump this on every deployment that changes public assets.
 */

// TRADEOFF: Bumping version invalidates all cached assets (brand, images).
// Users will re-download them once. Acceptable cost to guarantee fresh content.
const CACHE_VERSION = 'v1.5.0';
const CACHE_PREFIX = 'evershine-lms-';

const CACHE_NAMES = {
  static: `${CACHE_PREFIX}static-${CACHE_VERSION}`,
  pages:  `${CACHE_PREFIX}pages-${CACHE_VERSION}`,
  api:    `${CACHE_PREFIX}api-${CACHE_VERSION}`
};

// Core assets to pre-cache on service worker installation
const PRECACHE_ASSETS = [
  '/offline',
  '/favicon.ico',
  '/brand/pwa-icon-192.png',
  '/brand/pwa-icon-512.png'
];

// Banner images: always serve from network first — these change on every deploy.
// Cache-First here caused users to see old banners after updates.
const isBannerAsset = (url) => {
  return url.pathname.startsWith('/assets/images/banner/');
};

// Cacheable static asset (brand assets, uploaded images, fonts).
// NEVER match _next/static/* — content-hashed by Next.js, served with immutable Cache-Control.
const isCacheableAsset = (url) => {
  const path = url.pathname;
  if (path.startsWith('/_next/')) return false;
  // Banners handled separately via Network-First above
  if (path.startsWith('/assets/images/banner/')) return false;
  return (
    path.startsWith('/brand/') ||
    path.startsWith('/assets/') ||
    path.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|otf|webp)$/)
  );
};

// Helper to check if a URL is an API request
const isApiRoute = (url) => {
  return url.pathname.startsWith('/api/');
};

// Service Worker Install Phase — Pre-cache critical files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAMES.static).then((cache) => {
      console.log('[Service Worker] Pre-caching critical assets');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Service Worker Activate Phase — Cleanup stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheKeys) => {
      const activeCacheNames = Object.values(CACHE_NAMES);
      return Promise.all(
        cacheKeys.map((key) => {
          if (key.startsWith(CACHE_PREFIX) && !activeCacheNames.includes(key)) {
            console.log(`[Service Worker] Deleting obsolete cache: ${key}`);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch Interception Handler
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // Only handle HTTP/HTTPS protocols (ignores chrome-extension or other schemes)
  if (!requestUrl.protocol.startsWith('http')) {
    return;
  }

  // Let Next.js build assets use normal browser/CDN HTTP caching.
  // This prevents a service worker from serving chunks from a previous build.
  if (requestUrl.pathname.startsWith('/_next/')) {
    return;
  }

  // 1. Navigation Requests (HTML document pages) — Network-First always.
  //    Never serve a cached HTML page; ensures the latest build is shown.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => caches.match('/offline'))
    );
    return;
  }

  // 2. Banner Images — Network-First.
  //    Banners change on every deploy. Cache-First here caused the "old banner"
  //    bug where users saw stale images even after a new deployment.
  //    Network-First: fetch fresh, fall back to cached version if offline.
  if (isBannerAsset(requestUrl)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAMES.static).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Cacheable Static Assets (brand icons, gallery images, fonts) — Cache-First.
  //    These do NOT change between deployments.
  if (isCacheableAsset(requestUrl)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAMES.static).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
    );
    return;
  }

  // 4. API Read Requests — Network only. Returning stale API data after auth,
  //    role, fee, or attendance changes causes misleading LMS behavior.
  if (isApiRoute(requestUrl)) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'OFFLINE',
                message: 'You are currently offline. Check your network connection.'
              }
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }

  // 5. Default: Network-First fallback for everything else
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
