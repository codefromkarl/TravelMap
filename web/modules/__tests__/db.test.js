import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// ─── IndexedDB Mock ──────────────────────────────────────
// Minimal in-memory IndexedDB implementation for testing

function createIndexedDBMock() {
  let databases = {};

  function open(name, version) {
    const req = new IDBOpenDBRequest();
    const db = new IDBDatabase(name, version);
    databases[name] = databases[name] || {};
    const existingVersion = databases[name]._version || 0;

    setTimeout(() => {
      db._stores = databases[name]._stores || {};
      if (version > existingVersion) {
        databases[name]._version = version;
        req.onupgradeneeded?.({ target: { result: db } });
      }
      databases[name]._stores = db._stores;
      req.result = db;
      req.onsuccess?.({ target: { result: db } });
    }, 0);

    return req;
  }

  class IDBOpenDBRequest {
    onsuccess = null;
    onupgradeneeded = null;
    onerror = null;
    result = null;
  }

  class IDBDatabase {
    objectStoreNames = { contains: (name) => name in this._stores };
    constructor(name, version) { this._name = name; this._version = version; this._stores = {}; }
    createObjectStore(name, opts) {
      const store = new IDBObjectStore(name, opts);
      this._stores[name] = store;
      return store;
    }
    transaction(storeName, mode) {
      const store = this._stores[typeof storeName === 'string' ? storeName : storeName[0]];
      return new IDBTransaction(store, mode);
    }
  }

  class IDBObjectStore {
    constructor(name, opts) { this.name = name; this.keyPath = opts?.keyPath; this._data = {}; this._indexes = {}; }
    createIndex(name, keyPath) { this._indexes[name] = { name, keyPath }; return this; }
    index(name) {
      const self = this;
      return {
        openCursor(_direction) {
          const entries = Object.values(self._data).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
          let i = 0;
          const req = new IDBRequest();
          const makeCursor = () => i < entries.length ? { value: entries[i], primaryKey: entries[i][self.keyPath], continue() { i++; setTimeout(() => { req.result = makeCursor(); req.onsuccess?.({ target: req }); }, 0); } } : null;
          setTimeout(() => { req.result = makeCursor(); req.onsuccess?.({ target: req }); }, 0);
          return req;
        }
      };
    }
    get(key) {
      const req = new IDBRequest();
      setTimeout(() => { req.result = this._data[key] || null; req.onsuccess?.({ target: req }); }, 0);
      return req;
    }
    put(value) {
      const req = new IDBRequest();
      const key = value[this.keyPath];
      setTimeout(() => { this._data[key] = value; req.result = key; req.onsuccess?.({ target: req }); }, 0);
      return req;
    }
    delete(key) {
      const req = new IDBRequest();
      setTimeout(() => { delete this._data[key]; req.onsuccess?.({ target: req }); }, 0);
      return req;
    }
    openCursor(_direction) {
      const req = new IDBRequest();
      const entries = Object.values(this._data).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      let i = 0;
      const makeCursor = () => i < entries.length ? { value: entries[i], primaryKey: entries[i][this.keyPath], continue() { i++; setTimeout(() => { req.result = makeCursor(); req.onsuccess?.({ target: req }); }, 0); } } : null;
      setTimeout(() => { req.result = makeCursor(); req.onsuccess?.({ target: req }); }, 0);
      return req;
    }
  }

  class IDBTransaction {
    constructor(store, mode) { this._store = store; this._mode = mode; }
    objectStore(name) { return this._store; }
  }

  class IDBRequest {
    onsuccess = null;
    onerror = null;
    result = null;
  }

  return { open };
}

globalThis.indexedDB = createIndexedDBMock();

// Mock context.js
vi.mock('../context.js', () => ({
  DB_NAME: 'TravelAgentDB',
  DB_VERSION: 2,
  STORE_NAME: 'trips',
  SUPPLY_STORE_NAME: 'supplyPoints',
}));

const { openDB, saveTrip, listTrips, loadTripById, deleteTripById } = await import('../db.js');

describe('openDB', () => {
  it('returns a database instance', async () => {
    const db = await openDB();
    expect(db).toBeDefined();
    expect(db.objectStoreNames.contains('trips')).toBe(true);
  });
});

describe('saveTrip / loadTripById', () => {
  it('saves and retrieves a trip', async () => {
    const record = await saveTrip('trip-1', '测试行程', '杭州3日游', '# 内容', []);
    expect(record.id).toBe('trip-1');
    expect(record.title).toBe('测试行程');

    const loaded = await loadTripById('trip-1');
    expect(loaded).toBeDefined();
    expect(loaded.title).toBe('测试行程');
    expect(loaded.summary).toBe('杭州3日游');
  });

  it('preserves createdAt on update', async () => {
    await saveTrip('trip-2', 'V1', 'first', '', []);
    const first = await loadTripById('trip-2');
    const createdAt = first.createdAt;

    // Wait a tiny bit
    await new Promise(r => setTimeout(r, 10));
    await saveTrip('trip-2', 'V2', 'updated', '', []);
    const second = await loadTripById('trip-2');
    expect(second.createdAt).toBe(createdAt);
    expect(second.title).toBe('V2');
  });
});

describe('loadTripById', () => {
  it('returns null for non-existent trip', async () => {
    const result = await loadTripById('nonexistent');
    expect(result).toBeNull();
  });
});

describe('listTrips', () => {
  it('returns trips sorted by updatedAt descending', async () => {
    await saveTrip('a', 'Trip A', '', '', []);
    await new Promise(r => setTimeout(r, 10));
    await saveTrip('b', 'Trip B', '', '', []);

    const trips = await listTrips();
    expect(trips.length).toBeGreaterThanOrEqual(2);
    // Most recently updated should come first
    const idxB = trips.findIndex(t => t.id === 'b');
    const idxA = trips.findIndex(t => t.id === 'a');
    expect(idxB).toBeLessThan(idxA);
  });
});

describe('deleteTripById', () => {
  it('deletes a trip', async () => {
    await saveTrip('to-delete', 'Delete Me', '', '', []);
    const before = await loadTripById('to-delete');
    expect(before).not.toBeNull();

    await deleteTripById('to-delete');
    const after = await loadTripById('to-delete');
    expect(after).toBeNull();
  });
});
