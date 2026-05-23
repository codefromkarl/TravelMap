# Frontend/modules/scripts architecture research

Task: `.trellis/tasks/05-23-arch-auto-idle-exploration`

Scope requested: safe architecture deepening opportunities limited to historical debt cleanup, architecture standardization, performance optimization, and security hardening. This research intentionally excludes business logic, API contract/schema, UI/routes/pages/styling, agent prompts/LLM flow, and test assertion changes.

Vocabulary used: Module, Interface, Depth, Seam, Adapter, Leverage, Locality.

## Evidence inspected

- Active task resolved with `python3 ./.trellis/scripts/task.py current --source` → `.trellis/tasks/05-23-arch-auto-idle-exploration`.
- Frontend specs:
  - `.trellis/spec/frontend/index.md`
  - `.trellis/spec/frontend/directory-structure.md`
  - `.trellis/spec/frontend/hook-guidelines.md`
  - `.trellis/spec/frontend/quality-guidelines.md`
  - `.trellis/spec/frontend/state-management.md`
  - `.trellis/spec/frontend/type-safety.md`
  - `.trellis/spec/guides/code-reuse-thinking-guide.md`
- Frontend modules/scripts/config:
  - `web/index.html`
  - `web/_headers`
  - `web/modules/**/*.js`
  - `web/entry.ts`, `web/entry-core.ts`, `web/entry-pi-ai.ts`
  - `scripts/build-bundle.cjs`
  - `scripts/deploy.sh`
  - `scripts/dev-server.ts`
  - `scripts/hash-assets.js`
  - `package.json`, `vitest.workspace.ts`

## Context summary

The current frontend architecture is a vanilla browser ES Module application. Specs describe a no-bundler frontend with module-level state and a `context.js` hub, but the implementation has since been partially deepened into domain folders:

- Canonical domain Modules now exist, for example:
  - `web/modules/infra/context.js`
  - `web/modules/infra/db.js`
  - `web/modules/infra/i18n.js`
  - `web/modules/infra/model-config.js`
  - `web/modules/trip/chat-init.js`
  - `web/modules/trip/export.js`
  - `web/modules/trip/history.js`
  - `web/modules/ui/map.js`
  - `web/modules/ui/panels.js`
  - `web/modules/auth/auth.js`
  - `web/modules/share/share.js`
- Root compatibility Modules remain as two-line Adapter re-exports, e.g. `web/modules/context.js`, `web/modules/map.js`, `web/modules/share.js`, etc.
- `web/index.html` imports canonical paths for startup side effects, but many canonical modules still import through root compatibility Adapters (`../db.js`, `../i18n.js`, `../map.js`, `../share.js`, etc.).

This creates a useful Seam: the root files are compatibility Adapters. Keeping them for tests/backward compatibility is valid, but canonical modules should increasingly depend on canonical Interfaces directly to improve Locality and reduce indirection.

## Findings and opportunities

### P0 — Add missing `rel="noopener noreferrer"` to existing `target="_blank"` links

Category: security hardening  
Depth: shallow  
Leverage: medium  
Locality: very high  
Risk: very low  
Functional change: none intended

Evidence:

- `web/index.html:283` has terms/privacy links with `target="_blank"` and no `rel`.
- `web/index.html:622` has help link with `target="_blank"` and no `rel`.
- `web/help.html:173`, `web/help.html:182`, `web/help.html:184` have `target="_blank"` and no `rel`.
- Some other links already use `rel="noopener noreferrer"`, e.g. `web/index.html:482`, `web/index.html:614`, `web/index.html:619`, `web/index.html:620`, proving the desired Interface pattern already exists.

Suggested edit:

- Add `rel="noopener noreferrer"` to every remaining `target="_blank"` anchor in static frontend HTML.

Why P0:

- It is a tiny, localized security-hardening cleanup with no business, route, UI, schema, prompt, or test assertion change.
- It standardizes the existing security Adapter pattern already used elsewhere in the same file.

Validation:

- `rg -n 'target="_blank"' web/*.html web/index.html`
- Browser smoke load of `web/index.html` or existing page-load/e2e smoke if available.

---

### P1 — Standardize canonical imports inside domain Modules and treat root files as compatibility Adapters only

Category: architecture standardization / historical debt cleanup  
Depth: medium  
Leverage: high  
Locality: medium  
Risk: moderate because import paths are runtime-loaded browser ES Modules

