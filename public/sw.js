// ------------------------------------------
//  CONFIG
// ------------------------------------------
const APP_CACHE = "app-shell-v1";
const API_CACHE = "api-cache-v1";

// 👈 IMPORTANTE: tu backend real
const API_BASE = "https://pwa-horaxhora-backend.onrender.com";

const ORIGIN = self.location.origin;

const APP_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
  "/logo192.png",
  "/logo512.png",
];

// ------------------------------------------
//  INSTALL
// ------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    for (const path of APP_ASSETS) {
      try {
        const res = await fetch(ORIGIN + path, { cache: "reload" });
        if (!res.ok) continue;
        await cache.put(ORIGIN + path, res.clone());
      } catch (err) {
        console.warn("[SW] No se pudo cachear:", path);
      }
    }
  })());
  self.skipWaiting();
});

// ------------------------------------------
//  ACTIVATE: limpiar caches viejos
// ------------------------------------------
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

// ------------------------------------------
//  IndexedDB helpers
// ------------------------------------------
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
    const req = tx.objectStore("pending-activities").add(obj);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllPendingInSW() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending-activities", "readonly");
    const req = tx.objectStore("pending-activities").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function removePendingInSW(id) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending-activities", "readwrite");
    const req = tx.objectStore("pending-activities").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ------------------------------------------
//  Background Sync
// ------------------------------------------
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
          headers: p.headers || {},
          body: p.body ? JSON.stringify(p.body) : undefined,
        });

        if (res.ok) {
          await removePendingInSW(p.id);
          console.log("[SW] Enviado y removido:", p.id);
        } else {
          console.warn("[SW] El servidor rechazó:", p.id, res.status);
        }
      } catch (err) {
        console.warn("[SW] Error de red, reintentará luego:", err);
        return;
      }
    }
  } catch (err) {
    console.error("[SW] Error syncing:", err);
  }
}

// ------------------------------------------
//  FETCH
// ------------------------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET" && req.method !== "POST") return;

  // SPA navigation
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached = await cache.match("/index.html");
      if (cached) return cached;

      try {
        return await fetch(req);
      } catch {
        return new Response("Offline y sin cache 😭", { status: 503 });
      }
    })());
    return;
  }

  // Static runtime cache
  if (req.method === "GET" && url.pathname.startsWith("/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const netRes = await fetch(req);
        if (netRes.ok) cache.put(req, netRes.clone());
        return netRes;
      } catch {
        return new Response("Recurso offline", { status: 503 });
      }
    })());
    return;
  }

  // API GET → network-first
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
        if (cached) return cached;
        return new Response(JSON.stringify({ error: "Offline sin cache" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
    })());
    return;
  }

  // ------------------------------------------
  //  POST /api/solicitudes → OFFLINE HANDLING
  // ------------------------------------------
  if (req.method === "POST" && url.pathname.startsWith("/api/solicitudes")) {
    event.respondWith((async () => {
      let clone = req.clone();
      let body = null;

      try { body = await clone.json(); }
      catch { body = null; }

      try {
        const netRes = await fetch(req);
        return netRes; 
      } catch (err) {
        
        // 🔥 GUARDAR CON URL COMPLETA (FALLABA AQUÍ!)
        await addPendingInSW({
          id: Date.now(),
          url: API_BASE + url.pathname,   // ← CORREGIDO
          method: "POST",
          headers: {
            "Content-Type": req.headers.get("content-type"),
            "Authorization": req.headers.get("authorization"),
          },
          body,
          createdAt: new Date().toISOString(),
        });

        if (self.registration && self.registration.sync) {
          try { await self.registration.sync.register("sync-actividades"); }
          catch {}
        }

        return new Response(
          JSON.stringify({ ok: false, message: "Guardado offline. Se enviará al reconectar." }),
          { status: 202, headers: { "Content-Type": "application/json" } }
        );
      }
    })());
  }
});
