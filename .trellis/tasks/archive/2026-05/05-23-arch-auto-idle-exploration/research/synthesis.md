# Architecture idle exploration synthesis

Scope: safe Trellis idle exploration limited to historical debt cleanup, architecture standardization, performance optimization, and security hardening. Out-of-scope items (business logic, API contracts, prompt/LLM flow, UI/routes/styling, test assertions) were excluded or demoted.

## Ranked deepening opportunities

### P0.1 — Remove redundant LRU cache timestamp fields

- **Category**: historical debt cleanup / performance micro-optimization
- **Files**: `src/services/route-service.ts`, `src/services/multi-source-service.ts`, `src/services/free-sources/index.ts`
- **Problem**: cache Modules store `timestamp` in `CacheEntry` while LRU `ttl` is already the authoritative freshness Interface. This weakens Locality because freshness is represented in both the LRU Adapter configuration and per-entry implementation fields.
- **Solution**: store only `result` in each CacheEntry. In `route-service`, replace manual `Date.now() - cached.timestamp < CACHE_TTL` with `if (cached)` because `allowStale: false` prevents stale return values.
- **Benefits**: improves Depth of the cache Module by keeping freshness behind the LRU Interface; increases Locality and reduces repeated internal fields. No external Interface change.
- **Evidence**: `research/backend-research.md` P0.1; code paths in the three files above.

### P0.2 — Add missing noopener/noreferrer on static blank-target anchors

- **Category**: security hardening
- **Files**: `web/index.html`, `web/help.html`
- **Problem**: several static anchors use `target="_blank"` without `rel="noopener noreferrer"`, while other anchors already follow that Adapter pattern. The link Interface is inconsistent and leaves opener access risk.
- **Solution**: add `rel="noopener noreferrer"` to remaining static `target="_blank"` anchors.
- **Benefits**: security hardening at a small HTML Seam with high Locality. No route, styling, or user-facing feature change intended.
- **Evidence**: `research/frontend-research.md` P0; code paths in the two HTML files above.

### P1 — Route `printConfigWarnings()` through logger Interface

- **Category**: architecture standardization / historical debt cleanup
- **Files**: `src/services/config.ts`, `src/services/logger.ts`
- **Problem**: config Module uses direct `console.*`, bypassing the logger Adapter.
- **Reason not P0**: output formatting may be observable in CLI/test snapshots, so it needs user review despite likely low risk.
- **Evidence**: `research/backend-research.md` P0.2 caveat.

### P1 — Introduce generic non-HTTP timeout helper

- **Category**: architecture standardization / performance hardening
- **Files**: candidate seam around `src/utils/concurrent.ts`, callers in `src/services/free-sources/index.ts`, `src/agent/travel-agent.ts`
- **Problem**: timeout `Promise.race` patterns are repeated across Modules.
- **Reason not P0**: error messages/timing can affect tests and logs.
- **Evidence**: `research/backend-research.md` P1.1.

### P1 — Standardize idempotent GET Adapters on `fetchWithRetry`

- **Category**: architecture standardization / performance optimization
- **Problem**: many GET-like Adapter calls use `fetchWithTimeout` rather than the deeper HTTP retry Interface.
- **Reason not P0**: retries change timing/upstream calls and may affect observable behavior.
- **Evidence**: `research/backend-research.md` P1.2.

### P1 — Module-local child logger constants

- **Category**: historical debt cleanup / performance micro-optimization / architecture standardization
- **Problem**: repeated `getLogger().child(...)` allocations reduce Locality.
- **Reason not P0**: import-time logger allocation can affect tests that mutate logger environment after import.
- **Evidence**: `research/backend-research.md` P1.3.

### P1 — Canonical frontend imports, root files as compatibility Adapters

- **Category**: architecture standardization / historical debt cleanup
- **Problem**: domain Modules still import through root compatibility Adapters.
- **Reason not P0**: browser ES Module path churn can break runtime loading.
- **Evidence**: `research/frontend-research.md` P1 canonical imports.

### P1 — Shared browser-safe HTML escaping Interface

- **Category**: security hardening / architecture standardization
- **Problem**: multiple rendering Modules cross string-to-HTML Seams independently.
- **Reason not P0**: rendering output can change visibly if escaping differs.
- **Evidence**: `research/frontend-research.md` P1 HTML escaping.

### P1 — Explicit web bundle build/freshness and fuller asset hashing

- **Category**: architecture standardization / performance optimization
- **Problem**: `web/pi-bundle.js` is an important runtime Interface but build/deploy freshness is not explicit; hash script misses root assets.
- **Reason not P0**: build/deploy mechanics can break release startup.
- **Evidence**: `research/frontend-research.md` P1 bundle/hash findings.

### P2 — Split large backend service Modules behind stable public Interfaces

- **Category**: historical debt cleanup / architecture standardization
- **Problem**: large Modules mix public Interface, cache, external Adapter, parsing, fallback, and enrichment.
- **Reason P2**: medium-scope refactor requiring careful slicing and tests.
- **Evidence**: `research/backend-research.md` P2.1.

### P2 — Split `web/modules/ui/map.js` behind stable public Adapter

- **Category**: architecture deepening / performance optimization / historical debt cleanup
- **Problem**: map Module is large and contains multiple internal responsibilities.
- **Reason P2**: high-effort browser runtime refactor.
- **Evidence**: `research/frontend-research.md` P2.

### P3 — Update architecture specs after accepted direction

- **Category**: architecture standardization
- **Problem**: specs lag behind implementation in some areas.
- **Reason P3**: design/documentation decision, not auto-code.
- **Evidence**: both research files.