Evidence:

Root compatibility Adapter files:

- `web/modules/context.js:1-2` → re-exports `./infra/context.js`
- `web/modules/map.js:1-2` → re-exports `./ui/map.js`
- `web/modules/share.js:1-2` → re-exports `./share/share.js`
- Similar two-line Adapters exist for `auth.js`, `chat-init.js`, `config.js`, `db.js`, `export.js`, `history.js`, `i18n.js`, `model-config.js`, `panels.js`, `prompt.js`, `session.js`, `storage.js`, `supply-cache.js`, `travelers.js`, `welcome.js`.

Canonical Modules still importing through compatibility Adapters:

- `web/modules/trip/chat-init.js:39` imports `../config.js` instead of `../infra/config.js`.
- `web/modules/trip/chat-init.js:50-58` imports `../prompt.js`, `../welcome.js`, `../map.js`, `../i18n.js`, `../session.js`, `../travelers.js`, `../export.js`, `../share.js`, `../db.js` instead of canonical domain paths.
- `web/modules/trip/export.js:2`, `web/modules/trip/export.js:6` import through root Adapters.
- `web/modules/trip/session.js:13`, `web/modules/trip/history.js:2`, `web/modules/trip/supply-cache.js:8` import `../db.js`.
- `web/modules/auth/auth.js:2`, `web/modules/ui/map.js:2-3`, `web/modules/infra/model-config.js:2-6` also use root Adapter paths.

Why this matters:

- Module Depth was improved by domain grouping, but Interface dependencies did not fully follow the new Depth.
- Compatibility Adapters are now a useful external Seam for tests/legacy imports, but canonical Modules depending on them increases indirection and makes dependency direction harder to reason about.
- This is historical debt from the earlier domain-grouping migration. `.trellis/tasks/05-19-arch-frontend-domain-grouping/prd.md` explicitly noted import-path risk during grouping.

Suggested approach:

1. Keep root re-export files as explicit compatibility Adapters.
2. Update canonical domain Modules to import canonical paths directly:
   - `trip/*` → `../infra/db.js`, `../infra/i18n.js`, `../ui/map.js`, `../share/share.js`, etc.
   - `auth/*` → `../infra/context.js`, `../infra/i18n.js`.
   - `ui/*` → `../infra/context.js`, `../infra/db.js`, `../infra/i18n.js`.
3. Do this in small batches by domain to preserve Locality.

Validation:

- `npm run test:frontend`
- Browser startup smoke because these are browser ES Modules loaded directly.
- Optional static check: `rg -n "from '../(config|context|db|i18n|map|panels|prompt|session|share|travelers|welcome|model-config|auth|export|history|storage|supply-cache)\.js'" web/modules/{auth,infra,trip,ui,share}` should trend toward zero for canonical modules.

Not P0 because import-path churn can break runtime module loading if any relative path is missed.

---

### P1 — Extract a browser-safe HTML/string escaping Interface shared by rendering Modules

Category: security hardening / architecture standardization / code reuse  
Depth: medium  
Leverage: high  
Locality: medium  
Risk: moderate because rendering output is user-visible; implementation can be no-functional-change if limited to identical escaping behavior

Evidence:

- `web/modules/ui/map.js:8-15` defines a local `escapeHtml(str)` helper.
- Multiple Modules assign generated strings to `innerHTML`, including:
  - `web/modules/trip/history.js:80`, `web/modules/trip/history.js:83`
  - `web/modules/trip/export.js:72`, `web/modules/trip/export.js:158`
  - `web/modules/infra/model-config.js:82`, `web/modules/infra/model-config.js:99`, `web/modules/infra/model-config.js:326`
  - `web/modules/waterfall.js:27`, `web/modules/waterfall.js:240`, `web/modules/waterfall.js:287`, `web/modules/waterfall.js:294`, `web/modules/waterfall.js:314`
  - `web/modules/weather-chart.js:108`
  - `web/modules/anchor-link.js:97`
  - `web/modules/feedback.js:30`, `web/modules/feedback.js:177`
- Frontend quality specs forbid unsafe global patterns and require security-conscious rendering, but there is no central HTML escaping Adapter documented or exposed.

Why this matters:

- Rendering Modules currently each decide how to cross the string→HTML Seam.
- A shared `escapeHtml` / `safeText` Interface would increase Depth by centralizing one security-sensitive concern without changing business logic.
- It also aligns with `.trellis/spec/guides/code-reuse-thinking-guide.md`: duplicate security logic should not diverge across Modules.

