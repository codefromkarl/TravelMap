import { DB_NAME, DB_VERSION, STORE_NAME, SUPPLY_STORE_NAME } from './context.js?v=4';

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
 * 保存行程（新版本：结构化数据）
 * @param {object} trip - 完整行程对象
 */
export async function saveTripPlan(trip) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const now = new Date().toISOString();
    const getReq = store.get(trip.id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      const record = {
        ...trip,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        status: trip.status || existing?.status || "active",
      };
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve(record);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * 保存行程（兼容旧接口）
 * @deprecated 使用 saveTripPlan 替代
 */
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