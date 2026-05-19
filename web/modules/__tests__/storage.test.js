import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock localStorage ──────────────────────────────────
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    key: vi.fn((i) => Object.keys(store)[i] ?? null),
    get length() { return Object.keys(store).length; },
  };
})();
globalThis.localStorage = localStorageMock;

// Mock navigator.storage — use Object.defineProperty since navigator is read-only
Object.defineProperty(globalThis, 'navigator', {
  value: { storage: { estimate: vi.fn().mockResolvedValue({ usage: 100, quota: 1000 }), persist: vi.fn().mockResolvedValue(true) } },
  writable: true,
  configurable: true,
});

// Mock pi-web-ui exports
vi.mock('@earendil-works/pi-web-ui', () => ({
  setAppStorage: vi.fn(),
  AppStorage: vi.fn(),
  getAppStorage: vi.fn(),
}));

// Must import AFTER mocks
const { LocalStorageBackend } = await import('../storage.js');

describe('LocalStorageBackend', () => {
  let backend;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    backend = new LocalStorageBackend();
  });

  it('get returns parsed value when key exists', async () => {
    localStorage.setItem('store:key', JSON.stringify({ a: 1 }));
    const result = await backend.get('store', 'key');
    expect(result).toEqual({ a: 1 });
  });

  it('get returns null when key does not exist', async () => {
    const result = await backend.get('store', 'missing');
    expect(result).toBeNull();
  });

  it('set stores JSON-stringified value', async () => {
    await backend.set('store', 'key', { x: 42 });
    expect(localStorage.setItem).toHaveBeenCalledWith('store:key', JSON.stringify({ x: 42 }));
  });

  it('delete removes the correct key', async () => {
    await backend.delete('store', 'key');
    expect(localStorage.removeItem).toHaveBeenCalledWith('store:key');
  });

  it('keys returns keys with prefix stripped', async () => {
    localStorage.setItem('store:a', '1');
    localStorage.setItem('store:b', '2');
    localStorage.setItem('other:c', '3');
    const keys = await backend.keys('store');
    expect(keys).toEqual(expect.arrayContaining(['a', 'b']));
    expect(keys).toHaveLength(2);
  });

  it('has returns true when key exists', async () => {
    localStorage.setItem('store:key', 'val');
    expect(await backend.has('store', 'key')).toBe(true);
  });

  it('has returns false when key is missing', async () => {
    expect(await backend.has('store', 'missing')).toBe(false);
  });

  it('clear removes only keys with matching prefix', async () => {
    localStorage.setItem('store:a', '1');
    localStorage.setItem('store:b', '2');
    localStorage.setItem('other:c', '3');
    await backend.clear('store');
    expect(localStorage.removeItem).toHaveBeenCalledWith('store:a');
    expect(localStorage.removeItem).toHaveBeenCalledWith('store:b');
    expect(localStorage.removeItem).not.toHaveBeenCalledWith('other:c');
  });

  it('transaction executes the operation', async () => {
    const result = await backend.transaction([], 'readwrite', async (tx) => {
      return 'done';
    });
    expect(result).toBe('done');
  });

  it('getQuotaInfo returns usage/quota/percent', async () => {
    const info = await backend.getQuotaInfo();
    expect(info).toEqual({ usage: 100, quota: 1000, percent: 10 });
  });

  it('requestPersistence returns boolean', async () => {
    const result = await backend.requestPersistence();
    expect(typeof result).toBe('boolean');
  });
});
