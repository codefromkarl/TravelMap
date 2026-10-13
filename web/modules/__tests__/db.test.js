import { describe, it, expect, vi, beforeEach } from 'vitest';

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
        req.onupgradeneeded?.({ target: { result: db }, oldVersion: existingVersion });
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
    index(name) { return { openCursor: (...args) => this.openCursor(...args) }; }
    get(key) { return this._request(() => structuredClone(this._data[key] || null)); }
    _request(operation) {
      const req = new IDBRequest();
      const tx = this._tx;
      if (tx) tx.pending++;
      setTimeout(() => {
        req.result = operation();
        req.onsuccess?.({ target: req });
        if (tx && --tx.pending === 0) setTimeout(() => tx.oncomplete?.(), 0);
      }, 0);
      return req;
    }
    put(value) {
      const copy = structuredClone(value);
      return this._request(() => { this._data[copy[this.keyPath]] = copy; return copy[this.keyPath]; });
    }
    delete(key) { return this._request(() => { delete this._data[key]; }); }
    clear() { return this._request(() => { for (const key of Object.keys(this._data)) delete this._data[key]; }); }
    openCursor(_direction) {
      const req = new IDBRequest();
      const tx = this._tx;
      if (tx) tx.pending++;
      const entries = Object.values(this._data).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      let i = 0;
      const send = () => {
        req.result = i < entries.length ? { value: structuredClone(entries[i]), primaryKey: entries[i][this.keyPath], continue() { i++; setTimeout(send, 0); } } : null;
        req.onsuccess?.({ target: req });
        if (!req.result && tx && --tx.pending === 0) setTimeout(() => tx.oncomplete?.(), 0);
      };
      setTimeout(send, 0);
      return req;
    }
  }

  class IDBTransaction {
    constructor(store, mode) { this._store = store; this._mode = mode; this.pending = 0; }
    objectStore(name) { const view = Object.create(this._store); view._tx = this; return view; }
    abort() { this.onabort?.(); }
  }

  class IDBRequest {
    onsuccess = null;
    onerror = null;
    result = null;
  }

  return { open };
}

globalThis.indexedDB = createIndexedDBMock();

// Mock the canonical context dependency used by infra/db.js.
vi.mock('../infra/context.js', () => ({
  DB_NAME: 'TravelAgentDB',
  DB_VERSION: 3,
  currentUser: null,
  STORE_NAME: 'trips',
  SUPPLY_STORE_NAME: 'supplyPoints',
}));

const { openDB, saveTrip, saveTripPlan, listTrips, loadTripById, deleteTripById, acknowledgeTripSync, markTripSyncConflict, clearTripsLocal } = await import('../db.js');

beforeEach(() => { globalThis.indexedDB = createIndexedDBMock(); });

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


