# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

This document defines quality standards for the `web/` directory (vanilla JS).

---

## Forbidden Patterns

### 1. Global Variable Pollution

```js
// ❌ Wrong
window.myVar = 'value';
var globalLeak = 'oops';

// ✅ Correct
export const myVar = 'value';
```

### 2. Inline Event Handlers

```html
<!-- ❌ Wrong -->
<button onclick="handleClick()">Click</button>

<!-- ✅ Correct -->
<button id="my-btn">Click</button>
```

```js
document.getElementById('my-btn').addEventListener('click', handleClick);
```

### 3. Hardcoded Strings

```js
// ❌ Wrong
showToast('网络错误', 5000);

// ✅ Correct
showToast(I18N[currentLang].networkError, 5000);
```

### 4. Missing Error Handling

```js
// ❌ Wrong
const data = await fetch('/api/data').then(r => r.json());

// ✅ Correct
try {
  const res = await fetch('/api/data');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
} catch (err) {
  showErrorToast(err.message);
  throw err;
}
```

### 5. DOM Queries Before Ready

```js
// ❌ Wrong (at module top level)
const el = document.getElementById('map'); // null if script loads before DOM

// ✅ Correct
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('map');
});
```

---

## Required Patterns

### 1. Module Imports

```js
// ✅ Named exports for public API
export function openPanel() { /* ... */ }
export function closePanel() { /* ... */ }

// ✅ Explicit imports
import { openPanel, closePanel } from './panels.js';
```

### 2. Error Boundaries

```js
// ✅ All fetch calls wrapped
async function safeFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    showErrorToast(err.message);
    return null;
  }
}
```

### 3. i18n for User-Facing Text

```js
// ✅ All user-facing text via I18N
import { I18N } from './i18n.js';
import { currentLang } from './context.js';

element.textContent = I18N[currentLang].loading;
```

---

## Testing Requirements

### Unit Tests

- All exported functions in `web/modules/` should have tests
- Mock `fetch` for API calls
- Mock DOM for UI logic

### Test File Location

```
web/modules/__tests__/
├── context.test.js
├── db.test.js
├── i18n.test.js
├── prompt.test.js
├── storage.test.js
└── tools.test.js
```

### Test Naming

```js
describe('fetchWeatherCached', () => {
  it('returns cached data within TTL', async () => { /* ... */ });
  it('fetches fresh data after TTL expires', async () => { /* ... */ });
  it('throws on network error', async () => { /* ... */ });
});
```

---

## Code Review Checklist

- [ ] No `var` declarations
- [ ] No `window.*` globals
- [ ] All `fetch` calls have `try/catch`
- [ ] User-facing text uses `I18N[currentLang]`
- [ ] DOM queries inside `DOMContentLoaded` or deferred
- [ ] No circular imports
- [ ] Private variables prefixed with `_`
- [ ] JSDoc for public functions

---

## Linting

This project uses **Biome** for linting:

```bash
npm run lint        # Check
npm run lint:fix    # Auto-fix
```

Biome enforces:
- No unused imports
- Consistent quotes (single)
- Semicolons required
- No `var`
