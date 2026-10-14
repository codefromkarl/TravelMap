import { test, expect } from '@playwright/test';

// Exercise native IndexedDB against source modules, without the app or any provider request.
test.beforeEach(async ({ page }) => {
  await page.route('**/indexeddb-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>IndexedDB storage contract</title>' }));
  await page.goto('/indexeddb-test');
});

test('remote import is quiet and a late upload ACK preserves a new local edit', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = await import('/modules/infra/db.js');
    let notifications = 0;
    window.addEventListener('travelmap-trip-changed', () => notifications++);
    const remote = { id: 'native-import', title: 'Remote', updatedAt: '2026-01-01T00:00:00.000Z', version: 'v1' };
    const imported = await db.saveTripPlan(remote, { source: 'remote', syncOwnerId: 'a', snapshot: null });
    const importNotifications = notifications;
    const snapshot = await db.saveTripPlan({ ...imported, title: 'Edit 1' });
    const newEdit = await db.saveTripPlan({ id: imported.id, title: 'Edit 2' });
    const ack = await db.acknowledgeTripSync(imported.id, snapshot, { userId: 'a', version: 'v2' });
    const current = await db.loadTripById(imported.id);
    return { imported, importNotifications, notifications, snapshot, newEdit, ack, current };
  });
  expect(result.imported).toMatchObject({ updatedAt: '2026-01-01T00:00:00.000Z', version: 'v1', syncState: 'clean', syncOwnerId: 'a' });
  expect(result.importNotifications).toBe(0);
  expect(result.notifications).toBe(2);
  expect(result.ack).toBeNull();
  expect(result.current).toMatchObject({ title: 'Edit 2', version: 'v1', syncState: 'pending', syncOwnerId: 'a' });
  expect(result.newEdit.localRevision).toBe(result.snapshot.localRevision + 1);
});

test('native deletion retains a compact tombstone and account clear physically removes it', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = await import('/modules/infra/db.js');
    await db.saveTripPlan({ id: 'native-delete', title: 'Private title', markdown: 'Private content', messages: [{ content: 'private' }], tripPlan: { city: '杭州' }, version: 'v1', syncOwnerId: 'a' });
    await db.deleteTripById('native-delete');
    const hidden = await db.loadTripById('native-delete');
    const active = await db.listTrips();
    const all = await db.listTrips({ includeDeleted: true });
    let staleSaveCode = null;
    try { await db.saveTripPlan({ id: 'native-delete', title: 'Stale resurrection' }); }
    catch (error) { staleSaveCode = error.code; }
    const tombstoneAfterStale = await db.loadTripById('native-delete', { includeDeleted: true });
    const afterStale = await db.listTrips();
    await db.saveTripPlan({ id: 'native-active', title: 'Active' });
    await db.clearTripsLocal();
    const cleared = await db.listTrips({ includeDeleted: true });
    return { hidden, active, all, afterStale, staleSaveCode, tombstoneAfterStale, cleared };
  });
  expect(result.hidden).toBeNull();
  expect(result.active).toEqual([]);
  expect(result.afterStale).toEqual([]);
  expect(result.staleSaveCode).toBe('TRIP_DELETED');
  expect(result.tombstoneAfterStale).toEqual(result.all[0]);
  expect(result.all).toHaveLength(1);
  expect(result.all[0]).toMatchObject({ id: 'native-delete', deleted: true, version: 'v1', syncOwnerId: 'a' });
  for (const field of ['title', 'markdown', 'messages', 'tripPlan']) expect(result.all[0]).not.toHaveProperty(field);
  expect(result.cleared).toEqual([]);
});

test('native download guards a newer dirty revision and authenticated owner', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = await import('/modules/infra/db.js');
    const context = await import('/modules/infra/context.js');
    context.setCurrentUser({ id: 'a' });
    const local = await db.saveTripPlan({ id: 'native-owner', title: 'Bound on creation' });
    const imported = await db.saveTripPlan({ id: 'native-snapshot', title: 'Remote', updatedAt: '2026-01-01', version: 'v1' }, { source: 'remote', syncOwnerId: 'a', snapshot: null });
    await db.saveTripPlan({ id: imported.id, title: 'New local edit' });
    const lateDownload = await db.saveTripPlan({ id: imported.id, title: 'Late remote', updatedAt: '2026-02-01', version: 'v2' }, { source: 'remote', syncOwnerId: 'a', snapshot: imported });
    const wrongOwner = await db.saveTripPlan({ id: local.id, title: 'Other owner' }, { source: 'remote', syncOwnerId: 'b' });
    return { local, lateDownload, wrongOwner, current: await db.loadTripById(imported.id) };
  });
  expect(result.local.syncOwnerId).toBe('a');
  expect(result.lateDownload).toBeNull();
  expect(result.wrongOwner).toBeNull();
  expect(result.current).toMatchObject({ title: 'New local edit', version: 'v1', syncState: 'pending' });
});


