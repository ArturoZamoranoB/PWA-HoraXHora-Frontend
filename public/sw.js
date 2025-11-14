const APP_CACHE = "app-shell-v1";
const API_CACHE = "api-cache-v1";

const ORIGIN = self.location.origin;

const APP_ASSETS = [
  "/",                    
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
  "/logo192.png",
  "/logo512.png",


  "/static/js/bundle.js",
  "/static/css/main.css", 
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => {
      return cache.addAll(APP_ASSETS.map((url) => ORIGIN + url));
    })
  );
  self.skipWaiting();
});


self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![APP_CACHE, API_CACHE].includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});


self.addEventListener("fetch", (event) => {
  const req = event.request;


  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP_CACHE);
        const cached =
          (await cache.match(ORIGIN + "/index.html")) ||
          (await cache.match("/index.html")) ||
          (await cache.match("index.html"));

        if (cached) {
          return cached; 
        }

        try {
          return await fetch(req);
        } catch (err) {
          return new Response("Sin conexión y sin app cacheada 😭", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
      })()
    );
    return;
  }

  const isAppAsset =
    APP_ASSETS.includes(url.pathname) ||
    url.pathname.startsWith("/static/"); 

  if (isAppAsset) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;

        try {
          const network = await fetch(req);
          cache.put(req, network.clone());
          return network;
        } catch (err) {
          return new Response("Recurso no disponible offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
      })()
    );
    return;
  }

  // 3️⃣ API: network-first con fallback a caché
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(req);
          const cache = await caches.open(API_CACHE);
          cache.put(req, network.clone());
          return network;
        } catch (err) {
          const cache = await caches.open(API_CACHE);
          const cached = await cache.match(req);
          if (cached) return cached;
          return new Response(
            JSON.stringify({ error: "Sin conexión y sin datos cacheados" }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      })()
    );
    return;
  }
});
