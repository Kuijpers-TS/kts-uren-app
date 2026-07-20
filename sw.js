const CACHE_NAME = 'kts-uren-v263';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/base.css',
  './css/design-system.css',
  './js/core.js',
  './js/uren.js',
  './js/app-ui.js',
  './js/admin.js',
  './js/inspecties.js',
  './js/inspecties-offline.js',
  './js/administratie.js',
  './js/push.js',
  './kts-pdf-images.js',
  './tandwiel-wit-v2.png',
  './loader-gear-big.png',
  './loader-gear-small.png',
  './icon-192-v4.png',
  './icon-512-v4.png',
  './icon-192-v4-maskable.png',
  './icon-512-v4-maskable.png',
  './favicon-v2.ico',
  './favicon-32-v4.png',
  './favicon-48-v4.png',
  './favicon-64-v4.png',
  './favicon-128-v4.png',
  './apple-touch-icon-v4.png',
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

// Push: melding tonen, ook als de app dicht is. De Edge Function (send-push)
// stuurt JSON: { title, body, tag }.
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { /* leeg bericht */ }
  event.waitUntil(self.registration.showNotification(d.title || 'KTS Uren & Inspecties App', {
    body: d.body || '',
    icon: './icon-192-v4.png',
    badge: './icon-192-v4.png',
    tag: d.tag || undefined,
    data: { url: './' }
  }));
});

// Klik op de melding: bestaand app-venster naar voren halen, anders openen.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lijst => {
      for (const c of lijst) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow('./');
    })
  );
});
