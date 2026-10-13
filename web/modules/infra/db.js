import { DB_NAME, DB_VERSION, STORE_NAME, SUPPLY_STORE_NAME, currentUser } from '../infra/context.js';

// ─── IndexedDB 数据库 ──────────────────────────────────
export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const oldVersion = e.oldVersion;

      // trips store：v1 创建，v3 增加索引
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // 首次创建
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("city", "city");
        store.createIndex("status", "status");
      } else if (oldVersion < 3) {
        // v2 → v3: 删除旧 store 重建（清空旧数据，因为结构变了）
        db.deleteObjectStore(STORE_NAME);
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("city", "city");
        store.createIndex("status", "status");
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

/**
 * 通知行程已变更（云同步监听 travelmap-trip-changed）。
 * 仅 window 存在时派发；失败静默，不影响保存/删除返回值与既有行为。
 */
function notifyTripChanged(id) {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new window.CustomEvent("travelmap-trip-changed", { detail: { id } }));
    }
  } catch {
    // 静默：事件通知失败不应影响主流程
  }
}

/** Snapshot comparison also supports legacy records without localRevision. */
function sameRevision(record, snapshot) {
  return record?.localRevision === snapshot?.localRevision && record?.updatedAt === snapshot?.updatedAt
    && Boolean(record?.deleted) === Boolean(snapshot?.deleted);
}

function isDeleted(record) { return record?.deleted === true || record?.status === "deleted"; }

function compactTombstone(record) {
  const tombstone = { id: record.id, status: "deleted", deleted: true, updatedAt: record.updatedAt };
  for (const key of ["version", "syncOwnerId", "localRevision", "syncState", "syncConflict", "syncExcluded"]) {
    if (record[key] !== undefined) tombstone[key] = record[key];
  }
  return tombstone;
}

/** Execute a record update in one IndexedDB transaction, resolving only after commit. */
async function updateTrip(id, update, notify = false, signal) {
  if (signal?.aborted) return null;
  let db;
  try { db = await openDB(); }
  catch (error) { if (signal?.aborted) return null; throw error; }
  // Cancellation can happen while the database connection is being opened.
  if (signal?.aborted) { db.close?.(); return null; }
  return new Promise((resolve, reject) => {
    let tx;
    let store;
    try {
      tx = db.transaction(STORE_NAME, "readwrite");
      store = tx.objectStore(STORE_NAME);
    } catch (error) { db.close?.(); reject(error); return; }
    let result = null;
    let changed = false;
    let cancelled = false;
    let settled = false;
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', cancel);
      db.close?.();
      if (error) reject(error);
      else resolve(value);
    };
    const cancel = () => {
      cancelled = true;
      try { tx.abort(); }
      catch { finish(null); } // A completed transaction has nothing left to cancel.
    };
    tx.oncomplete = () => {
      if (cancelled || signal?.aborted) { finish(null); return; }
      if (changed && notify && result?.status !== "demo" && !result?.syncExcluded) notifyTripChanged(id);
      finish(result);
    };
    tx.onerror = tx.onabort = () => {
      if (cancelled || signal?.aborted) finish(null);
      else finish(null, tx.error || new Error("IndexedDB transaction failed"));
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    const request = store.get(id);
    request.onsuccess = () => {
      if (settled) return;
      if (signal?.aborted) { cancel(); return; }
      try {
        const record = update(request.result || null);
        if (signal?.aborted) { cancel(); return; }
        result = record;
        if (record && record !== request.result) { store.put(record); changed = true; }
      } catch (error) {
        finish(null, error);
        try { tx.abort(); } catch { /* Already completed or aborted. */ }
      }
    };
  });
}

/** Save a user edit, or import a remote revision without timestamp rewriting/change events.
 * @param {object} trip
 * @param {{source?: string, syncOwnerId?: string, snapshot?: object|null, signal?: AbortSignal}} options
 */
