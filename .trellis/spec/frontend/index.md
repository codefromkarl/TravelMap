# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

This directory contains guidelines for the `web/` directory — a **vanilla JS + ES Modules** frontend (no React, no framework).

**Language**: All documentation is in **English**.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | ✅ Active |
| [Component Guidelines](./component-guidelines.md) | Panel system, styling, i18n, a11y patterns | ✅ Active |
| [Module Guidelines](./hook-guidelines.md) | ES Module patterns, data fetching, events | ✅ Active |
| [State Management](./state-management.md) | Module-level state, context.js, localStorage | ✅ Active |
| [Quality Guidelines](./quality-guidelines.md) | Forbidden/required patterns, testing, review | ✅ Active |
| [Type Safety](./type-safety.md) | JSDoc annotations, runtime validation | ✅ Active |
| [Guest Auth Flow](./guest-auth-flow.md) | Non-blocking guest entry, preset demo, and AI auth boundary | ✅ Active |

---

## Quick Reference

### Tech Stack

- **Runtime**: Browser ES Modules (no bundler)
- **State**: Module-level variables + `context.js` hub
- **Styling**: CSS Custom Properties, no preprocessor
- **i18n**: `I18N` object + `data-i18n` attributes
- **Testing**: Vitest + jsdom
- **Linting**: Biome

### Key Files

| File | Role |
|------|------|
| `web/index.html` | Single-page HTML (all markup) |
| `web/modules/context.js` | Global state hub |
| `web/modules/i18n.js` | Translation strings |
| `web/modules/map.js` | Map rendering (Leaflet + Amap) |
| `web/modules/tools/index.js` | Tool result rendering |
| `web/modules/db.js` | IndexedDB/localStorage abstraction |

### Common Imports

```js
import { showToast, currentLang, tripData } from './context.js';
import { I18N } from './i18n.js';
```

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.
