# Backend `src/` Architecture Deepening Research

Task: `.trellis/tasks/05-23-arch-auto-idle-exploration`  
Scope: backend `src/` only, with emphasis on `src/services/`, `src/agent/`, and `src/tools/`.  
Allowed categories: historical debt cleanup, architecture standardization, performance optimization, security hardening.  
Explicit exclusions: no business logic changes, no prompt changes, no API contract/schema changes, no UI/routes/styling changes, no test assertion changes.

## Method

- Resolved current Trellis task with `python3 ./.trellis/scripts/task.py current --source`.
- Read backend Trellis specs:
  - `.trellis/spec/backend/index.md`
  - `.trellis/spec/backend/directory-structure.md`
  - `.trellis/spec/backend/error-handling.md`
  - `.trellis/spec/backend/quality-guidelines.md`
  - `.trellis/spec/backend/logging-guidelines.md`
- Inspected backend source inventory under `src/`.
- Used exact searches for `fetch`, `console.*`, `catch`, timeout/concurrency, sensitive config keys, and large modules.
- Used semantic context search for architecture seams and prior findings.

## Relevant Spec Constraints

Evidence:

- `.trellis/spec/backend/directory-structure.md` says:
  - `agent/` only orchestrates.
  - `tools/` defines Agent-callable tools.
  - `services/` encapsulates external API calls.
  - `types/` is pure type definitions.
- `.trellis/spec/backend/error-handling.md` says external API calls should go through `src/services/http-client.ts`, with timeout/retry/error categorization and fallback.
- `.trellis/spec/backend/logging-guidelines.md` forbids production `console.log` debug statements and requires sensitive URL/token redaction.
- `.trellis/spec/backend/quality-guidelines.md` forbids direct service-layer `fetch` outside wrappers and imports from `__tests__/` in non-test files.

## Source Shape Observations

Evidence paths:

- `src/services/http-client.ts` — central HTTP Interface (`fetchWithTimeout`, `fetchWithRetry`, `createApiClient`, `sanitizeUrl`).
- `src/services/logger.ts` — structured logger Interface with child logger, redaction, trace integration.
- `src/services/trace-context.ts` — trace propagation seam.
- `src/services/search-orchestrator.ts` — Provider Interface and parallel search orchestration.
- `src/services/xhs/router.ts` + `src/services/xhs/adapters/*` — Adapter pattern for XHS providers.
- Largest modules by line count:
  - `src/services/route-service.ts` ~688 lines
  - `src/agent/travel-agent.ts` ~568 lines
  - `src/services/hotel-service.ts` ~561 lines
  - `src/services/trellis-idle-explorer.ts` ~495 lines
  - `src/services/supply-validation-service.ts` ~465 lines
  - `src/services/multi-source-service.ts` ~465 lines
  - `src/agent/review-agent.ts` ~442 lines
  - `src/services/restaurant-service.ts` ~438 lines
  - `src/services/transport-service.ts` ~419 lines

Direct `fetch` evidence:

- `src/services/http-client.ts:102` is the only direct `fetch(...)` occurrence found under `src/services`, `src/agent`, `src/tools`; this matches the intended HTTP Interface.

Direct production `console.*` evidence outside logger:

- `src/services/config.ts:188`, `src/services/config.ts:192`, `src/services/config.ts:197`, `src/services/config.ts:200`
- `src/services/log-report.ts:66`, `src/services/log-report.ts:68`, `src/services/log-report.ts:81`
- `src/services/trellis-idle-explorer.ts:182`
- `src/services/logger.ts:192`, `src/services/logger.ts:194`, `src/services/logger.ts:196` are expected logger sink internals.

## P0 — Trivial, Low-Risk, High-Leverage, No Functional Change

### P0.1 Remove redundant cache timestamp fields where LRU TTL is already authoritative

Category: historical debt cleanup / performance micro-optimization  
Vocabulary: Module, Interface, Depth, Locality, Leverage

Evidence:

- `src/services/route-service.ts:30-43`
  - `CacheEntry` stores `{ result, timestamp }`.
  - `routeCache` already configures `ttl: CACHE_TTL`, `allowStale: false`, `ttlAutopurge: true`.
