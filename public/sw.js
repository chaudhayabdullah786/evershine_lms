/**
 * EverShine Academy LMS PWA Service Worker
 * Implements offline caching strategies and navigation fallbacks.
 */

const CACHE_VERSION = 'v1.1.0';
const CACHE_PREFIX = 'evershine-lms-';

const CACHE_NAMES = {
  static: `${CACHE_PREFIX}static-${CACHE_VERSION}`,
  pages: `${CACHE_PREFIX}pages-${CACHE_VERSION}`,
  api: `${CACHE_PREFIX}api-${CACHE_VERSION}`
};

// Core assets to pre-cache on service worker installation
const PRECACHE_ASSETS = [
  '/offline',
  '/',
  '/favicon.ico',
  '/brand/logo-icon-192.png',
  '/brand/logo-icon.svg',
  '/brand/logo-crest.png'
];

// Helper to determine if a URL is a cacheable static asset.
// IMPORTANT: Exclude _next/dev chunks — these are ephemeral Turbopack bundles
// that change on every restart. Caching them with Cache-First causes stale
// module errors (e.g. removed imports still served from SW cache).
const isStaticAsset = (url) => {
  const path = url.pathname;
  // Never cache Turbopack development chunks
  if (path.startsWith('/_next/dev/') || path.includes('/_next/static/chunks/')) {
    return false;
  }
  return (
    path.startsWith('/_next/static/') ||
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

  // 1. Navigation Requests (HTML document pages)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone and cache the successfully fetched page
          const responseToCache = response.clone();
          caches.open(CACHE_NAMES.pages).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // If offline, check if the specific page is cached
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If the specific page is not cached, return the offline fallback shell
            return caches.match('/offline');
          });
        })
    );
    return;
  }

  // 2. Static Assets (JS, CSS, Images, Web Fonts) — Cache-First Strategy
  if (isStaticAsset(requestUrl)) {
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

  // 3. API Read Requests — Network-First Strategy with short fallback
  if (isApiRoute(requestUrl)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAMES.api).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return JSON-formatted failure when offline
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
          });
        })
    );
    return;
  }

  // 4. Default: Network-First fallback
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
