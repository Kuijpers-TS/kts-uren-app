const CACHE_NAME = 'kts-uren-v41';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './tandwiel-wit.png',
  './tandwiel-blauw.png',
  './icon-192.png',
  './icon-512.png',
  './favicon.ico',
  './favicon-32.png',
  './favicon-48.png',
  './favicon-64.png',
  './favicon-128.png',
  './apple-touch-icon.png',
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
  // Skip niet-GET requests en Supabase API calls
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.hostname.includes('supabase') || url.hostname.includes('cdn')) return;

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
