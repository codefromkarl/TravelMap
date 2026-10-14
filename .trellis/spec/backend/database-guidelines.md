# Database / Storage Guidelines

> Storage patterns and conventions for this project.

---

## Overview

**This project does NOT use a traditional database.** Storage is handled via:

1. **In-memory caches** — LRU cache for API responses
2. **localStorage / IndexedDB** — client-side persistence (frontend)
3. **File system** — config files and test fixtures

---

## Storage Layers

### 1. Backend In-Memory Cache

```ts
import { LRUCache } from 'lru-cache';

const weatherCache = new LRUCache<string, WeatherData>({
  max: 100,           // max entries
  ttl: 1000 * 60 * 5  // 5 minutes
});

export function getCachedWeather(city: string): WeatherData | undefined {
  return weatherCache.get(city);
}

export function setCachedWeather(city: string, data: WeatherData): void {
  weatherCache.set(city, data);
}
```

**When to use:**
- API response caching (weather, attractions, hotels)
- Expensive computation results
- Short-lived data that can be recomputed

### 2. Frontend localStorage

```js
// db.js
export function saveTripToCache(tripId, data) {
  localStorage.setItem(`trip_${tripId}`, JSON.stringify(data));
}

export function loadTripFromCache(tripId) {
  const raw = localStorage.getItem(`trip_${tripId}`);
  return raw ? JSON.parse(raw) : null;
}
```

**When to use:**
- User preferences (language, theme)
- Trip cache for offline/recovery
- UI state persistence

### 3. Frontend IndexedDB

Used for larger structured data (supply points cache).

---

## Cache Invalidation

| Cache Type | TTL | Invalidation Strategy |
|------------|-----|----------------------|
| Weather | 5 min | TTL-based |
| Attractions | 30 min | TTL-based |
| Hotels | 15 min | TTL-based |
| User prefs | ∞ | Manual clear |
| Trip cache | 7 days | LRU eviction |

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Cache keys | `service:dataType:param` | `weather:forecast:beijing` |
| localStorage keys | `trip_{id}` or `pref_{name}` | `trip_abc123` |
| Cache functions | `getCached*` / `setCached*` | `getCachedWeather` |

---

## Common Mistakes

1. **No TTL** — always set expiry on cached data
2. **Cache without invalidation** — provide manual clear functions
3. **Storing sensitive data** — never cache API keys or tokens
4. **Unbounded cache** — always set `max` size on LRU caches
5. **JSON.parse without try/catch** — corrupted localStorage will throw

---

## Migration Path

If a real database is needed later:

1. Add `sqlite` or `postgres` dependency
2. Create `src/db/` directory with schema and migrations
3. Replace LRU caches with database queries
4. Keep cache layer for hot data


## Cloud Itinerary Versions and Deletion Records

### 1. Scope / Trigger
Pages `/api/trips` synchronization and account deletion, backed by the existing RATE_LIMIT_KV binding. No storage migration/new namespace is required for additive versions and compact deletion records.

### 2. Signatures
List: `GET /api/trips` -> `{userId,trips}`. Items are routed by `web/functions/api/trips/[id].js` to the shared authenticated handler. Item GET -> `{userId,trip}`; deleted item -> 410 with `{code:"TRIP_DELETED",userId,tombstone}`. PUT accepts `{trip,baseVersion?}`; DELETE accepts `{baseVersion?,updatedAt?}`. ACK includes `{ok,id,userId,version,updatedAt,deleted}` and a compact tombstone for DELETE. `X-Sync-User` optionally pins the initiating account and is required by the new client.

### 3. Contracts
Versions are server-created opaque IDs. A current version requires a matching base for updates/deletion; version conflicts return 409 with remote summary without replacing stored content. Legacy unversioned records can be adopted once if the incoming timestamp is not older. Missing record plus a known base rejects stale recreation. Deleted IDs cannot be reused; repeat DELETE is idempotent. Tombstones contain only id/version/timestamp/deleted (no title, Markdown or plan), retain the existing 90-day TTL, and remain in the reconciliation index during that retention window. Index reads fail closed. Mutation requests use minute abuse limits and bounded bodies. Account/header/known owner mismatch is rejected before destructive work.

KV get/put plus index writes are eventually consistent, not atomic CAS/transactions. These checks detect known stale versions; they do not guarantee serialization of simultaneous distributed writes. Do not describe this as strongly consistent storage or change infrastructure without a separately authorized operation.

### 4. Validation & Error Matrix
Version mismatch or stale/missing base: 409 SYNC_CONFLICT. Deleted GET: 410 TRIP_DELETED. Captured account mismatch: 403 SYNC_OWNER_MISMATCH. Invalid/reserved id/schema: 400/404. Storage/limiter unavailable: 503. Every mutation remains authenticated and origin constrained. Client request failures are not blindly retried.

### 5. Good / Base / Bad Cases
Good: read version V1, edit, PUT with V1, receive V2. Base: two devices diverge; preserve local revision and show a conflict. Bad: physically remove cloud deletion evidence and let an old device upload the same id, or interpret a late ACK as permission to overwrite a newer draft.

### 6. Tests Required
API version/deletion/legacy/owner/error regressions; real compiled Pages item routing through local workerd/KV; native IndexedDB import/ACK/tombstone/owner guards. No paid/provider/production requests. Physical account clear is limited to locally known-owned records; unknown and other-account records are retained and the UI says so.

### 7. Wrong vs Correct
Wrong: a remote download is saved as a new local edit, or an account action uses the currently selected account after awaiting a request. Correct: preserve remote version/timestamp, use snapshot guards, and pin the initiating account through request and local cleanup.
