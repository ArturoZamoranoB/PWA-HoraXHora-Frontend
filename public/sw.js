/* ----------------------------------------------------
   CONFIG
---------------------------------------------------- */
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
];

/* ----------------------------------------------------
   SAFE JSON (para evitar body null)
---------------------------------------------------- */
async function safeJson(req) {
  try {
    return await req.clone().json();
  } catch {
    return {};
  }
}

/* ----------------------------------------------------
   INSTALL (robusto)
---------------------------------------------------- */
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    for (const path of APP_ASSETS) {
      const url = ORIGIN + path;
      try {
        const res = await fetch(url, { cache: "reload" });
        if (res && res.ok) {
          await cache.put(url, res.clone());
          console.log("[SW] Cached:", path);
        } else {
          console.warn("[SW] Failed caching:", url, res && res.status);
        }
      } catch (err) {
        console.warn("[SW] Precache error:", url, err);
      }
    }
  })());
  self.skipWaiting();
});

/* ----------------------------------------------------
   ACTIVATE
---------------------------------------------------- */
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

/* ----------------------------------------------------
   INDEXEDDB V2 (crear + aceptar actividad offline)
---------------------------------------------------- */
function openIDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("horaxhora-db", 2);

    r.onupgradeneeded = () => {
      const db = r.result;

      if (!db.objectStoreNames.contains("pending-activities")) {
        db.createObjectStore("pending-activities", { keyPath: "id", autoIncrement: true });
      }

      if (!db.objectStoreNames.contains("pending-accept")) {
        db.createObjectStore("pending-accept", { keyPath: "id", autoIncrement: true });
      }
    };

    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/* ------------------ CREATE ------------------ */
async function addPendingCreate(obj) {
  const db = await openIDB();
  db.transaction("pending-activities", "readwrite").objectStore("pending-activities").add(obj);
}

async function getPendingCreates() {
  const db = await openIDB();
  return db.transaction("pending-activities", "readonly").objectStore("pending-activities").getAll();
}

async function removePendingCreate(id) {
  const db = await openIDB();
  db.transaction("pending-activities", "readwrite").objectStore("pending-activities").delete(id);
}

/* ------------------ ACCEPT ------------------ */
async function addPendingAccept(obj) {
  const db = await openIDB();
  db.transaction("pending-accept", "readwrite").objectStore("pending-accept").add(obj);
}

async function getPendingAccepts() {
  const db = await openIDB();
  return db.transaction("pending-accept", "readonly").objectStore("pending-accept").getAll();
}

async function removePendingAccept(id) {
  const db = await openIDB();
  db.transaction("pending-accept", "readwrite").objectStore("pending-accept").delete(id);
}

/* ----------------------------------------------------
   BACKGROUND SYNC
---------------------------------------------------- */
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-actividades") {
    event.waitUntil(syncPendingActivities());
  }

  if (event.tag === "sync-accepted") {
    event.waitUntil(syncPendingAccepts());
  }
});

/* ------ SYNC CREATE ------ */
async function syncPendingActivities() {
  const pendings = await getPendingCreates();

  for (const p of pendings) {
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: p.headers || { "Content-Type": "application/json" },
        body: JSON.stringify(p.body || {}),
      });

      if (res && res.ok) {
        console.log("[SW] Created synced:", p.id);
        await removePendingCreate(p.id);
      }
    } catch (err) {
      console.warn("[SW] Network error, retry later");
      return;
    }
  }
}

/* ------ SYNC ACCEPT ------ */
async function syncPendingAccepts() {
  const pendings = await getPendingAccepts();

  for (const p of pendings) {
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: p.headers || {},
      });

      if (res.ok) {
        console.log("[SW] Accept synced:", p.id);
        await removePendingAccept(p.id);
      }
    } catch (err) {
      console.warn("[SW] Network error on accept");
      return;
    }
  }
}

/* ----------------------------------------------------
   FETCH HANDLER
---------------------------------------------------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  /* ---------------- SPA navigation ---------------- */
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached =
        (await cache.match(ORIGIN + "/index.html")) ||
        (await cache.match("/index.html")) ||
        (await cache.match("index.html"));

      if (cached) return cached;

      try {
        return await fetch(req);
      } catch {
        const root = (await cache.match(ORIGIN + "/")) || (await cache.match("/"));
        if (root) return root;

        return new Response("Sin conexión y sin app cacheada 😭", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        });
      }
    })());
    return;
  }

  /* ---------------- STATIC / GET hash ---------------- */
  if (req.method === "GET" && url.pathname.startsWith("/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const net = await fetch(req);
        if (net.ok) cache.put(req, net.clone());
        return net;
      } catch {
        return cached || new Response("Recurso no disponible offline", { status: 503 });
      }
    })());
    return;
  }

  /* ---------------- GET API ---------------- */
  if (req.method === "GET" && url.pathname.startsWith("/api/")) {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(API_CACHE);
        if (net.ok) cache.put(req, net.clone());
        return net;
      } catch {
        const cache = await caches.open(API_CACHE);
        const cached = await cache.match(req);
        return (
          cached ||
          new Response(JSON.stringify({ error: "Offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
    })());
    return;
  }

  /* ---------------- POST: CREATE ACTIVITY ---------------- */
  if (req.method === "POST" && url.pathname === "/api/solicitudes") {
    event.respondWith((async () => {
      const body = await safeJson(req);

      try {
        return await fetch(req);
      } catch {
        console.warn("[SW] Offline → saving create");

        await addPendingCreate({
          id: Date.now(),
          url: req.url,
          headers: {
            "Content-Type": "application/json",
            Authorization: req.headers.get("Authorization"),
          },
          body,
        });

        try {
          await self.registration.sync.register("sync-actividades");
        } catch {}

        return new Response(JSON.stringify({ offline: true }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
    })());
    return;
  }

  /* ---------------- POST: ACCEPT ACTIVITY ---------------- */
  if (req.method === "POST" && url.pathname.endsWith("/aceptar")) {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        console.warn("[SW] Offline → saving accept");

        await addPendingAccept({
          id: Date.now(),
          url: req.url,
          headers: {
            Authorization: req.headers.get("Authorization"),
          },
        });

        try {
          await self.registration.sync.register("sync-accepted");
        } catch {}

        return new Response(JSON.stringify({ offline: true }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
    })());
    return;
  }

  /* ---------------- FALLBACK ---------------- */
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

