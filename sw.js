const STATIC = 'static-v2';

const ASSETS = [
    '/', '/index.html',
    '/home.html', '/admin.html', '/respond.html', '/add-task.html',
    '/assets/js/api.js', '/assets/css/styles.css',
    '/favicon.ico'
];

self.addEventListener('install', e => {
    e.waitUntil((async () => {
        const cache = await caches.open(STATIC);
        await Promise.allSettled(
            ASSETS.map(async (url) => {
                try {
                    const resp = await fetch(url, { cache: 'no-cache' });
                    if (resp.ok) await cache.put(url, resp);
                } catch (err) { /* skip */ }
            })
        );
    })());
});

self.addEventListener('activate', e => {
    e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // בקשות ל-Apps Script (macros) – רשת בלבד (למנוע קאש ישן/עיכובים)
    if (url.hostname.endsWith('script.google.com') || url.pathname.includes('/macros/s/')) {
        e.respondWith(fetch(e.request));
        return;
    }

    // סטטיים – cache-first
    e.respondWith(
        caches.match(e.request).then(r => r || fetch(e.request))
    );
});