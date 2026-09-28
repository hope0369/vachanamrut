// Offline support. The site is index.html plus two data files, so caching them makes every
// discourse readable with no connection. The page opens from the cache straight away and is
// refreshed in the background, so a new build shows on the next open.
// Bump VERSION only when this file's caching logic changes, not for content updates.
const VERSION = 'v1';
// Cache names start with vach- because hope0369.github.io is shared with other projects.
const PAGE = 'vach-page-' + VERSION;
const FONTS = 'vach-fonts-' + VERSION;
const PRECACHE = ['./', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(PAGE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    // hope0369.github.io is shared with other projects, so only clear this site's own old caches.
    .then(keys => Promise.all(keys.filter(k => /^vach-(page|fonts)-v\d+$/.test(k) && k !== PAGE && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Serve from the cache, then update the cache from the network.
function staleWhileRevalidate(cacheName, request, cacheKey){
  return caches.open(cacheName).then(cache => cache.match(cacheKey).then(cached => {
    const fresh = fetch(request).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(cacheKey, res.clone());
      return res;
    });
    if (cached){ fresh.catch(() => {}); return cached; }
    return fresh;
  }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Every page view is the same single-page app; routes live in the #hash.
  if (req.mode === 'navigate' && url.origin === location.origin){
    e.respondWith(staleWhileRevalidate(PAGE, req, './'));
    return;
  }
  // The text (text-…) and the transliteration and footnotes (extra-…): each file name carries a hash of its
  // contents, so a cached copy is always right. Serve it from the cache; when a new build brings a new name, drop the old one.
  if (url.origin === location.origin && /\/(text|extra)-[0-9a-f]+\.json$/.test(url.pathname)){
    e.respondWith(caches.open(PAGE).then(cache => cache.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok){
        cache.put(req, res.clone());
        cache.keys().then(keys => keys.forEach(k => { const p = new URL(k.url).pathname; const kind = url.pathname.match(/\/(text|extra)-/)[1]; if (new RegExp('/' + kind + '-[0-9a-f]+\\.json$').test(p) && p !== url.pathname) cache.delete(k); }));
      }
      return res;
    }))));
    return;
  }
  if (url.origin === location.origin){
    e.respondWith(staleWhileRevalidate(PAGE, req, req));
    return;
  }
  // Google Fonts: the stylesheet can change, the font files never do.
  if (url.hostname === 'fonts.googleapis.com'){
    e.respondWith(staleWhileRevalidate(FONTS, req, req));
    return;
  }
  if (url.hostname === 'fonts.gstatic.com'){
    e.respondWith(caches.open(FONTS).then(cache => cache.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }))));
  }
});
