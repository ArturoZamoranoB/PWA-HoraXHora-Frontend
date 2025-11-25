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

  // rutas estáticas típicas de CRA (ajusta si tus nombres difieren)
  "/static/js/bundle.js",
  "/static/css/main.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => {
      return cache.addAll(APP_ASSETS);
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

/* -----------------------------
   IndexedDB helpers dentro del SW
   (misma DB/Store que usas en el cliente)
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
        // Intentamos reenviar al endpoint original guardado en la cola
        const res = await fetch(p.url, {
          method: p.method,
          headers: p.headers || { "Content-Type": "application/json" },
          body: p.body ? JSON.stringify(p.body) : undefined,
        });

        if (res.ok) {
          await removePendingInSW(p.id);
        } else {
          // Si el servidor responde con error (4xx/5xx) se mantiene en cola
          console.warn("SW: no se pudo subir pendiente (server):", res.status);
        }
      } catch (err) {
        // Error de red: abortamos para reintentar más tarde
        console.warn("SW: error de red al enviar pendiente:", err);
        return;
      }
    }
  } catch (err) {
    console.error("SW: error al sincronizar pendientes:", err);
  }
}

/* -----------------------------
   Mensajes desde la página (opcional)
   Permite al cliente enviar info al SW (ej: token)
   ----------------------------- */
self.addEventListener("message", (event) => {
  // ejemplo: guardar token u otras señales. Aquí solo logueamos.
  try {
    const data = event.data;
    console.log("SW recibió mensaje:", data);
    // Si quieres guardar el token para usarlo en sync,
    // podrías guardarlo también en IndexedDB aquí.
  } catch (err) {
    console.warn("SW message handler error:", err);
  }
});

/* -----------------------------
   Fetch handler: assets, navigate y API
   - GET app assets: cache-first
   - navigate: servir index.html cacheado si existe
   - API (/api/*): network-first con fallback a cache
   - POST a /api/solicitudes: si falla la red -> almacenar en IndexedDB para reenviar
   ----------------------------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET" && req.method !== "POST") return; // sólo tratamos GET/POST

  const url = new URL(req.url);

  // navegación SPA -> devolver index.html de cache si existe
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

  // assets: cache-first (pero intenta actualizar en segundo plano)
  if (isAppAsset && req.method === "GET") {
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

  // API: network-first con fallback a caché (GET)
  if (url.pathname.startsWith("/api/") && req.method === "GET") {
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

  // POST a /api/solicitudes -> intentamos enviar, si falla guardamos en IndexedDB
  if (url.pathname.startsWith("/api/solicitudes") && req.method === "POST") {
    event.respondWith(
      (async () => {
        // clonamos la request para leer el body
        let reqClone = req.clone();
        let body = null;
        try {
          body = await reqClone.json();
        } catch (err) {
          // si no es JSON o no se puede parsear, intenta text
          try {
            const text = await reqClone.text();
            body = text || null;
          } catch {
            body = null;
          }
        }

        // intentamos enviar a la red
        try {
          const networkRes = await fetch(req);
          // si ok devolvemos la respuesta de red
          return networkRes;
        } catch (err) {
          // fallo de red -> guardamos en IndexedDB y registramos sync
          try {
            // guardamos: url, method, headers (solo autorization y content-type), body y createdAt
            const headers = {};
            const h = req.headers.get("authorization");
            if (h) headers.authorization = h;
            const contentType = req.headers.get("content-type");
            if (contentType) headers["content-type"] = contentType;

            await addPendingInSW({
              url: url.pathname, // se enviará usando /api/solicitudes
              method: "POST",
              headers,
              body,
              createdAt: new Date().toISOString(),
            });

            // registramos sync si es posible
            if (self.registration && self.registration.sync) {
              try {
                await self.registration.sync.register("sync-actividades");
              } catch (err2) {
                console.warn("SW: no pudo registrar sync:", err2);
              }
            }

            // devolvemos respuesta simulada informando que quedó en cola
            return new Response(
              JSON.stringify({
                ok: false,
                message: "Sin conexión. Actividad guardada en cola y será enviada al reconectar.",
              }),
              {
                status: 202,
                headers: { "Content-Type": "application/json" },
              }
            );
          } catch (errSave) {
            console.error("SW: error al guardar pendiente:", errSave);
            return new Response(JSON.stringify({ error: "No se pudo guardar la petición" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
      })()
    );

    return;
  }

  // para otros requests no manejados, dejamos que el navegador haga fetch normalmente
});
