const STATIC = 'static-v4';
const API = 'api-v1';

// לא נחסום את api.js בקאש כדי שתמיד יגיע עדכני
const ASSETS = [
  '/', '/index.html',
  '/home.html', '/admin.html', '/respond.html', '/add-task.html',
  '/assets/css/styles.css', '/favicon.ico'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(STATIC);
    await Promise.allSettled(
      ASSETS.map(path => fetch(path).then(r => r.ok && cache.put(path, r.clone()))
                        .catch(()=>{}))
    );
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // מחיקת גרסאות ישנות
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== STATIC && k !== API) ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // JSONP ל־Apps Script: SWR
  if (url.pathname.includes('/macros/s/')) {
    e.respondWith((async () => {
      const cache = await caches.open(API);
      const cached = await cache.match(e.request);
      try {
        const fresh = await fetch(e.request);
        cache.put(e.request, fresh.clone());
        return fresh;
      } catch (_) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // ל־api.js – תמיד רשת תחילה (כדי לקבל עדכונים מיידית)
  if (url.pathname.endsWith('/assets/js/api.js')) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(e.request, { cache: 'no-store' });
        return fresh;
      } catch {
        const cache = await caches.open(STATIC);
        return (await cache.match('/assets/js/api.js')) || fetch(e.request);
      }
    })());
    return;
  }

  // שאר הסטטיים – cache-first
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
