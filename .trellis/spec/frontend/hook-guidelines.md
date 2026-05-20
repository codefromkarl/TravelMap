# Module Guidelines

> How ES Modules are structured in this project (no React/hooks).

---

## Overview

This project uses **vanilla JS with ES Modules** — no React, no hooks, no framework. State is managed via module-level variables and the global `context.js` hub.

---

## Module Pattern

### Standard Module Structure

```js
// web/modules/example.js

// 1. Imports
import { showToast, currentLang } from './context.js';
import { I18N } from './i18n.js';

// 2. Module-level state (private)
let _internalState = null;
const _cache = new Map();

// 3. Exported functions (public API)
export function initExample() { /* ... */ }
export function updateExample(data) { /* ... */ }
export function clearExampleCache() { _cache.clear(); }

// 4. Event listeners (if needed)
document.addEventListener('DOMContentLoaded', () => { /* ... */ });
```

### Naming Conventions

- **Private variables**: prefix with `_` (e.g., `_cache`, `_internalState`)
- **Public functions**: camelCase, verb-first (e.g., `showToast()`, `openPanel()`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `SUPPLY_COLORS`, `CITY_CENTERS`)

---

## Data Fetching

### Pattern: Async Functions with Error Handling

```js
export async function fetchWeather(city) {
  try {
    const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    showToast(I18N[currentLang].weatherError, 5000, 'error');
    throw err;
  }
}
```

### Pattern: Cache with TTL

```js
const _weatherCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchWeatherCached(city) {
  const cached = _weatherCache.get(city);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }
  const data = await fetchWeather(city);
  _weatherCache.set(city, { data, ts: Date.now() });
  return data;
}
```

---

## Event Handling

### Pattern: Delegated Events

```js
// ✅ Correct: delegate to container
document.getElementById('itinerary').addEventListener('click', (e) => {
  const btn = e.target.closest('.expand-btn');
  if (btn) expandDay(btn.dataset.day);
});

// ❌ Wrong: attach to each button
document.querySelectorAll('.expand-btn').forEach(btn => {
  btn.addEventListener('click', () => expandDay(btn.dataset.day));
});
```

### Pattern: Custom Events for Cross-Module Communication

```js
// Emit
document.dispatchEvent(new CustomEvent('trip-updated', { detail: tripData }));

// Listen
document.addEventListener('trip-updated', (e) => {
  updateMap(e.detail);
});
```

---

## Lazy Loading

For heavy modules (QR code, chart libs), use dynamic import:

```js
let _heavyFn = null;
async function getHeavyFn() {
  if (!_heavyFn) {
    const mod = await import('./heavy-module.js');
    _heavyFn = mod.heavyFn;
  }
  return _heavyFn;
}
```

---

## Common Mistakes

1. **Circular imports** — `context.js` must not import from `tools/*`
2. **Global pollution** — never use `var` or implicit globals
3. **Missing error handling** — all `fetch` calls must have `try/catch`
4. **Stale closures** — module-level functions don't capture local state like React hooks
5. **DOM ready** — use `DOMContentLoaded` or defer, don't query before DOM exists

---

## Testing Modules

```js
// web/modules/__tests__/example.test.js
import { describe, it, expect, vi } from 'vitest';
import { fetchWeatherCached } from '../example.js';

// Mock fetch
global.fetch = vi.fn();

describe('fetchWeatherCached', () => {
  it('returns cached data within TTL', async () => {
    // ...
  });
});
```
