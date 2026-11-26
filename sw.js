// Offline support: the page itself comes from the network when there is one; everything else
// (code, textures, sounds, models, the three.js and font CDNs) is served from cache once it has been loaded.
const CACHE = 'smashroom-v1';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'manifest.webmanifest', 'assets/icons/icon-192.png']))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || r.headers.has('range')) return;
  const url = new URL(r.url), own = url.origin === location.origin;
  if (!own && !/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.host)) return;
  const put = res => { if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); } return res; };
  if (r.mode === 'navigate') { e.respondWith(fetch(r).then(put).catch(() => caches.match(r).then(m => m || caches.match('./')))); return; }
  const fresh = !own || /[?&]v=/.test(url.search); // versioned code and CDN files never change; other files refresh in the background
  e.respondWith(caches.match(r).then(m => { if (m && fresh) return m; const net = fetch(r).then(put); if (m) { e.waitUntil(net.catch(() => {})); return m; } return net; }));
});
