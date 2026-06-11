(function () {
  const DB_NAME = "FamiliarBotAssets";
  const DB_VERSION = 2;
  const STORE_NAME = "assets";

  let dbPromise = null;

  function openDB() {
    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is not available in this browser."));
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }

        db.createObjectStore(STORE_NAME);
      };

      req.onsuccess = (event) => resolve(event.target.result);
      req.onerror = () => reject(req.error);
    });

    return dbPromise;
  }

  async function readRecord(key) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function writeRecord(key, record) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).put(record, key);

      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  }

  function normalizeKey(path) {
    return new URL(path, window.location.href).href;
  }

  async function getAsset(path) {
    return readRecord(normalizeKey(path));
  }

  async function fetchAsset(path, options = {}) {
    const key = normalizeKey(path);
    const cached = await readRecord(key);

    if (cached) {
      return {
        ...cached,
        key,
        fromCache: true
      };
    }

    const response = await fetch(key, { cache: "force-cache" });

    if (!response.ok) {
      throw new Error(`Could not load ${path}`);
    }

    const blob = await response.blob();
    const record = {
      blob,
      contentType: response.headers.get("content-type") || blob.type || "application/octet-stream",
      savedAt: Date.now(),
      version: DB_VERSION
    };

    if (options.asText) {
      record.text = await blob.text();
    }

    await writeRecord(key, record);

    return {
      ...record,
      key,
      fromCache: false
    };
  }

  async function fetchJson(path) {
    const record = await fetchAsset(path, { asText: true });
    const text = record.text || await record.blob.text();

    return JSON.parse(text);
  }

  async function getObjectUrl(path) {
    const record = await fetchAsset(path);
    return URL.createObjectURL(record.blob);
  }

  window.FamiliarBotAssetCache = {
    DB_NAME,
    DB_VERSION,
    fetchAsset,
    fetchJson,
    getAsset,
    getObjectUrl,
    openDB
  };
})();
