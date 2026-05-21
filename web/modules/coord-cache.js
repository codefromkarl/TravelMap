/**
 * 坐标缓存服务 — 持久化存储地理编码结果
 *
 * 使用 IndexedDB 缓存高德地理编码 API 的返回结果，
 * 避免重复请求，提升渲染速度。
 *
 * 缓存策略：
 *   - Key: `${city}:${name}` (如 "杭州:西湖")
 *   - TTL: 30 天
 *   - 存储: location { latitude, longitude }
 */

const DB_NAME = 'TravelAgentDB';
const DB_VERSION = 3;
const STORE_NAME = 'coordCache';
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 天

// 内存缓存（避免重复 IndexedDB 查询）
const memoryCache = new Map();

/**
 * 打开坐标缓存 store
 * 注意：需要与 db.js 共享同一个数据库实例
 */
async function getCoordStore(mode = 'readonly') {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // 如果 store 不存在则创建（兼容旧版本）
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('updatedAt', 'updatedAt');
        store.createIndex('city', 'city');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const tx = db.transaction(STORE_NAME, mode);
  return tx.objectStore(STORE_NAME);
}

/**
 * 生成缓存 key
 */
function makeKey(city, name) {
  return `${city}:${name}`;
}

/**
 * 从缓存获取坐标
 * @param {string} city - 城市名
 * @param {string} name - 景点名
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
export async function getCachedCoord(city, name) {
  const key = makeKey(city, name);

  // 1. 先查内存缓存
  if (memoryCache.has(key)) {
    const cached = memoryCache.get(key);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.location;
    }
    memoryCache.delete(key);
  }

  // 2. 查 IndexedDB
  try {
    const store = await getCoordStore('readonly');
    const result = await new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (result && Date.now() - result.updatedAt < CACHE_TTL) {
      // 写入内存缓存
      memoryCache.set(key, {
        location: result.location,
        timestamp: result.updatedAt,
      });
      return result.location;
    }

    // 过期数据，删除
    if (result) {
      const deleteStore = await getCoordStore('readwrite');
      deleteStore.delete(key);
    }
  } catch (err) {
    console.warn('[CoordCache] 读取失败:', err.message);
  }

  return null;
}

/**
 * 写入坐标缓存
 * @param {string} city - 城市名
 * @param {string} name - 景点名
 * @param {object} location - { latitude, longitude }
 */
export async function setCachedCoord(city, name, location) {
  const key = makeKey(city, name);
  const now = Date.now();

  // 1. 写入内存缓存
  memoryCache.set(key, {
    location,
    timestamp: now,
  });

  // 2. 写入 IndexedDB
  try {
    const store = await getCoordStore('readwrite');
    await new Promise((resolve, reject) => {
      const req = store.put({
        key,
        city,
        name,
        location,
        updatedAt: now,
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[CoordCache] 写入失败:', err.message);
  }
}

/**
 * 批量获取坐标
 * @param {Array<{city: string, name: string}>} items
 * @returns {Promise<Map<string, object>>} key → location
 */
export async function batchGetCachedCoords(items) {
  const results = new Map();

  for (const { city, name } of items) {
    const location = await getCachedCoord(city, name);
    if (location) {
      results.set(makeKey(city, name), location);
    }
  }

  return results;
}

/**
 * 批量写入坐标
 * @param {Array<{city: string, name: string, location: object}>} items
 */
export async function batchSetCachedCoords(items) {
  for (const { city, name, location } of items) {
    await setCachedCoord(city, name, location);
  }
}

/**
 * 清除过期缓存
 * @returns {Promise<number>} 清除的条目数
 */
export async function clearExpiredCoords() {
  let count = 0;

  try {
    const store = await getCoordStore('readwrite');
    const all = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const now = Date.now();
    for (const item of all) {
      if (now - item.updatedAt > CACHE_TTL) {
        store.delete(item.key);
        memoryCache.delete(item.key);
        count++;
      }
    }
  } catch (err) {
    console.warn('[CoordCache] 清理失败:', err.message);
  }

  return count;
}

/**
 * 获取缓存统计
 * @returns {Promise<{total: number, valid: number, expired: number}>}
 */
export async function getCoordCacheStats() {
  try {
    const store = await getCoordStore('readonly');
    const all = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const now = Date.now();
    const valid = all.filter(item => now - item.updatedAt < CACHE_TTL).length;
    const expired = all.length - valid;

    return {
      total: all.length,
      valid,
      expired,
      memorySize: memoryCache.size,
    };
  } catch (err) {
    return { total: 0, valid: 0, expired: 0, memorySize: memoryCache.size };
  }
}

/**
 * 清空所有坐标缓存
 */
export async function clearAllCoords() {
  try {
    const store = await getCoordStore('readwrite');
    await new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    memoryCache.clear();
  } catch (err) {
    console.warn('[CoordCache] 清空失败:', err.message);
  }
}