Suggested approach:

- Add a small infra utility, for example `web/modules/infra/html.js`, with pure helpers only:
  - `escapeHtml(value)`
  - optionally `setText(el, value)` or `optionHtml(value)` if needed
- First migrate only low-risk cases where current behavior is already escaping or where values are known to be plain text.
- Do not rewrite rich HTML renderers wholesale unless each data insertion is reviewed.

Validation:

- Focused frontend unit tests for the helper.
- Existing tests touching renderers: `npm run test:frontend`.
- Browser smoke of generated/history/share panels if later code changes are made.

Not P0 because renderer changes can accidentally alter visible markup or escaping semantics.

---

### P1 — Make build/deploy bundle generation explicit and check freshness of `web/pi-bundle.js`

Category: architecture standardization / performance optimization / historical debt cleanup  
Depth: medium  
Leverage: high  
Locality: medium  
Risk: low-to-moderate

Evidence:

- `web/index.html:52-60` import map points `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-web-ui`, and `lit` to `./pi-bundle.js`.
- `web/entry.ts:1-3` is the bundle entry that re-exports `ChatPanel`, storage Interfaces, `Agent`, `getModel`, and `Type`.
- `scripts/build-bundle.cjs:67-76` builds `web/pi-bundle.js` with esbuild.
- `package.json:7-23` has `build: tsc`, but no script that invokes `scripts/build-bundle.cjs`.
- `scripts/deploy.sh:39-91` rsyncs `web/`, builds Pages Functions, hashes assets, then deploys. It does not call `scripts/build-bundle.cjs` before copying/deploying.

Why this matters:

- The browser app’s runtime Interface to pi packages is `web/pi-bundle.js`, but the build command and deploy script do not make that dependency explicit.
- This creates a stale-artifact Seam: source can change while deploy ships an old bundle.
- It also reduces reproducibility and makes performance optimization of the bundle harder to govern.

Suggested approach:

- Add explicit scripts, for example:
  - `build:web-bundle`: `node scripts/build-bundle.cjs`
  - optionally update `build` or `deploy` to run it before copying `web/`.
- Add a freshness check in deploy or CI that fails if `web/pi-bundle.js` is older than relevant inputs (`web/entry.ts`, `scripts/build-bundle.cjs`, local pi package dist files if feasible).

Validation:

- `npm run build:web-bundle`
- `npm run build`
- Local browser startup against `web/index.html` served over HTTP.

Not P0 because deploy/build flow changes can affect release mechanics even when runtime behavior is intended to remain identical.

---

### P1 — Hash all deploy-time JS/CSS assets referenced by import map and static links, not only `modules/` and `styles/`

Category: performance optimization / architecture standardization  
Depth: medium  
Leverage: medium-high  
Locality: high  
Risk: moderate because incorrect HTML rewrite can break startup

Evidence:

- `scripts/hash-assets.js:24-34` only matches references under `modules/` and `styles/`.
- `web/index.html:55-58` references `./pi-bundle.js` from the import map; this is not hashed by `scripts/hash-assets.js`.
- `web/index.html:61-65` references local CSS files and `./pi-web-ui.css`; `./pi-web-ui.css` is also outside `styles/`, so it is not hashed by the current patterns.
- `web/_headers` currently sets `/*.js` as no-cache/no-store, which mitigates stale JS but prevents long-lived immutable caching. `/*.css` is cached for 1 hour only.

Why this matters:

- Hashing only some assets creates an asymmetric caching Adapter: module/style files get content-addressed names, but the largest bundle Interface likely remains unversioned.
- If all static JS/CSS references in `index.html` are content-hashed, `_headers` can eventually move hashed assets to long-lived immutable cache while preserving HTML no-cache.

Suggested approach:

- Extend `scripts/hash-assets.js` to include direct local root assets referenced by `index.html`, at minimum:
  - `pi-bundle.js`
  - `pi-web-ui.css`
- Keep `index.html` no-cache.
- Only after verified hashing, consider stronger cache headers for hashed assets.

Validation:

- Run `node scripts/hash-assets.js <tmp-web-copy>` and inspect rewritten import map and stylesheet refs.
- Serve the temp copy and verify module loading.

Not P0 because asset rewrite scripts can break import maps if mishandled.

---

