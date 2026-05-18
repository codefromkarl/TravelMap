# Component Guidelines

> How components are built in this project.

---

## Overview

Single-file SPA architecture: all HTML, CSS, and JS live in `web/index.html`.
The only external Web Component is `pi-chat-panel` (from `@earendil-works/pi-web-ui`), which is NOT modified in this project.

---

## Component Structure

### Panel System

All slide-in panels use a consistent drawer pattern:

```css
.panel-id {
  position: fixed;
  top: 0; right: 0;
  width: Npx; height: 100vh;
  transform: translateX(100%);
  transition: transform 0.25s ease;
  z-index: 50; /* above overlay (45) */
}
.panel-id.open { transform: translateX(0) !important; }
```

**Critical**: Use `!important` on the `.open` transform override — browser CSS cascade can fail to apply without it (observed in Chromium).

### Panel Mutual Exclusion

Managed by a global `activePanel` state variable:

```js
let activePanel = null;
function openPanel(panelId) { /* closes current, opens new */ }
function closePanel(panelId) { /* closes and clears state */ }
function closeAllPanels() { /* closes all + overlay */ }
```

### Overlay

`#overlay` at z-index 45, panels at z-index 50+. Click overlay → close all panels. Esc key → close all panels.

---

## Styling Patterns

### Design Tokens (CSS Custom Properties)

Used via `pi-chat-panel` Web Component shadow DOM piercing:

```css
pi-chat-panel {
  --bg-primary: #0f0f11;
  --bg-secondary: #18181b;
  --bg-tertiary: #27272a;
  --text-primary: #e4e4e7;
  --text-secondary: #a1a1aa;
  --border-color: #3f3f46;
  --accent-color: #6366f1;
}
```

### Color System

- **Zinc gray scale**: `#0f0f11` / `#18181b` / `#27272a` / `#3f3f46` / `#71717a` / `#a1a1aa` / `#e4e4e7`
- **Accent**: Indigo `#6366f1`
- **Map legend**: Scenic spots `#3b82f6`, low risk `#22c55e`, medium risk `#f59e0b`, high risk `#ef4444`

### Disabled Ghost Buttons

```css
.export-btn.disabled-ghost {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}
```

Remove `.disabled-ghost` class to enable after itinerary generation.

---

## i18n Pattern

- `I18N` object with `zh`/`en`/`ja` keys
- `data-i18n` attribute on elements → `applyI18n(lang)` updates textContent
- `data-i18n-title` attribute → updates `title` attribute
- Dynamic elements (textarea placeholder) updated manually in `applyI18n()`
- `MutationObserver` on chat container for late-rendered textarea

---

## Accessibility

- All interactive buttons must have `title` or accessible name
- Close buttons (✕) need sufficient touch target (min 44×44px)
- Panels close via: ✕ button, overlay click, Esc key
- `prefers-reduced-motion` not yet implemented (P2)

---

## Common Mistakes

1. **Forgetting `!important` on `.open` transform** — browser may not apply the override
2. **Using `display:none` for feature buttons** — use `.disabled-ghost` instead so users know features exist
3. **Hardcoding placeholder text** — always add to I18N table and update in `applyI18n()`
4. **Panel z-index conflicts** — overlay at 45, panels at 50+, toast at 100