- `src/services/route-service.ts:359-361`
  - Reads cache and manually checks `Date.now() - cached.timestamp < CACHE_TTL`.
  - With `allowStale: false`, stale entries should not be returned by `routeCache.get(key)`, making the timestamp check redundant.
- `src/services/route-service.ts:434`
  - Writes `{ result, timestamp: Date.now() }`.
- `src/services/multi-source-service.ts:85-92`, `src/services/multi-source-service.ts:394`, `src/services/multi-source-service.ts:462`
  - `CacheEntry.timestamp` is written but not used for cache validation; LRU `ttl` handles expiry.
- `src/services/free-sources/index.ts:43-52`, `src/services/free-sources/index.ts:89`, `src/services/free-sources/index.ts:162`
  - Same redundant timestamp field: written but not read for behavior.

Opportunity:

- Simplify each cache Module's internal Interface to store only `result`.
- In `route-service`, replace `if (cached && Date.now() - cached.timestamp < CACHE_TTL)` with `if (cached)`.
- In `multi-source-service` and `free-sources/index`, remove unused `timestamp` from `CacheEntry` and writes.

Why P0:

- The external Interface does not change.
- LRU TTL already enforces freshness, so runtime behavior should remain equivalent.
- Improves Locality by making cache freshness live in one place: the LRU cache configuration.
- Small edit across specific files, high Leverage for reducing repeated cache boilerplate.

### P0.2 Route `printConfigWarnings()` through existing logger Interface instead of direct `console.*`

Category: architecture standardization / historical debt cleanup  
Vocabulary: Interface, Adapter, Locality, Leverage

Evidence:

- `src/services/config.ts:188` uses `console.log("[Config] ✅ 所有关键 API Key 已配置")`.
- `src/services/config.ts:192`, `src/services/config.ts:197`, `src/services/config.ts:200` use `console.warn(...)`.
- `src/services/logger.ts` already provides `getLogger().child({ component })`, level filtering, structured output, and redaction.
- `.trellis/spec/backend/logging-guidelines.md` forbids production `console.log` debug statements and says future structured logging should use a logger abstraction.

Opportunity:

- Import `getLogger` into `src/services/config.ts`.
- Create `const logger = getLogger().child({ component: "config" })` in `printConfigWarnings()`.
- Replace the success `console.log` with `logger.info(...)` and warning messages with `logger.warn(...)`.

Why P0:

- No business behavior changes.
- Keeps the same information flow but moves it behind the existing logging Adapter/Interface.
- Small, contained edit in one Module.
- Improves standardization and redaction/trace consistency.

Caveat:

- Output formatting changes from raw human strings to logger formatting/JSON in production. If any CLI snapshot relies on exact stdout/stderr text, this should be demoted to P1. I found no contract evidence in the inspected source, but this is still worth checking before implementation.

## P1 — Safe Architecture Standardization With Some Test Surface

### P1.1 Introduce a shared timeout helper and replace ad hoc `Promise.race(... setTimeout ...)`

Category: architecture standardization / performance hardening  
Vocabulary: Interface, Seam, Adapter, Depth, Locality

Evidence:

- `src/services/http-client.ts:92-112` implements timeout behavior for HTTP fetches using `AbortController`.
- `src/services/free-sources/index.ts:126-132` creates per-provider timeouts with `Promise.race([searchFn(), new Promise(... setTimeout ...)])`.
- `src/agent/travel-agent.ts:305-309` creates a pre-search timeout with `Promise.race([... setTimeout ...])`.
- `src/services/xhs/adapters/crawler.ts:114` uses a sleep Promise inside polling.
- `src/services/trellis-idle-explorer.ts:483` has a local sleep helper.

Opportunity:

- Add a small generic helper, likely in `src/utils/concurrent.ts` or `src/services/http-client.ts` depending on intended ownership:
  - `withTimeout<T>(promise: Promise<T>, timeoutMs: number, label?: string): Promise<T>`
  - Optional `sleep(ms)` utility if code wants to standardize polling/backoff too.
- Replace non-HTTP timeout race sites in free-source orchestration and TravelAgent pre-search.

Why P1:

