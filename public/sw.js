/**
 * EverShine Academy LMS PWA Service Worker
 * 
 * Cache strategies:
 *   - _next/static/*  → Not handled by the service worker. Next.js serves
 *                        content-hashed assets with HTTP cache headers; SW
 *                        caching can keep users pinned to an old build.
 *   - /brand/, assets  → Cache-First (unchanged between deployments).
 *   - Images / fonts   → Cache-First (static by nature).
 *   - API routes       → Network only. Stale LMS data is worse than a clear
 *                        offline/network failure.
 *   - Navigation       → Network only with offline fallback.
 */

const CACHE_VERSION = 'v1.4.0';
const CACHE_PREFIX = 'evershine-lms-';

const CACHE_NAMES = {
  static: `${CACHE_PREFIX}static-${CACHE_VERSION}`,
  pages: `${CACHE_PREFIX}pages-${CACHE_VERSION}`,
  api: `${CACHE_PREFIX}api-${CACHE_VERSION}`
};

// Core assets to pre-cache on service worker installation
const PRECACHE_ASSETS = [
  '/offline',
  '/favicon.ico',
  '/brand/pwa-icon-192.png',
  '/brand/pwa-icon-512.png'
];

// Cacheable static asset (brand assets, uploaded images, fonts).
// NEVER match _next/static/* — those are content-hashed by Next.js
// and served with immutable Cache-Control. Cache-First on those would
// serve stale files after deployments.
const isCacheableAsset = (url) => {
  const path = url.pathname;
  if (path.startsWith('/_next/')) return false;
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

  // 1. Navigation Requests (HTML document pages)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline'))
    );
    return;
  }

  // 2. Cacheable Assets (brand, images, fonts) — Cache-First Strategy
  //    NOT for _next/static/* which are content-hashed by the build.
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

  // 3. API Read Requests — Network only. Returning stale API data after auth,
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

  // 6. Default: Network-First fallback
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