### P2 — Split `web/modules/ui/map.js` into deeper internal Modules behind a stable public Adapter

Category: architecture deepening / performance optimization / historical debt cleanup  
Depth: high  
Leverage: high  
Locality: low initially  
Risk: high if done broadly

Evidence:

- `web/modules/ui/map.js` is about 2001 lines, the largest frontend Module by far (`wc -l` result).
- It currently contains multiple responsibilities:
  - coordinate conversion (`gcj02ToWgs84`, internal WGS/GCJ helpers)
  - route planning fetch/cache (`fetchWalkingRoute`, `fetchDrivingRoute`, `_routeCache`)
  - geocoding/cache integration (`getCachedCoord`, `setCachedCoord`)
  - Leaflet rendering and marker/popup behavior
  - map UI event handlers
  - streaming parser helpers
  - several `window._*` E2E/runtime hooks
- The root Adapter `web/modules/map.js` already re-exports `./ui/map.js`, and tests import the root Adapter for coordinate/parser functions.

Why this matters:

- The Module has excessive Depth in one file and weak Locality: changing rendering, geocoding, parser, or route cache all touches one large surface.
- A stable public Adapter can preserve the current Interface while internal Modules gain Depth.

Suggested approach:

- Preserve `web/modules/ui/map.js` public exports initially.
- Extract pure/no-DOM seams first:
  - `web/modules/ui/map/coords.js` for coordinate conversion.
  - `web/modules/ui/map/route-cache.js` for route key/cache helpers.
  - possibly `web/modules/ui/map/streaming-parser.js` for parser state.
- Avoid changing map UI behavior or route/page behavior.

Validation:

- Existing map-focused tests: `web/modules/__tests__/map-coord.test.js`, `web/modules/__tests__/map-geocode.test.js`.
- `npm run test:frontend`.
- Browser map startup smoke.

Not P1/P0 because this file is central and runtime hooks are numerous.

---

### P2 — Introduce a typed browser storage/config Adapter to reduce direct `localStorage` scattering

Category: architecture standardization / security hardening / historical debt cleanup  
Depth: medium-high  
Leverage: medium-high  
Locality: medium-low  
Risk: moderate

Evidence:

Direct `localStorage` use appears across many Modules:

- `web/modules/infra/context.js:6`, `47`, `55`, `216`, `228`, `235`
- `web/modules/infra/config.js:50-51`
- `web/modules/infra/model-config.js:26-63`, `158`, `183-211`, `245`, `377`, `406`, `422`, `425`, `463`
- `web/modules/trip/chat-init.js:74`, `76`, `90`, `137`, `522`
- `web/modules/trip/export.js:84`, `102`, `113`, `220`, `226`
- `web/modules/trip/travelers.js:8`, `15`, `20`, `27`
- `web/modules/location.js:23`, `27`, `41`, `58`
- `web/modules/trace.js:22`, `25`
- `web/modules/ui/map.js:771`, `810`
- `web/modules/logger.js:163`, `173`

There is already an AppStorage-style Adapter in `web/modules/infra/storage.js`, but it is initialized as a side-effect and does not yet cover most config/preference storage.

Why this matters:

- Direct storage calls blur the Interface between UI Modules and persistence.
- Secrets/API keys, preferences, and cache keys share the same primitive API, which weakens security review and makes migration harder.

Suggested approach:

- Add a small typed storage/config Adapter, for example under `web/modules/infra/user-settings.js` or extend `infra/storage.js` with explicit getters/setters.
- Start with non-sensitive preferences (language, thinking level, panel width) before API key storage.
- Do not change key names or persistence semantics in the first pass.

Validation:

- Existing frontend unit tests for config/model/travelers/location/trace/storage.
- Manual smoke verifying preferences survive reload.

Not P1 because changing storage boundaries can produce subtle migration/regression issues.

---

### P2 — Replace production-facing `console.*` in browser Modules with the existing logger Adapter where appropriate

Category: architecture standardization / security hardening  
Depth: medium  
Leverage: medium  
Locality: medium  
Risk: moderate if logs are used as diagnostics in tests

Evidence:

- `web/modules/auth/auth.js:33`, `57` use `console.log` even though the same Module creates `logger = createLogger('auth')`.
- `web/modules/ui/map.js` has several `console.log`, `console.warn`, `console.error`, `console.debug` diagnostics around geocoding, POI, autosave, route planning, etc.
- `web/modules/trip/chat-init.js` logs migration, agent errors, autosave, etc.
- `web/modules/infra/db.js:280`, `334` log migration messages.
- `web/modules/logger.js` already provides a logging Interface with levels backed by `localStorage`.

