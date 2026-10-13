/** Versioned cloud reconciliation. Conflicts preserve local revisions for explicit review. */
import { listTrips, loadTripById, saveTripPlan, acknowledgeTripSync, markTripSyncConflict } from '../db.js';

const SYNC_DEBOUNCE_MS = 5000;
let _inited = false;
let _debounceTimer = null;
let _syncing = null;
let _controller = null;
let _paused = false;

function isLocalHost() {
  return typeof location === 'undefined' || ['localhost', '127.0.0.1'].includes(location.hostname);
}

function eligible(record, userId) {
  return record && record.status !== 'demo' && !record.syncExcluded && !record.tripPlan?.demoNotice
    && (!record.syncOwnerId || record.syncOwnerId === userId);
}

function dirty(record, remote) {
  if (record?.syncState === 'pending' || record?.syncState === 'conflict') return true;
  if (record?.syncState === 'clean') return false;
  return !remote || (record.updatedAt || '') > (remote.updatedAt || '');
}

async function request(url, init, signal) {
  try {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init, signal });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch { return null; }
}

async function runSync(signal) {
  const active = () => !_paused && !signal.aborted;
  const auth = await request('/api/auth/status', { headers: { Accept: 'application/json' } }, signal);
  const userId = auth?.data?.user?.id;
  if (!active() || !auth?.ok || auth.data.authenticated !== true || typeof userId !== 'string' || !userId) return;
  const list = await request('/api/trips', { headers: { Accept: 'application/json', 'X-Sync-User': userId } }, signal);
  if (!active() || !list?.ok || list.data?.userId !== userId || !Array.isArray(list.data.trips)) return;
  const localRecords = await listTrips({ includeDeleted: true });
  if (!active()) return;
  const localMap = new Map(localRecords.map(trip => [trip.id, trip]));
  const remoteMap = new Map(list.data.trips.filter(trip => typeof trip?.id === 'string').map(trip => [trip.id, trip]));
  const ids = new Set([...localMap.keys(), ...remoteMap.keys()]);

  for (const id of ids) {
    if (!active()) return;
    // Re-read before every decision; user edits may occur during earlier requests.
    const local = await loadTripById(id, { includeDeleted: true });
    if (!active()) return;
    const remote = remoteMap.get(id);
    if (local && (!eligible(local, userId) || local.syncState === 'conflict')) continue;
    const path = '/api/trips/' + encodeURIComponent(id);

    // A deleted remote id can never be recreated by a stale local PUT.
    if (remote?.deleted) {
      if (local?.deleted) {
        await acknowledgeTripSync(id, local, { ...remote, userId }, { signal });
      } else if (local && dirty(local, remote)) {
        await markTripSyncConflict(id, local, remote, userId, { signal });
      } else {
        await saveTripPlan(remote, { source: 'remote', syncOwnerId: userId, snapshot: local, signal });
      }
      continue;
    }

    if (local?.deleted || (local && dirty(local, remote))) {
      // A divergent version is a visible conflict, never a force-overwrite or blind retry.
      if (remote?.version && local.version !== remote.version) {
        await markTripSyncConflict(id, local, remote, userId, { signal });
        continue;
      }
      const deleting = local.deleted === true;
      const body = deleting ? { baseVersion: local.version, updatedAt: local.updatedAt }
        : { trip: local, baseVersion: local.version };
      const response = await request(path, { method: deleting ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Sync-User': userId }, body: JSON.stringify(body) }, signal);
      if (!active()) return;
      if (response?.data?.userId !== userId) continue;
      if (response.ok && typeof response.data.version === 'string' && response.data.deleted === deleting) {
        await acknowledgeTripSync(id, local, response.data, { signal });
      } else if (response.status === 409 && response.data.code === 'SYNC_CONFLICT') {
        await markTripSyncConflict(id, local, response.data.remote, userId, { signal });
      }
      continue;
    }

    if (!remote) continue;
    if (local && local.version === remote.version && local.syncState === 'clean') continue;
    // Unversioned records with equal timestamps may be adopted without rewriting content.
    if (local && !local.version && local.updatedAt === remote.updatedAt && remote.version) {
      await acknowledgeTripSync(id, local, { ...remote, userId }, { signal });
      continue;
    }
    const response = await request(path, { headers: { Accept: 'application/json', 'X-Sync-User': userId } }, signal);
    if (!active() || response?.data?.userId !== userId) continue;
    const incoming = response.ok ? response.data.trip
      : response.status === 410 && response.data.code === 'TRIP_DELETED' ? response.data.tombstone : null;
    if (!incoming || incoming.id !== id || !eligible(incoming, userId)) continue;
    // Transaction snapshot protects edits made while downloading from being overwritten.
    await saveTripPlan(incoming, { source: 'remote', syncOwnerId: userId, snapshot: local, signal });
  }
}

/** Authenticated sync; concurrent calls reuse the same run. No request is blindly retried. */
export async function syncTrips() {
  if (_paused || isLocalHost()) return;
  if (_syncing && !_controller?.signal.aborted) return _syncing;
  const controller = new AbortController();
  const run = runSync(controller.signal);
  _controller = controller;
  _syncing = run;
  try { await run; } catch (error) { console.warn('[TripSync] Reconciliation unavailable', error); }
  finally {
    // An aborted account's run must not clear a newer authenticated run.
    if (_syncing === run) { _syncing = null; _controller = null; }
  }
}

/** Stop background sync before logout/account clearing and reject late responses. */
export function pauseTripSync() {
  _paused = true;
  _controller?.abort();
  if (_debounceTimer !== null) clearTimeout(_debounceTimer);
  _debounceTimer = null;
}

/** Authentication refresh may re-enable a previously paused local sync instance. */
export function resumeTripSync() { _paused = false; }

/** Debounced local edits and pagehide trigger reconciliation; remote imports emit no edits. */
export function initTripSync() {
  if (typeof window === 'undefined' || _inited) return;
  _inited = true;
  window.addEventListener('travelmap-trip-changed', () => {
    if (_paused) return;
    if (_debounceTimer !== null) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => { _debounceTimer = null; void syncTrips(); }, SYNC_DEBOUNCE_MS);
  });
  window.addEventListener('pagehide', () => {
    if (_paused) return;
    if (_debounceTimer !== null) clearTimeout(_debounceTimer);
    _debounceTimer = null;
    void syncTrips();
  });
}
