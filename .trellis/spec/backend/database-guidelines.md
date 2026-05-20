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
