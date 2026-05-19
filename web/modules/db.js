import { DB_NAME, DB_VERSION, STORE_NAME, SUPPLY_STORE_NAME } from './context.js';

// ─── IndexedDB 数据库 ──────────────────────────────────
export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(SUPPLY_STORE_NAME)) {
        const supplyStore = db.createObjectStore(SUPPLY_STORE_NAME, { keyPath: "cacheKey" });
        supplyStore.createIndex("updatedAt", "updatedAt");
        supplyStore.createIndex("city", "city");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── 行程 CRUD ────────────────────────────────────────
export async function saveTrip(id, title, summary, content, messages) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const now = new Date().toISOString();
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      const record = {
        id, title, summary, content, messages,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve(record);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function listTrips() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("updatedAt");
    const req = index.openCursor(null, "prev");
    const results = [];
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function loadTripById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTripById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── 补给点 CRUD ────────────────────────────────────────
export async function saveSupplyPointsToCache(city, points) {
  try {
    const db = await openDB();
    const tx = db.transaction(SUPPLY_STORE_NAME, "readwrite");
    const store = tx.objectStore(SUPPLY_STORE_NAME);
    const now = new Date().toISOString();
    for (const p of points) {
      const cacheKey = `${city}:${p.name}`;
      const record = { cacheKey, city, name: p.name, point: p, updatedAt: now };
      store.put(record);
    }
  } catch (err) {
    console.warn("[SupplyCache] 保存到 IndexedDB 失败:", err);
  }
}

export async function loadSupplyPointsFromCache(city, names) {
  try {
    const db = await openDB();
    const tx = db.transaction(SUPPLY_STORE_NAME, "readonly");
    const store = tx.objectStore(SUPPLY_STORE_NAME);
    const results = [];
    for (const name of names) {
      const cacheKey = `${city}:${name}`;
      const record = await new Promise((resolve) => {
        const req = store.get(cacheKey);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (record) results.push(record.point);
    }
    return results;
  } catch (err) {
    console.warn("[SupplyCache] 从 IndexedDB 读取失败:", err);
    return [];
  }
}

export async function clearExpiredSupplyCache(maxAgeDays = 30) {
  try {
    const db = await openDB();
    const tx = db.transaction(SUPPLY_STORE_NAME, "readwrite");
    const store = tx.objectStore(SUPPLY_STORE_NAME);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    const cutoffStr = cutoff.toISOString();
    let deleted = 0;
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value.updatedAt < cutoffStr) {
          store.delete(cursor.primaryKey);
          deleted++;
        }
        cursor.continue();
      }
    };
    return deleted;
  } catch (err) {
    console.warn("[SupplyCache] 清理过期缓存失败:", err);
    return 0;
  }
}