- Creates a clear timeout Seam for non-HTTP async work.
- Reduces duplicated timer code and improves Locality of timeout semantics.
- Not P0 because error messages/timing behavior could affect tests and logs.

### P1.2 Standardize idempotent GET adapters on `fetchWithRetry` where currently using `fetchWithTimeout`

Category: architecture standardization / performance optimization  
Vocabulary: Adapter, Interface, Depth, Leverage

Evidence:

- `.trellis/spec/backend/error-handling.md` says GET requests should use `fetchWithRetry`; POST requests should generally use `fetchWithTimeout` unless idempotent.
- Current GET-style Adapter calls using `fetchWithTimeout` include:
  - `src/services/weather-service.ts:138`, `148`, `189`, `219`, `296`
  - `src/services/dual-map-service.ts:170`, `172`, `189`, `236`
  - `src/services/free-sources/opentripmap-adapter.ts:97`, `115`, `129`, `221`
  - `src/services/free-sources/qunar-adapter.ts:40`
  - `src/services/free-sources/wikipedia-adapter.ts:52`, `88`, `126`, `253`, `287`
  - `src/services/free-sources/wikivoyage-adapter.ts:28`, `228`, `279`
  - `src/services/supply-validation-service.ts:155`, `192`, `242`
  - `src/services/elevation-service.ts:91`
  - `src/services/image-service.ts:40`, `84`
  - XHS POST-like adapters use `fetchWithTimeout`, which may be appropriate and should not be blindly changed.
- GET-style Adapters already catching and falling back include many of these Modules.

Opportunity:

- Convert idempotent GET calls to the HTTP Interface's `fetchWithRetry`.
- Keep non-idempotent POST/crawler-start operations on `fetchWithTimeout` unless explicitly marked `idempotent`.
- Use scoped batches by Adapter family rather than a repository-wide mechanical edit.

Why P1:

- Aligns code with spec and centralizes retry policy.
- Improves resilience without API/schema changes.
- Not P0 because retry timing and number of upstream attempts change observable performance/log behavior.

### P1.3 Replace repeated per-call `getLogger().child(...)` in hot/error paths with module-local child logger constants

Category: historical debt cleanup / performance micro-optimization / architecture standardization  
Vocabulary: Module, Interface, Locality, Leverage

Evidence:

- Many Modules repeatedly allocate child loggers at catch sites, for example:
  - `src/services/restaurant-service.ts:350`, `423`
  - `src/services/hotel-service.ts:439`, `523`
  - `src/services/transport-service.ts:102`, `132`, `214`, `313`, `328`, `408`
  - `src/services/route-service.ts:387`, `661`
  - `src/services/multi-source-service.ts:344`, `411`, `427`
  - `src/services/action-link-service.ts:187`, `271`, `298`
- `src/services/logger.ts` child logger Interface is stable and designed for contextual logging.

Opportunity:

- In each Module, define a module-local logger, e.g. `const logger = getLogger().child({ component: "transport-service" });`.
- Reuse it across catch/fallback sites.

Why P1:

- Improves Locality and reduces repeated boilerplate.
- Very low behavior risk if done Module-by-Module.
- Not P0 because logger instantiation timing can affect tests that mock/set/reset logger after import. Check test patterns before implementation.

### P1.4 Add concurrency limits at deep fan-out seams instead of unbounded nested `Promise.all`

Category: performance optimization / security hardening against resource exhaustion  
Vocabulary: Depth, Seam, Adapter, Leverage

Evidence:

- `src/services/route-service.ts:614`, `src/services/route-service.ts:620` perform nested `Promise.all` route enrichment.
- `src/services/hotel-service.ts:461` enriches days with `Promise.all`.
- `src/services/restaurant-service.ts:388` enriches meals with `Promise.all`.
- `src/services/supply-enrich-service.ts:57`, `127`, `129`, `171`, `173` uses nested `Promise.all` over routes/days/attractions.
- `src/services/search-orchestrator.ts:70` fans out providers in parallel.
- Existing `src/utils/concurrent.ts` exists and should be inspected before adding new primitives.

Opportunity:

