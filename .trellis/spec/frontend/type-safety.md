# Type Safety

> Type safety patterns in this project (vanilla JS + JSDoc).

---

## Overview

This project uses **JSDoc annotations** for type hints in vanilla JS. TypeScript is used in `src/` (backend), but `web/` (frontend) is pure JS with JSDoc.

---

## JSDoc Patterns

### Function Signatures

```js
/**
 * @param {string} city - City name
 * @param {{ days?: number, budget?: number }} options - Trip options
 * @returns {Promise<TripPlan>} Generated trip plan
 */
export async function generateTrip(city, options = {}) {
  // ...
}
```

### Type Definitions

```js
/**
 * @typedef {Object} TripPlan
 * @property {string} city
 * @property {number} days
 * @property {DayPlan[]} itinerary
 * @property {number} totalBudget
 */

/**
 * @typedef {Object} DayPlan
 * @property {number} day
 * @property {string} theme
 * @property {Attraction[]} attractions
 */
```

### Module-Level Types

```js
/** @type {Map<string, CachedWeather>} */
const _weatherCache = new Map();

/** @type {TripPlan | null} */
let _currentTrip = null;
```

---

## Validation Patterns

### Runtime Type Checking

```js
function validateTripRequest(data) {
  if (typeof data.city !== 'string' || !data.city.trim()) {
    throw new Error('Invalid city: must be non-empty string');
  }
  if (typeof data.days !== 'number' || data.days < 1 || data.days > 30) {
    throw new Error('Invalid days: must be 1-30');
  }
  return true;
}
```

### API Response Validation

```js
function validateWeatherResponse(data) {
  if (!data || typeof data !== 'object') return false;
  if (!Array.isArray(data.forecast)) return false;
  if (typeof data.temperature !== 'number') return false;
  return true;
}
```

---

## IDE Support

### VS Code Settings

Add to `.vscode/settings.json`:

```json
{
  "js/ts.implicitProjectConfig.checkJs": true,
  "js/ts.implicitProjectConfig.strictNullChecks": true
}
```

### Enable Type Checking in JS

Add `// @ts-check` at top of file for strict checking:

```js
// @ts-check
import { showToast } from './context.js';

/** @type {string} */
let currentLang = 'zh';
```

---

## Common Mistakes

1. **Missing null checks** — always check `data?.property` before access
2. **Type coercion** — use `===` not `==`, `Number()` not `+`
3. **Array type assumptions** — validate `Array.isArray()` before `.map()`
4. **Async return types** — `async function` always returns `Promise`
5. **JSDoc drift** — keep annotations in sync with actual code

---

## Migration Path

If full TypeScript is needed later:

1. Add `tsconfig.json` to `web/` with `allowJs: true`
2. Rename `.js` to `.ts` incrementally
3. JSDoc annotations become TypeScript types automatically
4. No rewrite needed — JSDoc is valid TypeScript
