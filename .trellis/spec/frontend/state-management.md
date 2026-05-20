# State Management

> How state is managed in this project (vanilla JS, no React).

---

## Overview

State is managed via **module-level variables** and a centralized **context.js** hub. No Redux, no Context API, no Zustand — just ES Modules.

---

## State Categories

### 1. Global State (context.js)

Shared across all modules. Imported explicitly.

```js
// context.js
export let currentLang = 'zh';
export let activePanel = null;
export let tripData = null;

export function setCurrentLang(lang) {
  currentLang = lang;
  applyI18n(lang);
}
```

**What belongs here:**
- UI language (`currentLang`)
- Active panel state (`activePanel`)
- Current trip data (`tripData`)
- API keys (`amapKey`, `amapGeoKey`)
- Toast function (`showToast`)

### 2. Module-Private State

Scoped to a single module. Not exported.

```js
// map.js
let _map = null;
let _markers = [];
let _supplyPoints = [];
```

**What belongs here:**
- Map instance and overlays
- Cache data
- Internal flags and counters

### 3. Persistent State (localStorage / IndexedDB)

Survives page reload.

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

**What belongs here:**
- User preferences (language, theme)
- Trip cache for offline/recovery
- Supply points cache

---

## State Flow Patterns

### Pattern 1: Direct Import

```js
// panels.js
import { activePanel, closeAllPanels } from './context.js';

export function openPanel(panelId) {
  if (activePanel) closeAllPanels();
  // ...
}
```

### Pattern 2: Event-Driven Updates

```js
// map.js — listen for trip updates
document.addEventListener('trip-updated', (e) => {
  renderItineraryOnMap(e.detail);
});

// tools/index.js — emit after rendering
document.dispatchEvent(new CustomEvent('trip-updated', { detail: tripData }));
```

### Pattern 3: Callback Registration

```js
// context.js
let _onTripUpdate = null;
export function onTripUpdate(cb) { _onTripUpdate = cb; }
export function notifyTripUpdate(data) { _onTripUpdate?.(data); }
```

---

## When to Use Global State

| Criteria | Example |
|----------|---------|
| Used by 3+ modules | `currentLang`, `tripData` |
| Cross-cutting concern | `showToast()`, `activePanel` |
| Single source of truth needed | API keys, config |

**Otherwise**: keep state module-private.

---

## Common Mistakes

1. **Duplicating state** — `tripData` should live only in `context.js`, not copied to each module
2. **Stale references** — re-import after mutation, or use getter functions
3. **Missing persistence** — user preferences must survive reload
4. **Event memory leaks** — remove listeners when panels close
5. **Implicit global** — always `export` from `context.js`, never `window.x = ...`

---

## Anti-Patterns

```js
// ❌ Wrong: window globals
window.tripData = data;

// ❌ Wrong: DOM as state store
document.getElementById('data').dataset.trip = JSON.stringify(trip);

// ✅ Correct: module export
export let tripData = null;
export function setTripData(data) { tripData = data; }
```
