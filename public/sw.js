// ----------------------------------------------------
// CONFIG
// ----------------------------------------------------
const APP_CACHE = "app-shell-v4";
const API_CACHE = "api-cache-v4";

const API_BASE = "https://pwa-horaxhora-backend.onrender.com";

let AUTH_TOKEN = null;

// ----------------------------------------------------
// RECIBIR TOKEN DESDE EL FRONTEND
// ----------------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data?.type === "SET_TOKEN") {
    AUTH_TOKEN = event.data.token;
    console.log("[SW] Token recibido:", AUTH_TOKEN);
  }
});

// ----------------------------------------------------
// SAFE JSON
// ----------------------------------------------------
async function safeReadJson(req) {
  try {
    return await req.clone().json();
  } catch {
    return {};
  }
}

// ----------------------------------------------------
// INSTALL
// ----------------------------------------------------
self.addEventListener("install", (event) => {
  console.log("[SW] Instalado");
  self.skipWaiting();
});

// ----------------------------------------------------
// ACTIVATE
// ----------------------------------------------------
self.addEventListener("activate", (event) => {
  console.log("[SW] Activado");
  event.waitUntil(clients.claim());
});

// ----------------------------------------------------
// IndexedDB HELPERS
// ----------------------------------------------------
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("horaxhora-db", 2);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains("pending-activities")) {
        db.createObjectStore("pending-activities", { keyPath: "id", autoIncrement: true });
      }

      if (!db.objectStoreNames.contains("accepted-activities")) {
        db.createObjectStore("accepted-activities", { keyPath: "id", autoIncrement: true });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- CREATE OFFLINE ---
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

// --- ACCEPT OFFLINE ---
async function addPendingAccept(obj) {
  const db = await openIDB();
  db.transaction("accepted-activities", "readwrite").objectStore("accepted-activities").add(obj);
}

async function getPendingAccepts() {
  const db = await openIDB();
  return db.transaction("accepted-activities", "readonly").objectStore("accepted-activities").getAll();
}

async function removePendingAccept(id) {
  const db = await openIDB();
  db.transaction("accepted-activities", "readwrite").objectStore("accepted-activities").delete(id);
}

// ----------------------------------------------------
// BACKGROUND SYNC
// ----------------------------------------------------
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-create") {
    event.waitUntil(syncCreate());
  }

  if (event.tag === "sync-accept") {
    event.waitUntil(syncAccept());
  }
});

async function syncCreate() {
  const pendings = await getPendingCreates();

  for (const p of pendings) {
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: AUTH_TOKEN ? `Bearer ${AUTH_TOKEN}` : "",
        },
        body: JSON.stringify(p.payload),
      });

      if (res.ok) {
        console.log("[SW] Actividad creada sincronizada");
        await removePendingCreate(p.id);
      }
    } catch {
      return;
    }
  }
}

async function syncAccept() {
  const pendings = await getPendingAccepts();

  for (const p of pendings) {
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: {
          Authorization: p.token,
        },
      });

      if (res.ok) {
        console.log("[SW] Actividad aceptada sincronizada");
        await removePendingAccept(p.id);
      }
    } catch {
      return;
    }
  }
}

// ----------------------------------------------------
// FETCH LISTENER
// ----------------------------------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ================================================
  // OFFLINE CREATE (POST /solicitudes)
  // ================================================
  if (req.method === "POST" && url.pathname === "/api/solicitudes") {
    event.respondWith(
      (async () => {
        const body = await safeReadJson(req);
        try {
          return await fetch(req);
        } catch {
          console.warn("[SW] Offline → guardando creación");
          await addPendingCreate({
            url: API_BASE + url.pathname,
            method: "POST",
            payload: body,
            id: Date.now(),
          });

          if (self.registration?.sync) {
            await self.registration.sync.register("sync-create");
          }

          return new Response(
            JSON.stringify({ offline: true, message: "Guardado offline" }),
            { status: 202, headers: { "Content-Type": "application/json" } }
          );
        }
      })()
    );
    return;
  }

  // ================================================
  // OFFLINE ACCEPT (POST /solicitudes/:id/aceptar)
  // ================================================
  if (req.method === "POST" && url.pathname.endsWith("/aceptar")) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          console.warn("[SW] Offline → guardando aceptación");

          await addPendingAccept({
            url: req.url,
            method: "POST",
            token: req.headers.get("Authorization"),
            id: Date.now(),
          });

          if (self.registration?.sync) {
            await self.registration.sync.register("sync-accept");
          }

          return new Response(
            JSON.stringify({ offline: true, message: "Aceptación guardada offline" }),
            { status: 202, headers: { "Content-Type": "application/json" } }
          );
        }
      })()
    );
    return;
  }

  // ================================================
  // STATIC / GET normal
  // ================================================
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

