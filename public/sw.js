/**
 * Service Worker v2 — Stale-while-revalidate for static assets,
 * network-first for navigation, skip API calls entirely.
 * Cache busting via versioned cache name.
 */
const CACHE_VERSION = 'planula-v2';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/logo.png',
];

// ── Install: pre-cache core shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: purge old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && !k.startsWith('firebase-'))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch strategy by request type ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip API / Netlify functions / Firebase / external
  if (url.pathname.startsWith('/.netlify/')) return;
  if (url.pathname.startsWith('/api')) return;
  if (url.hostname.includes('firebaseio.com')) return;
  if (url.hostname.includes('googleapis.com')) return;
  if (url.origin !== self.location.origin) return;

  // ── Navigation requests: Network-first with offline fallback ──
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the latest HTML shell
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('/', clone));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // ── Static assets: Stale-while-revalidate ──
  // Serve from cache immediately, then update cache in background
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached); // If network fails and no cache, this returns undefined

      return cached || networkFetch;
    })
  );
});
