// public/sw.js (actualizado)
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
  // NO incluir archivos generados con hash (no poner main.<hash>.js aquí)
];

/* -----------------------------
   Install robusto: cachea uno a uno sin abortar si falla
   ----------------------------- */
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    for (const path of APP_ASSETS) {
      const url = ORIGIN + path;
      try {
        const res = await fetch(url, { cache: "reload" });
        if (!res || !res.ok) {
          console.warn("[SW] precache failed (status):", url, res && res.status);
          continue;
        }
        await cache.put(url, res.clone());
        console.log("[SW] cached:", path);
      } catch (err) {
        console.warn("[SW] precache error for", url, err);
        // seguimos con el siguiente recurso, no abortamos install
      }
    }
  })());
  self.skipWaiting();
});

/* -----------------------------
   Activate: limpiar caches viejos
   ----------------------------- */
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

/* -----------------------------
   IndexedDB helpers dentro del SW
   ----------------------------- */
function openIDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("horaxhora-db", 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("pending-activities")) {
        db.createObjectStore("pending-activities", { keyPath: "id", autoIncrement: true });
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function addPendingInSW(obj) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending-activities", "readwrite");
    const store = tx.objectStore("pending-activities");
    const req = store.add(obj);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllPendingInSW() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending-activities", "readonly");
    const store = tx.objectStore("pending-activities");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function removePendingInSW(id) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending-activities", "readwrite");
    const store = tx.objectStore("pending-activities");
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* -----------------------------
   Sync: reintentar pendientes
   ----------------------------- */
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-actividades") {
    event.waitUntil(syncPendingActivities());
  }
});

async function syncPendingActivities() {
  try {
    const pendings = await getAllPendingInSW();
    for (const p of pendings) {
      try {
        const res = await fetch(p.url, {
          method: p.method,
          headers: p.headers || { "Content-Type": "application/json" },
          body: p.body ? JSON.stringify(p.body) : undefined,
        });

        if (res && res.ok) {
          await removePendingInSW(p.id);
          console.log("[SW] pending sent and removed id:", p.id);
        } else {
          console.warn("[SW] server rejected pending:", p.id, res && res.status);
        }
      } catch (err) {
        console.warn("[SW] network error while sending pending, will retry later:", err);
        // salimos para reintentar más tarde (no eliminamos)
        return;
      }
    }
  } catch (err) {
    console.error("[SW] error syncing pendings:", err);
  }
}

/* -----------------------------
   Message handler (opcional)
   ----------------------------- */
self.addEventListener("message", (event) => {
  try {
    const data = event.data;
    console.log("SW received message:", data);
    // Puedes guardar token en IDB aquí si quieres usarlo en sync
  } catch (err) {
    console.warn("SW message handler error:", err);
  }
});

/* -----------------------------
   Fetch handler:
   - navigation: cache-first (index.html) with network fallback
   - /static/: runtime cache-first (so hashed bundles work automatically)
   - GET /api/: network-first with cache fallback
   - POST /api/solicitudes: try network; on failure queue in IDB
   ----------------------------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET and POST
  if (req.method !== "GET" && req.method !== "POST") return;

  // SPA navigation -> serve index.html from cache if exists
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached = await cache.match(ORIGIN + "/index.html") || await cache.match("/index.html") || await cache.match("index.html");
      if (cached) return cached;
      try {
        return await fetch(req);
      } catch (err) {
        // fallback: return root page cached or a plain response
        const rootCached = await cache.match(ORIGIN + "/") || await cache.match("/");
        if (rootCached) return rootCached;
        return new Response("Sin conexión y sin app cacheada 😭", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  // Runtime cache for static assets (hashed bundles) - cache-first
  if (req.method === "GET" && url.pathname.startsWith("/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const netRes = await fetch(req);
        if (netRes && netRes.ok) await cache.put(req, netRes.clone());
        return netRes;
      } catch (err) {
        const fallback = await cache.match(req);
        if (fallback) return fallback;
        return new Response("Recurso no disponible offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  // API GET: network-first with cache fallback
  if (req.method === "GET" && url.pathname.startsWith("/api/")) {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(API_CACHE);
        if (net && net.ok) await cache.put(req, net.clone());
        return net;
      } catch (err) {
        const cache = await caches.open(API_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: "Sin conexión y sin datos cacheados" }), { status: 503, headers: { "Content-Type": "application/json" } });
      }
    })());
    return;
  }

  // POST /api/solicitudes: try network, on failure store in IDB and register sync
  if (req.method === "POST" && url.pathname.startsWith("/api/solicitudes")) {
    event.respondWith((async () => {
      let clone = req.clone();
      let body = null;
      try { body = await clone.json(); } catch { try { body = await clone.text(); } catch { body = null; } }

      try {
        const netRes = await fetch(req);
        return netRes;
      } catch (err) {
        try {
          const headers = {};
          const h = req.headers.get("authorization");
          if (h) headers.authorization = h;
          const ct = req.headers.get("content-type");
          if (ct) headers["content-type"] = ct;

          await addPendingInSW({
            url: url.pathname,
            method: "POST",
            headers,
            body,
            createdAt: new Date().toISOString()
          });

          if (self.registration && self.registration.sync) {
            try { await self.registration.sync.register("sync-actividades"); } catch (e) { console.warn("[SW] sync register failed:", e); }
          }

          return new Response(JSON.stringify({ ok: false, message: "Sin conexión. Actividad guardada y será enviada al reconectar." }), { status: 202, headers: { "Content-Type": "application/json" } });
        } catch (saveErr) {
          console.error("[SW] error saving pending:", saveErr);
          return new Response(JSON.stringify({ error: "Error al guardar petición offline" }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      }
    })());
    return;
  }

  // For other requests, let the network handle them
});