Why this matters:

- The project has a logging Adapter but not all browser Modules use it, so observability policy is inconsistent.
- Standardizing on `createLogger()` improves control over noisy logs and avoids accidental sensitive details in production console output.

Suggested approach:

- Start with Modules that already import or can easily import logger without circular dependencies.
- Keep `console.error` for hard startup failures only if desired by policy.
- Avoid changing log message content used by tests unless tests are updated separately in a dedicated task.

Validation:

- `npm run test:frontend`
- Browser startup console check.

Not P1 because diagnostics changes can alter expected debugging behavior.

---

### P2 — Add a fetch timeout/error-handling Adapter for browser Modules

Category: performance optimization / security hardening / architecture standardization  
Depth: medium  
Leverage: medium  
Locality: medium  
Risk: moderate

Evidence:

- `web/modules/ui/map.js:290-291` defines a local fetch-with-timeout pattern using `AbortController`.
- `web/modules/infra/model-config.js:130-141` and `303` use `fetch` with `AbortSignal.timeout(...)`.
- `web/modules/location.js:142`, `web/modules/tools/weather.js:39`, `web/modules/tools/hotels.js:126` call `fetch` directly.
- Frontend specs require fetch calls to have error handling (`.trellis/spec/frontend/quality-guidelines.md` and `hook-guidelines.md`), but timeout/error handling is implemented per Module.

Why this matters:

- Network calls cross an external Interface Seam; timeout, error shape, and telemetry should be standardized.
- A small `infra/http.js` Adapter can improve consistency without touching API contracts or business logic.

Suggested approach:

- Add `fetchJson(url, { timeoutMs, headers, signal })` or `fetchWithTimeout(...)` in `web/modules/infra/http.js`.
- Migrate only same-semantics calls first, preserving URLs, request bodies, response validation, and errors.

Validation:

- Existing frontend tests for location/weather/hotels/model-config if present.
- Browser smoke for model fetch and map geocoding.

Not P1 because network timing behavior can change if default timeouts are introduced incorrectly.

---

### P3 — Update `.trellis/spec/frontend/*` to match the current domain-grouped Module architecture after code settles

Category: architecture standardization / historical debt cleanup  
Depth: documentation/spec  
Leverage: medium  
Locality: high  
Risk: low, but outside this research agent’s write scope

Evidence:

- `.trellis/spec/frontend/index.md:43-48` still lists root files like `web/modules/context.js`, `web/modules/i18n.js`, `web/modules/map.js`, `web/modules/db.js` as key files.
- `.trellis/spec/frontend/directory-structure.md:23-33` still documents a mostly flat `web/modules/` layout.
- Current implementation has domain folders and root compatibility Adapters.

Why this matters:

- The spec no longer represents the actual Module Depth and Interface boundaries.
- Future agents may follow stale guidance and add new code to root Adapters or flat paths.

Suggested approach:

- After import standardization, update frontend specs to document:
  - canonical domain Modules under `infra/`, `trip/`, `ui/`, `auth/`, `share/`
  - root files as compatibility Adapters only
  - when to add new root Adapters, if ever

Validation:

- Documentation review only.

P3 because it is documentation-only and should follow code decisions, not precede them.

## Explicit non-recommendations due to task constraints

The following were intentionally not proposed:

- No business logic changes to trip generation, route decisions, provider selection, quota/auth behavior, or sharing semantics.
- No API contract/schema changes for Cloudflare Functions or backend endpoints.
- No UI/routes/pages/styling redesigns.
- No agent prompt or LLM flow changes.
- No test assertion changes as an architecture opportunity.

## Suggested first implementation slice

If an implementation task is created from this research, the safest sequence is:

1. P0: add `rel="noopener noreferrer"` to remaining blank-target anchors.
2. P1: add explicit `build:web-bundle` script and deploy freshness/build step.
3. P1: standardize canonical imports by one domain at a time, keeping root Adapter files.
4. P1/P2: add shared security/infra Adapters (`html.js`, later `http.js`, later storage/config Adapter) before broad migrations.

Each slice should be verified with at least `npm run test:frontend` plus browser startup smoke when ES Module paths or startup assets are touched.
