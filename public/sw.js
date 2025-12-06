const APP_CACHE = "app-shell-v4";
const API_CACHE = "api-cache-v4";

const API_BASE = "https://pwa-horaxhora-backend.onrender.com";

let AUTH_TOKEN = null;


self.addEventListener("message", (event) => {
  if (event.data?.type === "SET_TOKEN") {
    AUTH_TOKEN = event.data.token;
    console.log("[SW] Token recibido:", AUTH_TOKEN);
  }
});


async function safeReadJson(req) {
  try {
    const clone = req.clone();
    return await clone.json();
  } catch (err) {
    console.warn("[SW] safeReadJson falló:", err);
    return {};
  }
}


self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then(async (cache) => {
      const assets = [
        "/",
        "/index.html",
        "/manifest.json",
        "/favicon.ico",
        "/logo192.png",
        "/logo512.png",
      ];

      for (const asset of assets) {
        try {
          const res = await fetch(asset, { cache: "reload" });
          if (res.ok) cache.put(asset, res.clone());
        } catch (err) {
          console.warn("[SW] No se pudo cachear:", asset);
        }
      }
    })
  );

  self.skipWaiting();
});


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
    req.onerror = () => reject(req.error);
  });
}

async function getPendings() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending-activities", "readonly");
    const req = tx.objectStore("pending-activities").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function removePending(id) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending-activities", "readwrite");
    const req = tx.objectStore("pending-activities").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}


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
        body: JSON.stringify(p.payload),
      });

      if (res.ok) {
        console.log("[SW] Sincronizado:", p.id);
        await removePending(p.id);
      } else {
        console.warn("[SW] Server rechazó:", res.status);
      }
    } catch (err) {
      console.warn("[SW] Error de red, reintentará:", err);
      return;
    }
  }
}


self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

 
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("/index.html").then((cached) => cached || fetch(req))
    );
    return;
  }

 
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
          return new Response("Recurso offline", { status: 503 });
        }
      })
    );
    return;
  }


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

 
  if (req.method === "POST" && url.pathname.startsWith("/api/solicitudes")) {
    event.respondWith(
      (async () => {
        const body = await safeReadJson(req);

        try {
          const netRes = await fetch(req);
          return netRes;
        } catch {
          console.warn("[SW] Offline → guardando pending");

          await addPending({
            id: Date.now(),
            url: API_BASE + url.pathname,
            method: "POST",
            payload: body || {},
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
              message: "Actividad guardada offline. Se enviará al reconectar.",
            }),
            { status: 202, headers: { "Content-Type": "application/json" } }
          );
        }
      })()
    );
  }
});