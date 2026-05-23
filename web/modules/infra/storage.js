import { setAppStorage, AppStorage, getAppStorage } from "@earendil-works/pi-web-ui";

// ─── 初始化 AppStorage（基于 localStorage） ────────────
class LocalStorageBackend {
  async get(storeName, key) {
    const v = localStorage.getItem(`${storeName}:${key}`);
    return v ? JSON.parse(v) : null;
  }
  async set(storeName, key, value) {
    localStorage.setItem(`${storeName}:${key}`, JSON.stringify(value));
  }
  async delete(storeName, key) {
    localStorage.removeItem(`${storeName}:${key}`);
  }
  async keys(storeName, _prefix) {
    const prefix = `${storeName}:`;
    const result = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(prefix)) result.push(k.slice(prefix.length));
    }
    return result;
  }
  async getAllFromIndex() { return []; }
  async clear(storeName) {
    const prefix = `${storeName}:`;
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(prefix)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  }
  async has(storeName, key) {
    return localStorage.getItem(`${storeName}:${key}`) !== null;
  }
  async transaction(_stores, _mode, op) { return op(this); }
  async getQuotaInfo() {
    try {
      const est = await navigator.storage?.estimate();
      return { usage: est?.usage || 0, quota: est?.quota || 0, percent: est?.quota ? ((est.usage || 0) / est.quota * 100) : 0 };
    } catch { return { usage: 0, quota: 0, percent: 0 }; }
  }
  async requestPersistence() {
    try { return await navigator.storage?.persist() || false; } catch { return false; }
  }
}

// 创建带 localStorage 后端的 AppStorage
const _backend = new LocalStorageBackend();
const _mkStore = (cfg) => {
  const store = {
    getConfig: () => cfg,
    setBackend: () => {},
    getBackend: () => _backend,
  };
  for (const m of ['get', 'set', 'delete', 'keys', 'has', 'clear']) {
    if (!store[m]) store[m] = (...args) => _backend[m](cfg.name, ...args);
  }
  store.getAll = async () => {
    const keys = await _backend.keys(cfg.name);
    const results = [];
    for (const key of keys) {
      const val = await _backend.get(cfg.name, key);
      if (val) results.push(val);
    }
    return results;
  };
  return store;
};

// 初始化 AppStorage
const appStorage = new AppStorage(
  _mkStore({ name: 'settings' }),
  _mkStore({ name: 'provider-keys' }),
  _mkStore({ name: 'sessions' }),
  _mkStore({ name: 'custom-providers' }),
  _backend,
);
setAppStorage(appStorage);

// ─── 将已有的 localStorage api-key 迁移到 AppStorage ────
(async () => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('api-key-')) {
      const prov = k.slice('api-key-'.length);
      const val = localStorage.getItem(k);
      if (val) await getAppStorage().providerKeys.set(prov, val);
    }
  }
})();

export { LocalStorageBackend };