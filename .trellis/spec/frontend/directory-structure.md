# Directory Structure

> How the `web/` frontend is organized.

---

## Overview

The frontend is a **single-page application** using vanilla JS with ES Modules. No build step, no bundler — modules load directly via `<script type="module">`.

---

## Directory Layout

```
web/
├── index.html              # Single HTML file (all markup)
├── styles/                 # CSS files
│   ├── main.css           # Global styles
│   ├── panels.css         # Panel drawer styles
│   ├── tools.css          # Tool result styles
│   └── skeleton.css       # Loading skeleton styles
├── modules/               # ES Modules (core logic)
│   ├── context.js         # Global state hub (imports/exports)
│   ├── i18n.js            # Internationalization strings
│   ├── map.js             # Map rendering (Leaflet + Amap)
│   ├── panels.js          # Panel open/close logic
│   ├── share.js           # Share/export functionality
│   ├── tts.js             # Text-to-speech
│   ├── db.js              # IndexedDB/localStorage abstraction
│   ├── prompt.js          # Prompt construction
│   ├── storage.js         # Storage utilities
│   └── tools/             # Tool result renderers
│       ├── index.js       # Tool routing
│       ├── attractions.js # Attraction cards
│       ├── weather.js     # Weather display
│       ├── hotels.js      # Hotel cards
│       ├── budget.js      # Budget breakdown
│       ├── transport.js   # Transport options
│       └── ...
├── functions/             # Cloudflare Workers (API proxies)
│   ├── api/               # Backend API proxies
│   └── _middleware.js     # Auth/rate-limiting
└── __tests__/             # Frontend tests (Vitest)
```

---

## Module Organization

### Core Modules (`modules/`)

| Module | Responsibility | Imports From |
|--------|----------------|--------------|
| `context.js` | Global state, toast, API keys | (none — root) |
| `i18n.js` | Translation strings | (none) |
| `map.js` | Map rendering, markers, routes | `context.js`, `i18n.js` |
| `panels.js` | Panel drawer management | `context.js` |
| `db.js` | Storage abstraction | (none) |

### Tool Modules (`modules/tools/`)

Each tool renders a specific type of AI-generated content:

| Module | Renders | Data Shape |
|--------|---------|------------|
| `attractions.js` | Attraction cards with images | `{ name, rating, image, ... }` |
| `weather.js` | Weather forecast | `{ temp, icon, description }` |
| `hotels.js` | Hotel options | `{ name, price, rating, ... }` |
| `budget.js` | Budget breakdown table | `{ total, breakdown: [...] }` |

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Module files | kebab-case | `map.js`, `attractions.js` |
| Private vars | `_` prefix | `_cache`, `_mapInstance` |
| Public functions | camelCase, verb-first | `showToast()`, `openPanel()` |
| Constants | UPPER_SNAKE_CASE | `SUPPLY_COLORS`, `CITY_CENTERS` |
| CSS classes | kebab-case | `.panel-id`, `.skeleton-overlay` |
| HTML IDs | kebab-case | `#map-container`, `#overlay` |

---

## Import Rules

```js
// ✅ Correct: named imports from context.js
import { showToast, currentLang, tripData } from './context.js';

// ✅ Correct: default import for i18n
import { I18N } from './i18n.js';

// ❌ Wrong: circular import
// context.js must NOT import from tools/* or map.js
```

---

## Adding a New Module

1. Create `web/modules/your-module.js`
2. Export public functions
3. Import from `context.js` if you need global state
4. Add to `index.html` if it needs DOM ready: `<script type="module" src="modules/your-module.js"></script>`
5. Add tests in `web/modules/__tests__/your-module.test.js`

---

## Example: Well-Organized Module

See `web/modules/db.js` for a clean example:
- Clear public API (exported functions)
- Private implementation (internal helpers)
- No circular dependencies
- Proper error handling
