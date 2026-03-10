const CACHE_NAME = 'kts-uren-v79';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './tandwiel-wit-v2.png',
  './icon-192-v2.png',
  './icon-512-v2.png',
  './favicon-v2.ico',
  './favicon-32-v2.png',
  './favicon-48-v2.png',
  './favicon-64-v2.png',
  './favicon-128-v2.png',
  './apple-touch-icon-v2.png',
  './approve-weekstaat.html'
];

// Installatie: cache statische bestanden
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activatie: verwijder oude caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first strategie (altijd verse data, fallback naar cache)
self.addEventListener('fetch', event => {
  // Skip niet-GET requests, non-http(s) schemes, en externe API calls
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (url.hostname.includes('supabase') || url.hostname.includes('cdn')) return;
  // Approve-weekstaat altijd vers laden (niet cachen)
  if (url.pathname.includes('approve-weekstaat')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache succesvolle responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