- Reuse or extend `src/utils/concurrent.ts` to support bounded concurrency for external-service-heavy enrichment.
- Apply at Adapter boundaries where the operation fans out into API calls or CPU-heavy enrichment.

Why P1:

- Improves Depth at the concurrency Seam without changing contracts.
- Helps prevent accidental upstream burst traffic and local event-loop pressure.
- Not P0 because concurrency ordering/timing and latency may change.

## P2 — Medium-Scope Deepening, Keep Behavior Stable but Requires Careful Slicing

### P2.1 Split very large service Modules into internal helper Modules without changing exported Interface

Category: historical debt cleanup / architecture standardization  
Vocabulary: Module, Interface, Depth, Locality

Evidence:

- Large Modules combine public Interface, cache, API Adapter calls, parsing/mapping, fallback, and enrichment:
  - `src/services/route-service.ts` ~688 lines
  - `src/services/hotel-service.ts` ~561 lines
  - `src/services/supply-validation-service.ts` ~465 lines
  - `src/services/multi-source-service.ts` ~465 lines
  - `src/services/restaurant-service.ts` ~438 lines
  - `src/services/transport-service.ts` ~419 lines
- `src/services/xhs/` already demonstrates a deeper Module design with `router.ts`, `types.ts`, `utils.ts`, and `adapters/`.
- `src/services/search/providers/*` demonstrates Provider Interface extraction for orchestrated search.

Opportunity:

- Preserve public exports while extracting pure helper Modules:
  - `route-service.ts` → route cache, route risk calculation, UGC route extraction, route filtering.
  - `hotel-service.ts` → provider mappers, cache helpers, enrichment helpers.
  - `supply-validation-service.ts` → map-provider adapters and validation scoring.
- Use barrel exports only if already consistent with project style; otherwise keep imports explicit to avoid circular Depth.

Why P2:

- Improves Locality and reduces large Module cognitive load.
- Safer if done as internal moves with no exported API change.
- Not P1 because it touches many imports and tests may rely on `_test` exports or file-local helpers.

### P2.2 Create a reusable Map/Geocode Adapter seam for repeated Amap/Google request patterns

Category: architecture standardization / security hardening  
Vocabulary: Adapter, Seam, Interface, Leverage, Locality

Evidence:

Repeated map/geocode URL construction appears in several Modules:

- `src/services/dual-map-service.ts:188`, `216`
- `src/services/weather-service.ts:147`, plus weather-specific map/geocode lookups at `137`, `148`
- `src/services/transport-service.ts:107-128` geocodes origin/destination before transit search.
- `src/services/supply-validation-service.ts:150`, `189`, `240` constructs Amap/Google place/detail URLs.
- `src/services/search/providers/geocode-provider.ts:17` runs geocode provider work in parallel.

Opportunity:

- Extract an internal Adapter Interface for map providers:
  - build URL safely with `URL`/`URLSearchParams` rather than interpolated query strings;
  - share timeout/retry choice;
  - centralize key redaction behavior through `http-client` and logger.
- Keep service-level return values and data mapping unchanged.

Why P2:

- High Leverage, especially for security hardening and consistency.
- Not P1 because provider-specific behavior and fallback ordering must remain carefully preserved.

### P2.3 Clarify deprecated compatibility Modules and entry exports

Category: historical debt cleanup / architecture standardization  
Vocabulary: Module, Interface, Leverage

Evidence:

- `src/services/attraction-service.ts:1-8` says this file is a backward-compatible re-export/compat layer and deprecated.
- `src/services/attraction-service.ts:28` says `searchAttractions()` is deprecated in favor of `searchAttractionsMultiSource()`.
- `src/index.ts:10` still exports `searchAttractions` from the deprecated compatibility Module.

Opportunity:

- Do not remove or rename public exports unless a contract migration is explicitly approved.
- Low-risk cleanup options within current constraints:
  - add a clear internal comment in `src/index.ts` that this export is a compatibility Interface;
  - ensure new internal code imports `searchAttractionsMultiSource` directly rather than the deprecated Module;
  - optionally add lint/documentation guidance later.

Why P2:

- The cleanup itself is conceptually simple, but public package exports are API contracts. Avoid implementation unless an API compatibility decision is made.

