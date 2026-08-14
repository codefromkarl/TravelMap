/**
 * 通用 TTL 缓存 — 基于 localStorage 的键值缓存
 *
 * 用于缓存外部 API 响应（高德 POI 搜索、Nominatim 等），
 * 降低重复请求、节省配额并提升响应速度。
 *
 * 存储格式：localStorage 单个键下保存一张 map，
 *   key -> { v: <任意 JSON 值>, exp: <过期时间戳(ms)> }
 *
 * 特性：
 *   - TTL 过期自动失效（读取时惰性清理）
 *   - 容量上限 200 条，超出时先清过期、再按先进先出淘汰
 *   - 隐私模式 / localStorage 满 / 损坏数据均容错，绝不抛异常
 *   - 不可序列化的值（循环引用、函数、Symbol、BigInt、undefined）拒绝写入
 */

const STORAGE_KEY = "travel-map-ttl-cache";

/** 缓存容量上限（至少 200 条） */
export const TTL_CACHE_MAX = 200;

/** 安全读取 localStorage，任何异常返回 null */
function safeGetStorage() {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * 读取整张缓存 map（容错）。
 * @returns {Record<string, {v: unknown, exp: number}>}
 */
function readStore() {
  const storage = safeGetStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

/**
 * 写回整张缓存 map（容错）。
 * @returns {boolean} 是否写入成功
 */
function writeStore(store) {
  const storage = safeGetStorage();
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false; // localStorage 满 / 隐私模式
  }
}

/**
 * 清理过期条目并保证不超出容量上限。
 * 先清过期，再按先进先出淘汰最旧条目。
 */
function prune(store) {
  const now = Date.now();

  // 1. 清理过期条目
  for (const key of Object.keys(store)) {
    const entry = store[key];
    const exp = entry && typeof entry === "object" ? Number(entry.exp) : NaN;
    if (!Number.isFinite(exp) || exp <= now) {
      delete store[key];
    }
  }

  // 2. 超出容量按先进先出清理（Object.keys 保持插入顺序）
  const keys = Object.keys(store);
  while (keys.length > TTL_CACHE_MAX) {
    delete store[keys.shift()];
  }
}

/**
 * 读取缓存值。
 * @param {string} key 缓存键
 * @returns {unknown} 命中的值；未命中 / 已过期 / 数据损坏时返回 null
 */
export function ttlGet(key) {
  if (typeof key !== "string" || key === "") return null;

  const store = readStore();
  const entry = store[key];
  if (!entry || typeof entry !== "object" || !("v" in entry) || !("exp" in entry)) {
    return null;
  }

  const exp = Number(entry.exp);
  if (!Number.isFinite(exp) || exp <= Date.now()) {
    // 过期：惰性删除
    delete store[key];
    writeStore(store);
    return null;
  }

  return entry.v;
}

/**
 * 写入缓存值（带 TTL）。
 * @param {string} key 缓存键
 * @param {unknown} value 任意可 JSON 序列化的值
 * @param {number} ttlMs 有效期（毫秒）
 * @returns {boolean} 是否写入成功；不可序列化或存储失败时返回 false
 */
export function ttlSet(key, value, ttlMs) {
  if (typeof key !== "string" || key === "") return false;

  const ttl = Number(ttlMs);
  if (!Number.isFinite(ttl) || ttl <= 0) return false;

  // 预检可序列化性：循环引用 / BigInt 抛异常，函数 / Symbol / undefined 返回 undefined
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return false;
  }
  if (serialized === undefined) return false;

  const store = readStore();
  store[key] = { v: value, exp: Date.now() + ttl };
  prune(store);
  return writeStore(store);
}

/**
 * 删除指定缓存条目。
 * @param {string} key 缓存键
 * @returns {boolean} 是否确实删除了条目
 */
export function ttlDelete(key) {
  if (typeof key !== "string" || key === "") return false;

  const store = readStore();
  if (!(key in store)) return false;
  delete store[key];
  return writeStore(store);
}