export async function saveTripPlan(trip, options = {}) {
  return updateTrip(trip.id, existing => {
    if (options.source === "remote") {
      if (existing?.syncOwnerId && existing.syncOwnerId !== options.syncOwnerId) return null;
      if ("snapshot" in options && !sameRevision(existing, options.snapshot)) return null;
      if (isDeleted(existing) && !isDeleted(trip)) return null;
      if (existing && ["pending", "conflict"].includes(existing.syncState)) return null;
      const record = { ...trip, syncOwnerId: options.syncOwnerId, syncState: "clean",
        localRevision: (existing?.localRevision || 0) + 1,
        createdAt: trip.createdAt || existing?.createdAt || trip.updatedAt,
        status: trip.status || "active" };
      delete record.syncConflict;
      return isDeleted(record) ? compactTombstone(record) : record;
    }
    // Deletion is permanent for this id. A new itinerary must use a fresh id.
    if (isDeleted(existing)) {
      const error = new Error("This itinerary was deleted. Create a new itinerary to save these changes.");
      error.code = "TRIP_DELETED";
      throw error;
    }
    const now = new Date(Math.max(Date.now(), (Date.parse(existing?.updatedAt || "") || 0) + 1)).toISOString();
    return { ...trip, createdAt: existing?.createdAt || trip.createdAt || now, updatedAt: now,
      status: trip.status || existing?.status || "active", deleted: false,
      version: existing?.version || trip.version,
      syncOwnerId: existing?.syncOwnerId || trip.syncOwnerId || currentUser?.id,
      localRevision: (existing?.localRevision || 0) + 1, syncState: "pending", syncConflict: undefined };
  }, options.source !== "remote", options.source === "remote" ? options.signal : undefined);
}

/** Apply a server ACK only if the sync is active and no user edit/deletion occurred.
 * @param {{signal?: AbortSignal}} options Optional domain cancellation, including database opening.
 */
export async function acknowledgeTripSync(id, snapshot, ack, { signal } = {}) {
  return updateTrip(id, existing => {
    if (!existing || !sameRevision(existing, snapshot)) return null;
    if (existing.syncOwnerId && existing.syncOwnerId !== ack.userId) return null;
    const record = { ...existing, version: ack.version, syncOwnerId: ack.userId, syncState: "clean" };
    delete record.syncConflict;
    return isDeleted(record) ? compactTombstone(record) : record;
  }, false, signal);
}

/** Preserve local content/deletion and expose conflict metadata without scheduling a retry.
 * @param {{signal?: AbortSignal}} options Optional domain cancellation, including database opening.
 */
export async function markTripSyncConflict(id, snapshot, remote, userId, { signal } = {}) {
  return updateTrip(id, existing => {
    if (!existing || !sameRevision(existing, snapshot)) return null;
    if (existing.syncOwnerId && existing.syncOwnerId !== userId) return null;
    const record = { ...existing, syncOwnerId: userId, syncState: "conflict",
      syncConflict: { code: "SYNC_CONFLICT", remoteVersion: remote?.version || null, remoteDeleted: Boolean(remote?.deleted) } };
    return isDeleted(record) ? compactTombstone(record) : record;
  }, false, signal);
}

/** @deprecated Use saveTripPlan. */
export async function saveTrip(id, title, summary, content, messages) {
  return saveTripPlan({ id, title, summary, content, messages });
}

/** @param {{includeDeleted?: boolean}} options */
export async function listTrips({ includeDeleted = false } = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).index("updatedAt").openCursor(null, "prev");
    const results = [];
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        if (includeDeleted || !isDeleted(cursor.value)) results.push(cursor.value);
        cursor.continue();
      } else { db.close?.(); resolve(results); }
    };
    req.onerror = () => { db.close?.(); reject(req.error); };
  });
}

/** @param {string} id @param {{includeDeleted?: boolean}} options */
export async function loadTripById(id, { includeDeleted = false } = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
    req.onsuccess = () => { db.close?.(); resolve(req.result && (includeDeleted || !isDeleted(req.result)) ? req.result : null); };
    req.onerror = () => { db.close?.(); reject(req.error); };
  });
}

/** Hide deleted trips immediately, retaining only reconciliation metadata. */
export async function deleteTripById(id) {
  return updateTrip(id, existing => {
    if (isDeleted(existing)) return existing;
    const updatedAt = new Date(Math.max(Date.now(), (Date.parse(existing?.updatedAt || "") || 0) + 1)).toISOString();
    return compactTombstone({ id, deleted: true, updatedAt, version: existing?.version,
      syncOwnerId: existing?.syncOwnerId, syncExcluded: existing?.syncExcluded || existing?.status === "demo" || Boolean(existing?.tripPlan?.demoNotice), localRevision: (existing?.localRevision || 0) + 1, syncState: "pending" });
  }, true);
}

/** Remove local records without sync events.
 * Account clearing removes only records explicitly owned by ownerId, preserving legacy unowned
 * and other-account records. Omitting ownerId is reserved for an explicit full storage reset.
 * @param {{ownerId?: string}} options
 */