## P3 — Track, But Not Recommended for This Auto-Idle Cleanup Pass

### P3.1 Update backend spec docs to reflect current logger/trace architecture

Category: architecture standardization documentation  
Vocabulary: Interface, Adapter, Module

Evidence:

- `.trellis/spec/backend/logging-guidelines.md` still says structured logging is a future reserved Interface.
- Actual implementation already exists in `src/services/logger.ts` and `src/services/trace-context.ts`.
- Prior archived task `.trellis/tasks/archive/2026-05/05-19-tracing-infrastructure/prd.md` describes logger/trace goals.

Opportunity:

- Update specs to say structured logger is now active and should be used for production Modules.

Why P3 here:

- This research task is restricted to writing under `research/`; implementation should not edit specs.
- It is useful future memory but not a backend `src/` code change.

### P3.2 Do not touch prompt or planning semantics while splitting `TravelAgent`

Category: architecture standardization guardrail  
Vocabulary: Module, Depth, Seam

Evidence:

- `src/agent/travel-agent.ts` is ~568 lines and includes config warning, model setup, tool wrapping/cost tracking, pre-search, steer/finalize/edit flows, post-process, and review repair.
- The user explicitly excludes prompt/business/API changes.

Opportunity:

- Future refactor could extract non-semantic infrastructure helpers, but any edit near prompt/model/steer behavior risks crossing excluded scope.

Why P3:

- High regression risk relative to the allowed cleanup categories.
- Avoid in auto-idle work unless a narrow no-functional-change helper extraction is reviewed first.

## Security Hardening Notes

### Positive evidence

- Direct `fetch` is centralized in `src/services/http-client.ts:102`.
- `src/services/http-client.ts:75-87` sanitizes sensitive URL query keys: `key`, `appid`, `token`, `api_key`, `apikey`, `secret`, `password`, `auth`.
- `src/services/logger.ts:24-35` redacts sensitive object fields including `Authorization` and `client_secret`.
- `src/services/xhs/adapters/crawler.ts:8-38` validates crawler base URL against localhost/internal/K8s patterns to reduce SSRF risk.

### Non-P0 hardening opportunities

- Prefer `URL`/`URLSearchParams` over interpolated query strings in map/weather/supply modules. Evidence examples:
  - `src/services/weather-service.ts:137`, `147`, `188`, `218`, `295`
  - `src/services/dual-map-service.ts:188`, `216`
  - `src/services/transport-service.ts:118`
  - `src/services/supply-validation-service.ts:150`, `189`, `240`
- This is security-positive but not P0 because URL encoding and exact query ordering can change tests/logs.

## Findings Not Recommended Under Current Constraints

- Do not alter tool TypeBox schemas or Agent tool parameter contracts.
- Do not change prompt text, model selection, planning heuristics, fallback mock data semantics, ranking/scoring, itinerary content, or route/business rules.
- Do not change test assertions as part of this research output.
- Do not remove deprecated public exports without explicit API compatibility approval.

## Suggested Implementation Order

1. P0.1 cache timestamp cleanup in:
   - `src/services/route-service.ts`
   - `src/services/multi-source-service.ts`
   - `src/services/free-sources/index.ts`
2. P0.2 logger standardization in:
   - `src/services/config.ts`
3. P1.1 timeout helper, starting only with:
   - `src/services/free-sources/index.ts`
   - optionally `src/agent/travel-agent.ts` only if prompt/business behavior is untouched.
4. P1.3 module-local child logger constants, one Module per PR/change batch.
5. P1.4 concurrency limits, only after inspecting/reusing `src/utils/concurrent.ts`.
6. P2 extractions only with narrow file-by-file diffs and full typecheck/test verification.

## Verification Needed Before Any Code Change

For P0 changes:

- Run `npm run typecheck` or scoped equivalent.
- Run unit tests for affected services if available:
  - `src/__tests__/unit/services/route-service.test.ts`
  - `src/__tests__/unit/services/multi-source-service.test.ts`
  - `src/__tests__/unit/services/free-sources.test.ts`
  - `src/__tests__/unit/services/config.test.ts`

No implementation was performed in this research task.