describe('sync storage invariants', () => {
  it('imports unchanged server data preserving timestamp/version without change events', async () => {
    const notify = vi.fn();
    globalThis.window = { dispatchEvent: notify, CustomEvent: class { constructor(type) { this.type = type; } } };
    const remote = { id: 'import', updatedAt: '2026-01-01T00:00:00Z', version: 'remote-v1', title: 'Remote' };
    const record = await saveTripPlan(remote, { source: 'remote', syncOwnerId: 'user-a', snapshot: null });
    expect(record.updatedAt).toBe(remote.updatedAt);
    expect(record.version).toBe('remote-v1');
    expect(record.syncState).toBe('clean');
    expect(record.syncOwnerId).toBe('user-a');
    expect(notify).not.toHaveBeenCalled();
    delete globalThis.window;
  });

  it('deletion leaves a hidden compact tombstone and prohibits stale saves from resurrecting it', async () => {
    await saveTripPlan({ id: 'deleted', title: 'Private title', markdown: 'Private itinerary', tripPlan: { city: '杭州' }, version: 'v1', syncOwnerId: 'a' });
    await deleteTripById('deleted');
    expect(await loadTripById('deleted')).toBeNull();
    expect(await listTrips()).toEqual([]);
    const tombstone = (await listTrips({ includeDeleted: true }))[0];
    expect(tombstone).toMatchObject({ deleted: true, syncState: 'pending', syncOwnerId: 'a', version: 'v1' });
    expect(tombstone).not.toHaveProperty('tripPlan');
    expect(tombstone).not.toHaveProperty('title');
    expect(tombstone).not.toHaveProperty('markdown');
    await expect(saveTripPlan({ id: 'deleted', title: 'Stale resurrect' })).rejects.toMatchObject({ code: 'TRIP_DELETED' });
    expect(await loadTripById('deleted', { includeDeleted: true })).toEqual(tombstone);
    expect(await listTrips()).toEqual([]);
    expect(await saveTripPlan({ id: 'deleted', title: 'Remote stale' }, { source: 'remote', syncOwnerId: 'a' })).toBeNull();
    expect(await loadTripById('deleted', { includeDeleted: true })).toEqual(tombstone);
  });

  it('late upload ACK cannot replace newer local edits or deletion', async () => {
    const snapshot = await saveTripPlan({ id: 'late', title: 'Version 1', version: 'v0' });
    const edited = await saveTripPlan({ id: 'late', title: 'Version 2' });
    expect(edited.localRevision).toBe(snapshot.localRevision + 1);
    expect(await acknowledgeTripSync('late', snapshot, { userId: 'a', version: 'v1' })).toBeNull();
    const current = await loadTripById('late');
    expect(current.title).toBe('Version 2');
    expect(current.version).toBe('v0');
    expect(current.syncState).toBe('pending');
    await deleteTripById('late');
    expect(await acknowledgeTripSync('late', current, { userId: 'a', version: 'v1' })).toBeNull();
    expect(await loadTripById('late')).toBeNull();
  });

  it('download snapshot cannot overwrite dirty data or import into another owner', async () => {
    const snapshot = await saveTripPlan({ id: 'race', title: 'remote', version: 'v1', updatedAt: '2026-01-01', syncOwnerId: 'a' }, { source: 'remote', syncOwnerId: 'a' });
    await saveTripPlan({ id: 'race', title: 'new local edit' });
    expect(await saveTripPlan({ id: 'race', title: 'late remote', updatedAt: '2026-01-02', version: 'v2' }, { source: 'remote', syncOwnerId: 'a', snapshot })).toBeNull();
    expect((await loadTripById('race')).title).toBe('new local edit');
    expect(await saveTripPlan({ id: 'race', title: 'other owner' }, { source: 'remote', syncOwnerId: 'b' })).toBeNull();
  });

  it('marks conflicts without altering user content and clears all records without upload notifications', async () => {
    const snapshot = await saveTripPlan({ id: 'conflict', title: 'keep local', version: 'v1' });
    await markTripSyncConflict('conflict', snapshot, { version: 'v2', deleted: true }, 'a');
    expect(await loadTripById('conflict')).toMatchObject({ title: 'keep local', syncState: 'conflict', syncConflict: { remoteDeleted: true } });
    await saveTripPlan({ id: 'to-delete', title: 'private' });
    await deleteTripById('to-delete');
    await clearTripsLocal();
    expect(await listTrips({ includeDeleted: true })).toEqual([]);
  });
  it('account-specific clear preserves other-owner and legacy unowned active/tombstone data', async () => {
    for (const owner of ['a', 'b']) {
      await saveTripPlan({ id: owner + '-active', title: 'Account ' + owner, syncOwnerId: owner });
      await saveTripPlan({ id: owner + '-deleted', syncOwnerId: owner });
      await deleteTripById(owner + '-deleted');
    }
    await saveTripPlan({ id: 'legacy', title: 'Unknown owner' });
    await clearTripsLocal({ ownerId: 'a' });
    const remaining = await listTrips({ includeDeleted: true });
    expect(remaining.map(record => record.id).sort()).toEqual(['b-active', 'b-deleted', 'legacy']);
    expect(remaining.find(record => record.id === 'b-deleted').deleted).toBe(true);
    await expect(clearTripsLocal({ ownerId: '' })).rejects.toThrow('Account owner identity required');
    expect(await listTrips({ includeDeleted: true })).toHaveLength(3);
  });

});


describe('sync transaction cancellation', () => {
  it('already cancelled imports, ACKs and conflicts never open a database', async () => {
    const controller = new AbortController();
    controller.abort();
    const spy = vi.spyOn(indexedDB, 'open');
    const record = { id: 'cancelled', title: 'A record', version: 'v1' };
    expect(await saveTripPlan(record, { source: 'remote', syncOwnerId: 'a', signal: controller.signal })).toBeNull();
    expect(await acknowledgeTripSync(record.id, record, { userId: 'a', version: 'v2' }, { signal: controller.signal })).toBeNull();
    expect(await markTripSyncConflict(record.id, record, { version: 'v2' }, 'a', { signal: controller.signal })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('a cancelled database-open failure is quiet while an active failure still rejects', async () => {
    const controller = new AbortController();
    const failure = new Error('Database unavailable');
    const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      const request = { error: failure };
      queueMicrotask(() => { controller.abort(); request.onerror?.(); });
      return request;
    });
    const remote = { id: 'failed-open', title: 'Remote' };
    expect(await saveTripPlan(remote, { source: 'remote', syncOwnerId: 'a', signal: controller.signal })).toBeNull();
    open.mockImplementation(() => {
      const request = { error: failure };
      queueMicrotask(() => request.onerror?.());
      return request;
    });
    await expect(saveTripPlan(remote, { source: 'remote', syncOwnerId: 'a', signal: new AbortController().signal })).rejects.toBe(failure);
    open.mockRestore();
  });
  it('cancellation while opening returns quietly, preserving existing local pending state', async () => {
    const record = await saveTripPlan({ id: 'cancel-opening', title: 'Local pending', syncOwnerId: 'a', version: 'v1' });
    const controller = new AbortController();
    const ack = acknowledgeTripSync(record.id, record, { userId: 'a', version: 'v2' }, { signal: controller.signal });
    controller.abort();
    expect(await ack).toBeNull();
    expect(await loadTripById(record.id)).toEqual(record);
  });
});
