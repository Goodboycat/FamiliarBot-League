(function () {
  const DB_NAME = "FamiliarBotAssets";
  const DB_VERSION = 3;
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

  async function getAsset(key) {
    return readRecord(key);
  }

  async function saveAsset(key, value, options = {}) {
    const blob = value instanceof Blob ? value : new Blob([value], {
      type: options.contentType || "application/octet-stream"
    });

    const record = {
      blob,
      contentType: options.contentType || blob.type || "application/octet-stream",
      savedAt: Date.now(),
      version: options.version || DB_VERSION
    };

    if (options.asText) {
      record.text = await blob.text();
    }

    return writeRecord(key, record);
  }

  async function fetchAsset(path, options = {}) {
    const key = options.key || normalizeKey(path);
    const cached = await readRecord(key);

    if (cached) {
      return {
        ...cached,
        key,
        fromCache: true
      };
    }

    let response;
    try {
      response = await fetch(key, { cache: "force-cache" });
    } catch (err) {
      // Network error / CORS / offline. With bots-not-ready fallback we don't
      // want one missing asset to abort the whole boot — surface as null.
      if (options.optional !== false) {
        console.warn(`[AssetCache] network error for ${path}: ${err.message} — using fallback`);
        return null;
      }
      throw err;
    }

    if (!response.ok) {
      if (options.optional !== false) {
        console.warn(`[AssetCache] missing asset (${response.status}): ${path} — using fallback`);
        return null;
      }
      throw new Error(`Could not load ${path}`);
    }

    const blob = await response.blob();
    const record = await saveAsset(key, blob, {
      asText: options.asText,
      contentType: response.headers.get("content-type") || blob.type || "application/octet-stream"
    });

    return {
      ...record,
      key,
      fromCache: false
    };
  }

  async function fetchJson(path, options = {}) {
    // JSON configs are required for the screens to render — by default we
    // still throw if they're missing. Pass { optional: true } for bot-level
    // JSON files (power.json / weapon.json / loadout.json) that may not
    // exist yet while the bots are still being built.
    const record = await fetchAsset(path, { asText: true, optional: options.optional === true });
    if (!record) return null;
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
    openDB,
    saveAsset
  };
})();