test('account-specific native clear preserves another account and legacy unknown ownership', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = await import('/modules/infra/db.js');
    for (const owner of ['a', 'b']) {
      await db.saveTripPlan({ id: `${owner}-active`, title: `Account ${owner}`, syncOwnerId: owner });
      await db.saveTripPlan({ id: `${owner}-deleted`, syncOwnerId: owner });
      await db.deleteTripById(`${owner}-deleted`);
    }
    await db.saveTripPlan({ id: 'legacy-unowned', title: 'Unknown account' });
    await db.clearTripsLocal({ ownerId: 'a' });
    return db.listTrips({ includeDeleted: true });
  });
  expect(result.map(record => record.id).sort()).toEqual(['b-active', 'b-deleted', 'legacy-unowned']);
  expect(result.find(record => record.id === 'b-active')).toMatchObject({ title: 'Account b', syncOwnerId: 'b' });
  expect(result.find(record => record.id === 'b-deleted')).toMatchObject({ deleted: true, syncOwnerId: 'b' });
});

// Delay delivery of one genuine IDB open result; subsequent account-clear transactions stay native.
test('aborted old-account absent import cannot reinsert records after account clear', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = await import('/modules/infra/db.js');
    await db.saveTripPlan({ id: 'account-a-existing', title: 'A private', syncOwnerId: 'a' });
    await db.saveTripPlan({ id: 'account-b-retained', title: 'B retained', syncOwnerId: 'b' });
    const controller = new AbortController();
    const nativeOpen = indexedDB.open.bind(indexedDB);
    let opened;
    let release;
    const ready = new Promise(resolve => { opened = resolve; });
    indexedDB.open = (...args) => {
      indexedDB.open = nativeOpen;
      const request = nativeOpen(...args);
      const gate = {};
      request.onupgradeneeded = event => gate.onupgradeneeded?.(event);
      request.onerror = event => gate.onerror?.(event);
      request.onsuccess = event => {
        gate.result = request.result;
        release = () => gate.onsuccess?.(event);
        opened();
      };
      return gate;
    };
    const importing = db.saveTripPlan({ id: 'late-absent-a', title: 'A remote private content', updatedAt: '2026-01-01', version: 'v1' },
      { source: 'remote', syncOwnerId: 'a', snapshot: null, signal: controller.signal });
    await ready;
    controller.abort();
    await db.clearTripsLocal({ ownerId: 'a' });
    release();
    const cancelled = await importing;
    return { cancelled, records: await db.listTrips({ includeDeleted: true }) };
  });
  expect(result.cancelled).toBeNull();
  expect(result.records.map(record => record.id)).toEqual(['account-b-retained']);
  expect(result.records[0]).toMatchObject({ title: 'B retained', syncOwnerId: 'b' });
});

for (const operation of ['import', 'ack', 'conflict']) {
  test(`native ${operation} cancellation rolls back a queued write before commit`, async ({ page }) => {
    const result = await page.evaluate(async operation => {
      const db = await import('/modules/infra/db.js');
      const controller = new AbortController();
      const id = 'cancelled-inflight';
      const snapshot = operation === 'import' ? null
        : await db.saveTripPlan({ id, title: 'A local edit', version: 'v1', syncOwnerId: 'a' });
      const nativePut = IDBObjectStore.prototype.put;
      let queuedWrites = 0;
      IDBObjectStore.prototype.put = function (record, ...args) {
        const request = nativePut.call(this, record, ...args);
        if (record.id === id) { queuedWrites++; controller.abort(); }
        return request;
      };
      let cancelled;
      try {
        if (operation === 'import') cancelled = await db.saveTripPlan({ id, title: 'A remote', updatedAt: '2026-01-01', version: 'v2' }, { source: 'remote', syncOwnerId: 'a', snapshot: null, signal: controller.signal });
        else if (operation === 'ack') cancelled = await db.acknowledgeTripSync(id, snapshot, { version: 'v2', userId: 'a' }, { signal: controller.signal });
        else cancelled = await db.markTripSyncConflict(id, snapshot, { version: 'v2' }, 'a', { signal: controller.signal });
      } finally { IDBObjectStore.prototype.put = nativePut; }
      return { cancelled, queuedWrites, snapshot, current: await db.loadTripById(id, { includeDeleted: true }) };
    }, operation);
    expect(result.queuedWrites).toBe(1);
    expect(result.cancelled).toBeNull();
    expect(result.current).toEqual(result.snapshot);
    if (operation !== 'import') expect(result.current).toMatchObject({ version: 'v1', syncState: 'pending', title: 'A local edit' });
  });
}
