/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ listTrips: vi.fn(), loadTripById: vi.fn(), saveTripPlan: vi.fn(), acknowledgeTripSync: vi.fn(), markTripSyncConflict: vi.fn() }));
vi.mock('../db.js', () => db);
import { initTripSync, syncTrips, pauseTripSync, resumeTripSync } from '../infra/trip-sync.js';

const userId = 'user-a';
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const auth = () => response({ authenticated: true, user: { id: userId } });
const list = trips => response({ userId, trips });
const record = (overrides = {}) => ({ id: 'trip', title: 'Local itinerary', version: 'v1', updatedAt: '2026-01-01T00:00:00Z', localRevision: 1, syncOwnerId: userId, syncState: 'clean', ...overrides });
let fetchMock;
function hostname(value) { Object.defineProperty(window, 'location', { value: { hostname: value }, configurable: true }); }
function local(trips) {
  db.listTrips.mockResolvedValue(trips);
  db.loadTripById.mockImplementation(async id => trips.find(trip => trip.id === id) || null);
}
function network(...responses) {
  fetchMock.mockImplementation(async () => responses.shift());
}
function mutations() { return fetchMock.mock.calls.filter(([, init]) => ['PUT', 'DELETE'].includes(init?.method)); }

beforeEach(() => {
  vi.resetAllMocks();
  resumeTripSync();
  hostname('example.com');
  local([]);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('identity and ownership', () => {
  it('does not call any API or storage on localhost', async () => {
    hostname('localhost');
    await syncTrips();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.listTrips).not.toHaveBeenCalled();
  });
  it.each([response({ authenticated: false }, 401), response({ authenticated: false }), null])('does no writes or trip reads after failed/unauthenticated status %#', async failed => {
    network(failed);
    await syncTrips();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.listTrips).not.toHaveBeenCalled();
    expect(db.saveTripPlan).not.toHaveBeenCalled();
  });
  it('stops on a list response from a different authenticated account', async () => {
    network(auth(), response({ userId: 'other', trips: [] }));
    await syncTrips();
    expect(db.listTrips).not.toHaveBeenCalled();
  });
  it('excludes other-owner trips, tombstones and demo records', async () => {
    local([record({ syncOwnerId: 'other', syncState: 'pending' }), record({ id: 'foreign-deletion', deleted: true, syncOwnerId: 'other', syncState: 'pending' }), record({ id: 'demo', status: 'demo', syncState: 'pending' }), record({ id: 'demo-deletion', deleted: true, syncExcluded: true, syncState: 'pending' })]);
    network(auth(), list([]));
    await syncTrips();
    expect(mutations()).toHaveLength(0);
    expect(db.saveTripPlan).not.toHaveBeenCalled();
  });
  it('captured-account mismatch denies mutation without ACK or blind retry', async () => {
    local([record({ syncState: 'pending' })]);
    network(auth(), list([record()]), response({ userId: 'other', code: 'SYNC_OWNER_MISMATCH' }, 403));
    await syncTrips();
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0][1].headers['X-Sync-User']).toBe(userId);
    expect(db.acknowledgeTripSync).not.toHaveBeenCalled();
    expect(db.saveTripPlan).not.toHaveBeenCalled();
  });
  it('does not bind local data using an ACK for a different account', async () => {
    local([record({ syncState: 'pending' })]);
    network(auth(), list([record()]), response({ ok: true, userId: 'other', version: 'v2', deleted: false }));
    await syncTrips();
    expect(db.acknowledgeTripSync).not.toHaveBeenCalled();
  });
});

