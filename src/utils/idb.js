// src/utils/idb.js
const DB_NAME = "horaxhora-db";
const DB_VERSION = 2; // SUBIMOS LA VERSION
const STORE = "pending-activities";
const STORE_ACCEPT = "accepted-activities";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (ev) => {
      const db = req.result;

      // Store de crear actividades
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }

      // NUEVO store para aceptaciones offline
      if (!db.objectStoreNames.contains(STORE_ACCEPT)) {
        db.createObjectStore(STORE_ACCEPT, { keyPath: "id", autoIncrement: true });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}


export async function addPendingActivity(obj) {
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).add(obj);
  return tx.complete;
}

export async function getAllPendingActivities() {
  const db = await openDB();
  const tx = db.transaction(STORE, "readonly");
  return tx.objectStore(STORE).getAll();
}

export async function removePendingActivity(id) {
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  return tx.complete;
}


export async function addPendingAccept(obj) {
  const db = await openDB();
  const tx = db.transaction(STORE_ACCEPT, "readwrite");
  tx.objectStore(STORE_ACCEPT).add(obj);
  return tx.complete;
}

export async function getAllPendingAccepts() {
  const db = await openDB();
  const tx = db.transaction(STORE_ACCEPT, "readonly");
  return tx.objectStore(STORE_ACCEPT).getAll();
}

export async function removePendingAccept(id) {
  const db = await openDB();
  const tx = db.transaction(STORE_ACCEPT, "readwrite");
  tx.objectStore(STORE_ACCEPT).delete(id);
  return tx.complete;
}