export async function clearTripsLocal({ ownerId } = {}) {
  if (ownerId !== undefined && (typeof ownerId !== "string" || !ownerId.trim())) {
    throw new Error("Account owner identity required");
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    if (ownerId === undefined) store.clear();
    else {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (cursor.value.syncOwnerId === ownerId) store.delete(cursor.primaryKey);
        cursor.continue();
      };
    }
    tx.oncomplete = () => { db.close?.(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close?.(); reject(tx.error); };
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

// ─── 坐标迁移：WGS-84 → GCJ-02 ──────────────────────────
// 历史记录中的坐标是之前存储的 WGS-84 格式
// 需要转换为 GCJ-02 以匹配高德瓦片坐标系

const _PI = 3.14159265358979324;
const _A = 6378245.0;
const _EE = 0.00669342162296594323;

function _outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function _transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * _PI) + 20.0 * Math.sin(2.0 * x * _PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * _PI) + 40.0 * Math.sin(y / 3.0 * _PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * _PI) + 320 * Math.sin(y * _PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function _transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * _PI) + 20.0 * Math.sin(2.0 * x * _PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * _PI) + 40.0 * Math.sin(x / 3.0 * _PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * _PI) + 300.0 * Math.sin(x / 30.0 * _PI)) * 2.0 / 3.0;
  return ret;
}

/** WGS-84 → GCJ-02（将旧数据坐标转换为新格式） */
function wgs84ToGcj02(lat, lng) {
  if (_outOfChina(lat, lng)) return { lat, lng };
  let dLat = _transformLat(lng - 105.0, lat - 35.0);
  let dLng = _transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * _PI;
  let magic = Math.sin(radLat);
  magic = 1 - _EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((_A * (1 - _EE)) / (magic * sqrtMagic) * _PI);
  dLng = (dLng * 180.0) / (_A / sqrtMagic * Math.cos(radLat) * _PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

/**
 * 迁移历史记录中的坐标：WGS-84 → GCJ-02
 * 用于修复旧数据的坐标系问题
 * 只迁移未迁移的记录（通过 _coordMigrated 标记判断）
 */
export async function migrateCoordinatesToGcj02() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    let migrated = 0;
    let skipped = 0;

    // 先检查是否有需要迁移的记录
    const allRecords = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    // 筛选需要迁移的记录
    const needsMigration = allRecords.filter(trip => {
      // 已迁移过的记录跳过
      if (trip._coordMigrated) {
        skipped++;
        return false;
      }
      // 检查是否有坐标数据
      if (!Array.isArray(trip.days)) return false;
      return trip.days.some(day => 
        (day.attractions && day.attractions.some(a => a.location && a.location.latitude)) ||
        (day.hotel && day.hotel.location && day.hotel.location.latitude) ||
        (day.meals && day.meals.some(m => m.restaurant && m.restaurant.location && m.restaurant.location.latitude))
      );
    });

    if (needsMigration.length === 0) {
      console.log(`[DB] 无需迁移 (已跳过 ${skipped} 条已迁移记录)`);
      return 0;
    }

    // 执行迁移
    const tx2 = db.transaction(STORE_NAME, "readwrite");
    const store2 = tx2.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      for (const trip of needsMigration) {
        let updated = false;

        if (Array.isArray(trip.days)) {
          for (const day of trip.days) {
            // 迁移景点坐标
            if (day.attractions) {
              for (const attr of day.attractions) {
                if (attr.location && attr.location.latitude && attr.location.longitude) {
                  const gcj = wgs84ToGcj02(attr.location.latitude, attr.location.longitude);
                  attr.location.latitude = gcj.lat;
                  attr.location.longitude = gcj.lng;
                  updated = true;
                }
              }
            }
            // 迁移酒店坐标
            if (day.hotel && day.hotel.location) {
              const gcj = wgs84ToGcj02(day.hotel.location.latitude, day.hotel.location.longitude);
              day.hotel.location.latitude = gcj.lat;
              day.hotel.location.longitude = gcj.lng;
              updated = true;
            }
            // 迁移餐厅坐标
            if (day.meals) {
              for (const meal of day.meals) {
                if (meal.restaurant && meal.restaurant.location) {
                  const gcj = wgs84ToGcj02(meal.restaurant.location.latitude, meal.restaurant.location.longitude);
                  meal.restaurant.location.latitude = gcj.lat;
                  meal.restaurant.location.longitude = gcj.lng;
                  updated = true;
                }
              }
            }
          }
        }

        if (updated) {
          trip._coordMigrated = true; // 标记已迁移
          store2.put(trip);
          migrated++;
        }
      }

      tx2.oncomplete = () => {
        console.log(`[DB] 坐标迁移完成: ${migrated} 条记录 (跳过 ${skipped} 条已迁移记录)`);
        resolve(migrated);
      };
      tx2.onerror = () => reject(tx2.error);
    });
  } catch (err) {
    console.warn("[DB] 坐标迁移失败:", err);
    return 0;
  }
}