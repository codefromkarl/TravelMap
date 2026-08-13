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
- `prefers-reduced-motion` supported via CSS media query (see below)

## Scenario: Mobile View-Reveal Controls

### 1. Scope / Trigger

Apply this contract when a mobile control reveals, restores, or switches to a panel that can be hidden with `display: none`, including the map/chat view switcher.

### 2. Signatures

- Stable owner: `#page-map`
- Hideable panels: `#map-right-area`, `#map-chat-panel`
- View controls: `#mobile-view-toggle`, `#mobile-view-toggle-chat`
- State classes: `.mobile-chat-focused`, `.mobile-map-focused`

### 3. Contracts

- A control that reveals a hidden panel must be owned by a common ancestor that remains rendered in every state; it must not be a descendant of the panel it reveals.
- If legacy markup places a control under a hideable panel, move the existing node to the stable owner after DOM readiness. Preserve the node identity, event listeners, accessible name, and inline state.
- CSS controls presentation only. `display`, `position`, and `z-index` on a child cannot override `display: none` on an ancestor.

### 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| Chat-focused state hides `#map-right-area` | Map reveal control remains visible and enabled |
| Map reveal control is activated | `#page-map` gains `.mobile-map-focused`; route/map controls become visible |
| Map-focused state hides the chat panel | Chat reveal control remains visible and enabled |
| Required stable owner or control is absent | Initialization safely no-ops without throwing |

### 5. Good / Base / Bad Cases

- Good: both view controls are direct children of `#page-map` and survive either panel being hidden.
- Base: legacy markup starts inside a panel, and DOM-ready initialization moves the same nodes to `#page-map` before interaction.
- Bad: the map reveal button is inside `#map-right-area` while `.mobile-chat-focused #map-right-area { display: none; }`; the user cannot return to the map.

### 6. Tests Required

- Mobile E2E asserts the control container's parent is `#page-map`.
- Assert the reveal control is visible before clicking it.
- Click the control and assert the corresponding state class changes.
- Assert a target-panel behavior or control becomes visible after the transition; an attachment-only assertion is insufficient.
- Keep a desktop assertion so the mobile ownership fix does not alter desktop visibility.

### 7. Wrong vs Correct

#### Wrong

```html
<section id="map-right-area">
  <div id="mobile-view-toggle"><button>Show map</button></div>
</section>
```

#### Correct

```html
<main id="page-map">
  <section id="map-right-area"></section>
  <section id="map-chat-panel"></section>
  <div id="mobile-view-toggle"><button>Show map</button></div>
  <div id="mobile-view-toggle-chat"><button>Show chat</button></div>
</main>
```

---

## Skeleton Screen Pattern

For first-contentful-paint improvement:

```html
<!-- HTML: place inside the page container -->
<div id="page-skeleton" class="skeleton-overlay">
  <div class="skeleton-placeholder">
    <div class="skeleton-shimmer"></div>
    <div class="skeleton-icon">🗺️</div>
    <div class="skeleton-text" data-i18n="skeletonLoading">Loading...</div>
  </div>
</div>
```

```css
/* CSS: shimmer animation + fade-out transition */
.skeleton-overlay {
  position: fixed; inset: 0;
  z-index: 9999;
  background: var(--color-bg-base);
  display: flex; align-items: center; justify-content: center;
  transition: opacity 0.4s ease-out;
}
.skeleton-overlay.fade-out {
  opacity: 0;
  pointer-events: none;
}
.skeleton-shimmer {
  width: 280px; height: 180px;
  border-radius: 12px;
  background: linear-gradient(90deg, var(--color-bg-elevated) 25%, var(--color-bg-surface) 50%, var(--color-bg-elevated) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

```js
// JS: remove after init completes
const skeleton = document.getElementById('page-skeleton');
if (skeleton) {
  skeleton.classList.add('fade-out');
  setTimeout(() => skeleton.remove(), 500);
}
```

---

## Lazy Loading Pattern

For heavy modules (QR code, chart libs), use dynamic import:

```js
// Instead of: import { heavyFn } from './heavy-module.js';
let _heavyFn = null;
async function getHeavyFn() {
  if (!_heavyFn) {
    const mod = await import('./heavy-module.js');
    _heavyFn = mod.heavyFn;
  }
  return _heavyFn;
}

// Usage
const heavyFn = await getHeavyFn();
heavyFn(args);
```

---

## Error Toast Classification

Show user-friendly error messages based on error type:

```js
function showErrorToast(errMsg) {
  const msg = errMsg.toLowerCase();
  if (msg.includes('fetch') || msg.includes('network')) {
    showToast('🌐 Network error, please check connection', 5000, 'error');
  } else if (msg.includes('401') || msg.includes('unauthorized')) {
    showToast('🔑 Invalid API Key', 5000, 'error');
  } else if (msg.includes('429') || msg.includes('rate limit')) {
    showToast('⏳ Rate limited, try again later', 5000, 'warning');
  } else if (msg.includes('timeout')) {
    showToast('⏱️ Request timed out', 5000, 'warning');
  } else {
    showToast(`❌ Error: ${errMsg.slice(0, 60)}`, 5000, 'error');
  }
}
```

---

## prefers-reduced-motion

Always support accessibility:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  /* Skeleton screens degrade to static placeholder */
  .skeleton-shimmer {
    animation: none;
    background: var(--color-bg-elevated);
  }
}
```

---

## Common Mistakes

1. **Forgetting `!important` on `.open` transform** — browser may not apply the override
2. **Using `display:none` for feature buttons** — use `.disabled-ghost` instead so users know features exist
3. **Hardcoding placeholder text** — always add to I18N table and update in `applyI18n()`
4. **Panel z-index conflicts** — overlay at 45, panels at 50+, toast at 100
