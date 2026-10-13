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


## Current Itinerary Contract

### 1. Scope / Trigger
Generation completion, editing, comparison, history/preset restore, export/share and companion queries.

### 2. Signatures
`getCurrentTripPlan()`, `setCurrentTripPlan(plan|null)` and `getCurrentTripMarkdown()` live in `trip/trip-state.js`. `latestValidTripPlan(messages)` accepts one Agent run. Structured export uses `serializeTripPlan(plan)`.

### 3. Contracts
Publish only the latest valid successful result in `agent_end.messages` (the SDK's current-run message collection); never scan the full history from the beginning. Failed, aborted, invalid and no-plan runs preserve the prior valid plan. Tools must not publish partial plans mid-run. Companion queries are read-only and prefer the active plan over model-supplied copies. The state module retains the existing `_lastTripPlan` compatibility boundary for legacy map code; add no new window state. Prepare serialization/statistics before publication. Empty state clears statistics. Editor saves recalculate only evidenced costs and preserve independent drafts after saving; unknown affected totals become null. A/B selection and editing update the same active structure used for export/share.

### 4. Validation & Error Matrix
Reject empty day arrays, invalid/non-increasing calendar dates, malformed attraction entries, provided nonfinite/out-of-range coordinates, and nonnumeric/negative/nonfinite budgets. Missing coordinates remain explicitly unresolved and do not become random city-offset points. Optional malformed extension collections are ignored by serialization. Unknown numeric fields use `Type.Union([Type.Null(), Type.Number()])`: number-first schemas can silently convert null to zero in the SDK. Only known numeric zero means free.

### 5. Good / Base / Bad Cases
Good: generate A, refine B, edit B and export the edited B. Base: failed refinement keeps A with working result controls. Bad: old tool results, read-only queries or unsaved drafts replace active state. Preserve `demoNotice` through preset restore/edit/export.

### 6. Tests Required
Current-run result/abort tests, editor-save-cancel consistency, A/B failures and edited-side retention, real SDK null/numeric roundtrip, malformed metadata and safe serialization. Browser flow must edit a preset through visible controls, download current Markdown and prove zero AI/map requests.

### 7. Wrong vs Correct
Wrong: find the first trip tool result in all messages or export stale assistant prose after editing. Correct: use the current run's latest valid result, publish through the state API and derive output from the active structure.


## Device Reconciliation

`saveTripPlan(trip,{source:"remote",syncOwnerId,snapshot})` preserves the remote timestamp/version and emits no local-edit event. User edits advance localRevision and become pending. `acknowledgeTripSync()` and remote import use transaction snapshots; late responses cannot overwrite a newer edit. Deletion hides an id and persists a compact local tombstone; user save of the deleted id rejects with TRIP_DELETED. A fresh itinerary must use a new id. list/load include tombstones only with `{includeDeleted:true}`.

Sync verifies authentication, sends captured X-Sync-User, excludes demo and known other-account records, and preserves conflicts rather than force-overwriting. Login resumes, logout/account clearing pauses and aborts, and an old aborted task cannot clear a newer run. Account DELETE and local `clearTripsLocal({ownerId})` use the same captured owner; only explicitly attributed records are cleared. Unknown and foreign-owner data remain. Failed/partial account deletion stays paused and is reported accurately. The no-argument local clear is reserved for explicit full storage reset. Conflict notice invites review and a new id; this version does not auto-merge conflicting edits.
