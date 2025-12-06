// ----------------------------------------------------
// CONFIG
// ----------------------------------------------------
const APP_CACHE = "app-shell-v2";
const API_CACHE = "api-cache-v2";

// BACKEND REAL
const API_BASE = "https://pwa-horaxhora-backend.onrender.com";

// Donde guardaremos el token del usuario
let AUTH_TOKEN = null;

// ----------------------------------------------------
// RECIBIR TOKEN DESDE EL FRONTEND
// ----------------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data?.type === "SET_TOKEN") {
    AUTH_TOKEN = event.data.token;
    console.log("[SW] Token recibido del frontend:", AUTH_TOKEN);
  }
});

// ----------------------------------------------------
// INSTALL
// ----------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    const assets = [
      "/",
      "/index.html",
      "/manifest.json",
      "/favicon.ico",
      "/logo192.png",
      "/logo512.png",
    ];

    for (const path of assets) {
      try {
        const res = await fetch(path, { cache: "reload" });
        if (res.ok) await cache.put(path, res.clone());
      } catch (err) {
        console.warn("[SW] No se pudo cachear:", path);
      }
    }
  })());
  self.skipWaiting();
});

// ----------------------------------------------------
// ACTIVATE: limpia caches viejos
// ----------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![APP_CACHE, API_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ----------------------------------------------------
// IndexedDB helpers
// ----------------------------------------------------
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("horaxhora-db", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("pending-activities")) {
        db.createObjectStore("pending-activities", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addPending(obj) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending-activities", "readwrite");
    const req = tx.objectStore("pending-activities").add(obj);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

async function getPendings() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending-activities", "readonly");
    const req = tx.objectStore("pending-activities").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

async function removePending(id) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending-activities", "readwrite");
    const req = tx.objectStore("pending-activities").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ----------------------------------------------------
// BACKGROUND SYNC
// ----------------------------------------------------
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-actividades") {
    event.waitUntil(syncPendingActivities());
  }
});

async function syncPendingActivities() {
  const pendings = await getPendings();

  for (const p of pendings) {
    try {
      const res = await fetch(p.url, {
        method: p.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: AUTH_TOKEN ? `Bearer ${AUTH_TOKEN}` : "",
        },
        body: JSON.stringify(p.body),
      });

      if (res.ok) {
        console.log("[SW] Enviado correctamente:", p.id);
        await removePending(p.id);
      } else {
        console.warn("[SW] Rechazado por el servidor:", res.status);
      }
    } catch (err) {
      console.warn("[SW] Error de red, reintentará luego");
      return;
    }
  }
}

// ----------------------------------------------------
// FETCH HANDLER
// ----------------------------------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // -------------------------
  // SPA navigation
  // -------------------------
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("/index.html").then((cached) => cached || fetch(req))
    );
    return;
  }

  // -------------------------
  // STATIC FILES
  // -------------------------
  if (req.method === "GET" && url.pathname.startsWith("/static/")) {
    event.respondWith(
      caches.open(APP_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;

        try {
          const net = await fetch(req);
          if (net.ok) cache.put(req, net.clone());
          return net;
        } catch {
          return new Response("Offline", { status: 503 });
        }
      })
    );
    return;
  }

  // -------------------------
  // API GET — network first
  // -------------------------
  if (req.method === "GET" && url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then(async (net) => {
          const cache = await caches.open(API_CACHE);
          if (net.ok) cache.put(req, net.clone());
          return net;
        })
        .catch(async () => {
          const cache = await caches.open(API_CACHE);
          const cached = await cache.match(req);
          return (
            cached ||
            new Response(JSON.stringify({ error: "Offline" }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            })
          );
        })
    );
    return;
  }

  // ----------------------------------------------------
  // POST /api/solicitudes — MODO OFFLINE
  // ----------------------------------------------------
  if (req.method === "POST" && url.pathname.startsWith("/api/solicitudes")) {
    event.respondWith(
      (async () => {
        let body = null;
        try {
          body = await req.clone().json();
        } catch {}

        try {
          const res = await fetch(req);
          return res; // si funciona online, regresamos server response
        } catch (err) {
          console.warn("[SW] No hay red, guardando en IDB…");

          await addPending({
            url: API_BASE + url.pathname,
            method: "POST",
            body,
            createdAt: new Date().toISOString(),
          });

          if (self.registration?.sync) {
            try {
              await self.registration.sync.register("sync-actividades");
            } catch {}
          }

          return new Response(
            JSON.stringify({
              ok: false,
              message: "Offline. Actividad guardada. Se enviará al reconectar.",
            }),
            { status: 202, headers: { "Content-Type": "application/json" } }
          );
        }
      })()
    );
  }
});

