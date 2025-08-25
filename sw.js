/* ⚡ sw.optimized.js — precache + SWR + special caching for Apps Script JSONP */
const VERSION = "v7-2025-08-25";
const PRECACHE_URLS = [
  "/", "/index.html", "/home.html", "/respond.html", "/admin.html", "/add-task.html",
  "/assets/css/styles.css", "/assets/js/api.js"
];
const RUNTIME = "runtime-" + VERSION;
const INIT = "init-" + VERSION;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(RUNTIME).then((cache) => cache.addAll(PRECACHE_URLS.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => ![RUNTIME, INIT].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Apps Script JSONP — action=getInitData -> stale-while-revalidate, no-store on network
  if (url.host === "script.google.com" && url.pathname.includes("/macros/") && url.search.includes("action=getInitData")) {
    event.respondWith(staleWhileRevalidateJSONP(req));
    return;
  }

  // HTML documents — SWR for instant nav back/forward
  const accept = req.headers.get("accept") || "";
  if (req.destination === "document" || accept.includes("text/html")) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Static assets — cache first
  if (["style", "script", "font", "image"].includes(req.destination)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // default SWR
  event.respondWith(staleWhileRevalidate(req));
});

async function cacheFirst(req) {
  const c = await caches.open(RUNTIME);
  const hit = await c.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  c.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const c = await caches.open(RUNTIME);
  const cached = await c.match(req, { ignoreVary: true });
  const net = fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => null);
  return cached || net || fetch(req);
}

async function staleWhileRevalidateJSONP(req) {
  const c = await caches.open(INIT);
  const cached = await c.match(req, { ignoreVary: true });
  const net = fetch(req, { cache: "no-store" }).then((res) => { c.put(req, res.clone()); return res; }).catch(() => null);
  return cached || net || fetch(req);
}