describe('versioned reconciliation', () => {
  it('uploads dirty matching version with baseVersion and ACK snapshot', async () => {
    const pending = record({ syncState: 'pending', localRevision: 2 });
    local([pending]);
    const ack = { ok: true, userId, id: pending.id, version: 'v2', deleted: false };
    network(auth(), list([record()]), response(ack));
    await syncTrips();
    expect(mutations()[0][1].headers['X-Sync-User']).toBe(userId);
    expect(fetchMock.mock.calls[1][1].headers['X-Sync-User']).toBe(userId);
    expect(JSON.parse(mutations()[0][1].body)).toEqual({ trip: pending, baseVersion: 'v1' });
    expect(db.acknowledgeTripSync).toHaveBeenCalledWith('trip', pending, ack, { signal: expect.any(AbortSignal) });
    expect(db.saveTripPlan).not.toHaveBeenCalled();
  });
  it('creates a fresh local-only id without a baseVersion', async () => {
    const fresh = record({ version: undefined, syncState: 'pending' });
    local([fresh]);
    network(auth(), list([]), response({ ok: true, id: 'trip', userId, version: 'v1', deleted: false }));
    await syncTrips();
    expect(JSON.parse(mutations()[0][1].body)).not.toHaveProperty('baseVersion');
    expect(db.acknowledgeTripSync).toHaveBeenCalledTimes(1);
  });
  it('downloads remote data through preserve-timestamp import options and snapshot', async () => {
    const previous = record();
    const remote = record({ version: 'v2', updatedAt: '2026-02-01T00:00:00Z' });
    local([previous]);
    network(auth(), list([remote]), response({ userId, trip: remote }));
    await syncTrips();
    expect(db.saveTripPlan).toHaveBeenCalledWith(remote, { source: 'remote', syncOwnerId: userId, snapshot: previous, signal: expect.any(AbortSignal) });
    expect(mutations()).toHaveLength(0);
  });
  it('unchanged imported revision does not cause an upload feedback loop across sync runs', async () => {
    const imported = record();
    local([imported]);
    network(auth(), list([imported]), auth(), list([imported]));
    await syncTrips();
    await syncTrips();
    expect(mutations()).toHaveLength(0);
    expect(db.saveTripPlan).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('imports a remote-only active record using a missing-record snapshot', async () => {
    const remote = record();
    network(auth(), list([remote]), response({ userId, trip: remote }));
    await syncTrips();
    expect(db.saveTripPlan).toHaveBeenCalledWith(remote, { source: 'remote', syncOwnerId: userId, snapshot: null, signal: expect.any(AbortSignal) });
  });
  it('keeps dirty local data on divergent versions without downloading or uploading', async () => {
    const pending = record({ syncState: 'pending', title: 'Unsaved remote changes' });
    const remote = record({ version: 'v2' });
    local([pending]);
    network(auth(), list([remote]));
    await syncTrips();
    expect(mutations()).toHaveLength(0);
    expect(db.saveTripPlan).not.toHaveBeenCalled();
    expect(db.markTripSyncConflict).toHaveBeenCalledWith('trip', pending, remote, userId, { signal: expect.any(AbortSignal) });
  });
  it('records server race conflict once and does not blindly retry', async () => {
    const pending = record({ syncState: 'pending' });
    const remote = record({ version: 'v2' });
    local([pending]);
    network(auth(), list([record()]), response({ userId, code: 'SYNC_CONFLICT', remote }, 409));
    await syncTrips();
    expect(mutations()).toHaveLength(1);
    expect(db.markTripSyncConflict).toHaveBeenCalledWith('trip', pending, remote, userId, { signal: expect.any(AbortSignal) });
    expect(db.acknowledgeTripSync).not.toHaveBeenCalled();
  });
  it('does not retry service failure or automatically send an already conflicted record', async () => {
    local([record({ syncState: 'pending' }), record({ id: 'conflicted', syncState: 'conflict' })]);
    network(auth(), list([]), response({}, 503));
    await syncTrips();
    expect(mutations()).toHaveLength(1);
    expect(db.acknowledgeTripSync).not.toHaveBeenCalled();
  });
});

describe('deletion propagation', () => {
  const tombstone = { id: 'trip', version: 'deleted-v2', updatedAt: '2026-02-01T00:00:00Z', deleted: true };
  it('device A deletes and device B reconciles a tombstone without resurrecting content', async () => {
    const pendingDelete = record({ title: undefined, deleted: true, syncState: 'pending' });
    local([pendingDelete]);
    network(auth(), list([record()]), response({ ok: true, userId, ...tombstone }));
    await syncTrips();
    expect(mutations()[0][1].method).toBe('DELETE');
    expect(db.acknowledgeTripSync).toHaveBeenCalledWith('trip', pendingDelete, { ok: true, userId, ...tombstone }, { signal: expect.any(AbortSignal) });
    fetchMock.mockClear();
    local([record()]);
    network(auth(), list([tombstone]));
    await syncTrips();
    expect(mutations()).toHaveLength(0);
    expect(db.saveTripPlan).toHaveBeenCalledWith(tombstone, { source: 'remote', syncOwnerId: userId, snapshot: record(), signal: expect.any(AbortSignal) });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('preserves dirty local edits as conflict when the other device deleted the itinerary', async () => {
    const pending = record({ syncState: 'pending' });
    local([pending]);
    network(auth(), list([tombstone]));
    await syncTrips();
    expect(db.markTripSyncConflict).toHaveBeenCalledWith('trip', pending, tombstone, userId, { signal: expect.any(AbortSignal) });
    expect(mutations()).toHaveLength(0);
  });
  it('does not download active cloud content over a local deletion conflict', async () => {
    const deleted = record({ deleted: true, syncState: 'pending' });
    local([deleted]);
    network(auth(), list([record({ version: 'v3' })]));
    await syncTrips();
    expect(db.markTripSyncConflict).toHaveBeenCalled();
    expect(db.saveTripPlan).not.toHaveBeenCalled();
    expect(mutations()).toHaveLength(0);
  });
  it('handles deletion between listing and full download as a tombstone', async () => {
    network(auth(), list([record()]), response({ userId, code: 'TRIP_DELETED', tombstone }, 410));
    await syncTrips();
    expect(db.saveTripPlan).toHaveBeenCalledWith(tombstone, { source: 'remote', syncOwnerId: userId, snapshot: null, signal: expect.any(AbortSignal) });
  });
});

describe('lifecycle', () => {
  it('pausing aborts a pending download and ignores its late response', async () => {
    let resolveDownload;
    network(auth(), list([record()]));
    fetchMock.mockImplementationOnce(async () => auth()).mockImplementationOnce(async () => list([record()])).mockImplementationOnce(() => new Promise(resolve => { resolveDownload = resolve; }));
    const sync = syncTrips();
    await vi.waitFor(() => expect(resolveDownload).toBeTypeOf('function'));
    pauseTripSync();
    expect(fetchMock.mock.calls.at(-1)[1].signal.aborted).toBe(true);
    resolveDownload(response({ userId, trip: record() }));
    await sync;
    expect(db.saveTripPlan).not.toHaveBeenCalled();
  });
  it('carries the same cancellation signal into a queued remote import after HTTP completed', async () => {
    let releaseImport;
    network(auth(), list([record()]), response({ userId, trip: record() }));
    db.saveTripPlan.mockImplementationOnce((_record, options) => {
      expect(options.signal).toBe(fetchMock.mock.calls[0][1].signal);
      return new Promise(resolve => { releaseImport = resolve; });
    });
    const sync = syncTrips();
    await vi.waitFor(() => expect(releaseImport).toBeTypeOf('function'));
    const signal = db.saveTripPlan.mock.calls[0][1].signal;
    pauseTripSync();
    expect(signal.aborted).toBe(true);
    releaseImport(null);
    await sync;
    expect(db.acknowledgeTripSync).not.toHaveBeenCalled();
    expect(db.markTripSyncConflict).not.toHaveBeenCalled();
  });
  it('resuming starts a fresh run even while an aborted download has not settled', async () => {
    let resolveOld;
    fetchMock.mockImplementationOnce(async () => auth()).mockImplementationOnce(async () => list([record()])).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockImplementationOnce(async () => auth()).mockImplementationOnce(async () => list([]));
    const oldRun = syncTrips();
    await vi.waitFor(() => expect(resolveOld).toBeTypeOf('function'));
    pauseTripSync();
    resumeTripSync();
    await syncTrips();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    resolveOld(response({ userId, trip: record() }));
    await oldRun;
    expect(db.saveTripPlan).not.toHaveBeenCalled();
  });
  it('debounces local-change events and flushes on pagehide', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async url => url === '/api/auth/status' ? auth() : list([]));
    initTripSync();
    window.dispatchEvent(new CustomEvent('travelmap-trip-changed'));
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
