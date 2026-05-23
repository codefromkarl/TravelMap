# Tools & Services Layer Architecture Deepening Analysis
Date: 2026-05-23
Sources: src/tools/*.ts, src/services/*.ts (all files)

## 1. Shallow Modules (Interface ≈ Implementation)

### 1.1 `tts.ts` — Zero-Leverage Text Generator
- **File**: `src/tools/tts.ts`
- **Issue**: The `generateSpeechText()` function is a pure string builder with no external dependencies. The tool's interface (TypeBox schema with 20+ fields) is far more complex than the implementation (a simple string concatenation loop).
- **Depth Score**: Very shallow. The interface exposes a massive `TripPlanForTTS` schema that duplicates `TripPlan` from `types/trip.ts` with slightly different fields (e.g., `TripDayForTTS` vs `DayPlan`).
- **Leverage**: Zero — this logic could live in a 10-line utility or be inlined into the agent prompt.
- **Recommendation**: Delete the custom interface, use `TripPlan` directly, or move to a shared formatting module.

### 1.2 `ai-guide.ts` — Duplicated Interface, No External Service
- **File**: `src/tools/ai-guide.ts`
- **Issue**: Defines `AttractionForGuide` interface that is a subset of `Attraction` from `types/trip.ts`. The `generateGuideText()` function is a pure string builder with a `switch` on style — no service layer involved.
- **Depth Score**: Shallow. The tool is a formatting function masquerading as a tool.
- **Leverage**: Low — the style/length logic is trivial and doesn't justify a separate module.
- **Recommendation**: Merge into a shared "text formatting" service or inline into agent prompt templates.

### 1.3 `budget.ts` — Thin Wrapper Over `budget-service.ts`
- **File**: `src/tools/budget.ts`
- **Issue**: The tool defines 4 TypeBox schemas (`AttractionSchema`, `MealSchema`, `HotelSchema`, `DayPlanSchema`) that mirror `types/trip.ts` types. The `execute` function is essentially: `calculateBudget(params)` → format markdown. No error handling (synchronous service).
- **Depth Score**: Shallow. The tool adds formatting only.
- **Recommendation**: The schema duplication is the real problem — use the shared types directly via `Type.Ref` or a schema registry.

### 1.4 `multi-city.ts` — Pure Logic Tool
- **File**: `src/tools/multi-city.ts`
- **Issue**: Calls `planMultiCityRoute()` which is a pure function (no external API). The tool is just a formatter.
- **Depth Score**: Very shallow.
- **Recommendation**: Could be a helper function called by the agent directly, not a tool.

---

## 2. Weak Seams (Tight Coupling Between Tools ↔ Services)

### 2.1 Tools Do Formatting, Services Do Logic — Inconsistent Split
- **Pattern**: Most tools follow: `call service()` → `format markdown` → return. The formatting logic (~60% of tool code) lives in tools, not services.
- **Files**: `hotels.ts` (lines 67-89), `attractions.ts` (lines 52-73), `restaurants.ts` (lines 51-61), `transport.ts` (lines 56-70)
- **Issue**: If you change how hotels are displayed, you must edit the tool. If you change hotel search logic, you edit the service. But the **seam** between them is unclear — the tool knows about `h.tags`, `h.transitAccessible`, `h.walkMinutes` which are service-level concerns.
- **Recommendation**: Services should return display-ready data (or a presentation layer should exist). The current seam is at the wrong abstraction level.

### 2.2 `companion.ts` Tool Passes Entire TripPlan as Parameter
- **File**: `src/tools/companion.ts`
- **Issue**: The tool's `parameters` schema is a 100+ line TypeBox definition that duplicates the entire `TripPlan` type. The LLM must reconstruct the full trip plan as a tool parameter every call.
- **Coupling**: The tool is tightly coupled to `TripPlan` structure — any type change requires updating both `types/trip.ts` and the tool schema.
- **Recommendation**: Use a session/context store so the tool reads `TripPlan` from state, not from LLM parameters.

### 2.3 `action-links.ts` Tool Has Business Logic in Execute
- **File**: `src/tools/action-links.ts` (lines 52-100)
- **Issue**: The `execute` function contains significant business logic: iterating enriched days, counting links, categorizing into reservation/hotel/flight lists, formatting urgency emojis. This is not just "call service and format" — it's orchestration logic that belongs in the service layer.
- **Seam Violation**: The tool is doing work that `action-link-service.ts` should be doing.
- **Recommendation**: Move the categorization and counting logic into `enrichTripWithLiveLinks()` or a dedicated presentation function in the service.

---

## 3. Misplaced Adapters

### 3.1 `weather-service.ts` — Contains 4 Adapters in One File
- **File**: `src/services/weather-service.ts` (290 lines)
- **Issue**: This single file contains adapters for: QWeather API, Amap Weather API, OpenWeatherMap API, and mock data. Each has its own type definitions, API calling logic, and response mapping.
- **Misplacement**: The adapters are correctly in `services/`, but they should be separate files:
  - `services/weather/qweather-adapter.ts`
  - `services/weather/amap-weather-adapter.ts`
  - `services/weather/owm-adapter.ts`
  - `services/weather/weather-service.ts` (orchestrator)
- **Leverage**: The current structure makes it hard to test individual adapters or add new ones.

### 3.2 `hotel-service.ts` — Adapter + Business Logic + Caching Mixed
- **File**: `src/services/hotel-service.ts` (380+ lines)
- **Issue**: Contains: Amap POI adapter, Google Places adapter, mock data generator, LRU cache, budget filtering, distance calculation, AND the `enrichHotelsForTrip` orchestration. This is a "God Module."
- **Seam**: The adapter layer (API call → `HotelSearchResult`) is mixed with business logic (filtering, sorting, enrichment).
- **Recommendation**: Extract adapters into `services/hotel/amap-adapter.ts`, `services/hotel/google-adapter.ts`. Keep `hotel-service.ts` as orchestrator only.

### 3.3 `restaurant-service.ts` — Same Pattern as hotel-service
- **File**: `src/services/restaurant-service.ts` (350+ lines)
- **Issue**: Same God Module pattern. Also contains `haversineMeters()` which is duplicated from `hotel-service.ts`.
- **Duplication**: `haversineMeters()` appears in both `hotel-service.ts` and `restaurant-service.ts` (identical implementation).
- **Recommendation**: Extract to `services/geo-utils.ts`. Extract adapters.

### 3.4 `transport-service.ts` — Adapters Mixed with Enrichment
- **File**: `src/services/transport-service.ts`
- **Issue**: Contains Amap transit adapter, trvl flight adapter, mock generator, AND `enrichTransferDays` orchestration in one file.
- **Recommendation**: Separate adapters from orchestration.

---

## 4. Low Leverage Abstractions

### 4.1 `error-utils.ts` — ContextualError Underused
- **File**: `src/services/error-utils.ts`
- **Issue**: Defines `ContextualError`, `withContext()`, and `createServiceError()`. However, grep shows most services use `err instanceof Error ? err.message : String(err)` directly in catch blocks instead of using these utilities.
- **Leverage**: Low — the abstraction exists but is barely used. The tools layer has identical error handling in every `execute` function.
- **Recommendation**: Either enforce usage (add lint rule) or delete and simplify to a shared `formatError()` function.

### 4.2 `createApiClient()` in `http-client.ts` — Unused
- **File**: `src/services/http-client.ts`
- **Issue**: `createApiClient()` returns a configured `{ get, post }` client. But all services use `fetchWithTimeout` or `fetchWithRetry` directly with full URL construction.
- **Leverage**: Zero — the abstraction is defined but never consumed.
- **Recommendation**: Either adopt it across all services or delete it.

### 4.3 `trace-context.ts` — Imported but Minimally Used
- **File**: `src/services/trace-context.ts` (referenced in `http-client.ts`)
- **Issue**: `getTrace()` is called in retry logging but trace IDs are never propagated to external APIs or returned to callers.
- **Leverage**: Very low — adds complexity without observability value.
- **Recommendation**: Either implement full distributed tracing or remove.

---

## 5. Locality Issues (Repeated Logic)

### 5.1 Error Handling Pattern — Duplicated in Every Tool
- **Files**: All 15 tool files
- **Pattern**:
  ```typescript
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: `XXX遇到问题（${city}）：${msg}。建议...` }],
      details: { city, error: msg },
    };
  }
  ```
- **Duplication**: This exact pattern appears in `weather.ts`, `hotels.ts`, `attractions.ts`, `restaurants.ts`, `transport.ts`, `geocode.ts`, `discover.ts`, `supply-enrich.ts`.
- **Recommendation**: Extract a `wrapToolError(toolName, context, fallbackMessage)` utility.

### 5.2 Markdown Formatting Pattern — Duplicated Across Tools
- **Files**: `hotels.ts`, `restaurants.ts`, `attractions.ts`, `transport.ts`
- **Pattern**: Each tool has a hand-crafted markdown builder that joins items with `\n\n`, adds emoji prefixes, and builds a header with source/count info.
- **Locality Violation**: The "list of results with metadata" formatting pattern is repeated 4+ times.
- **Recommendation**: Create a shared `formatResultList(items, header, formatter)` utility.

### 5.3 `haversineMeters()` — Duplicated
- **Files**: `src/services/hotel-service.ts`, `src/services/restaurant-service.ts`
- **Duplication**: Identical implementation in both files.
- **Recommendation**: Extract to `services/geo-utils.ts`.

### 5.4 `WALK_SPEED_MPM` Constant — Duplicated
- **Files**: `src/services/hotel-service.ts`, `src/services/restaurant-service.ts`
- **Duplication**: Same constant `5000 / 60` defined in both.
- **Recommendation**: Extract to shared constants.

### 5.5 Mock Data Pattern — Duplicated Across Services
- **Files**: `weather-service.ts`, `hotel-service.ts`, `restaurant-service.ts`, `transport-service.ts`
- **Pattern**: Each service has its own `getMock*()` function that generates fake data with similar structure (name arrays, distance calculations, price generation).
- **Recommendation**: Create a `services/mock-factory.ts` with configurable generators.

### 5.6 Cache Pattern — Duplicated Across Services
- **Files**: `hotel-service.ts`, `restaurant-service.ts`, `transport-service.ts`
- **Pattern**: Each service independently creates an LRU cache, defines `CacheEntry` interface, implements `getCacheKey()`, and provides `clear*Cache()` for testing.
- **Recommendation**: Create a generic `createCachedService<T>(config)` factory.

### 5.7 `isDomesticCity()` Check — Used in 4+ Services
- **Files**: `hotel-service.ts`, `restaurant-service.ts`, `transport-service.ts`, `dual-map-service.ts`
- **Usage**: Each service calls `isDomesticCity()` to decide Amap vs Google routing.
- **Issue**: The routing decision (which API to call) is duplicated in every service instead of being centralized.
- **Recommendation**: Create a `MapRouter` that encapsulates the domestic/international decision and returns the appropriate adapter.

---

## 6. Depth Issues (Modules Too Shallow or Poor Leverage)

### 6.1 `image-recognize.ts` — Pure Client-Side Logic
- **File**: `src/tools/image-recognize.ts`
- **Issue**: `matchAttraction()` is a string-matching function that runs entirely in-memory. It doesn't call any service. The tool's "intelligence" is just keyword matching with `descLower.includes(name.toLowerCase())`.
- **Depth**: Extremely shallow — the interface (3 parameters with nested objects) is more complex than the implementation.
- **Leverage**: Near zero — this could be a prompt instruction to the LLM ("match the description against known attractions") instead of a tool.

### 6.2 `companion-service.ts` — Keyword Matching as "AI"
- **File**: `src/services/companion-service.ts`
- **Issue**: `detectIntent()` uses simple keyword matching (`lower.includes(kw)`) to route queries. This is a classic case of reimplementing what an LLM does natively.
- **Depth**: The service adds complexity (intent detection, attraction extraction, 10+ query handlers) but the leverage is low — an LLM with the trip data in context could answer these questions directly.
- **Recommendation**: Consider whether this tool is necessary at all, or if the agent should just have trip data in context.

### 6.3 Tool Registration (`index.ts`) — No Validation or Composition
- **File**: `src/tools/index.ts`
- **Issue**: `registerToolCostTiers()` iterates tools and calls `registerToolMetadata()`. This is a side-effect-based registration pattern that's hard to test and doesn't validate tool contracts.
- **Leverage**: Low — the grouping into `createSearchTools()`, `createPlanningTools()` etc. is useful, but the cost tier registration is a hidden side effect.
- **Recommendation**: Make registration explicit (return metadata alongside tools) or use a decorator pattern.

---

## 7. Summary of Highest-Impact Opportunities

| Priority | Finding | Impact | Effort |
|----------|---------|--------|--------|
| **P0** | Extract shared error handling utility for tools | Eliminates 8x duplication | Low |
| **P0** | Extract `haversineMeters` + `WALK_SPEED_MPM` to `geo-utils.ts` | Eliminates 2x duplication | Trivial |
| **P1** | Split God Modules (hotel/restaurant/weather/transport services) into adapters + orchestrator | Testability, maintainability | Medium |
| **P1** | Centralize domestic/international API routing into `MapRouter` | Eliminates 4x routing duplication | Medium |
| **P1** | Extract shared cache factory | Eliminates 3x cache boilerplate | Low |
| **P2** | Delete unused `createApiClient()` and `trace-context.ts` | Reduces dead code | Trivial |
| **P2** | Use `TripPlan` types directly in tool schemas instead of redefining | Eliminates schema drift risk | Medium |
| **P2** | Move tool formatting logic to service/presentation layer | Cleaner separation of concerns | Medium |
| **P3** | Evaluate if `companion-service` and `image-recognize` tools are necessary | Could simplify agent architecture | High (design decision) |

---

## 8. Architecture Vocabulary Summary

- **Module**: 15 tools + 37 services — too many shallow modules (tts, ai-guide, image-recognize)
- **Interface**: Tool schemas are over-specified (duplicate TripPlan in 4+ tools) — should use shared schema refs
- **Depth**: Several modules have interface ≈ implementation complexity (tts, ai-guide, multi-city, budget)
- **Seam**: Tools ↔ Services seam is at wrong abstraction (tools do formatting, services do everything else)
- **Adapter**: Adapters exist but are buried in God Modules (hotel-service, weather-service) — should be extracted
- **Leverage**: `createApiClient`, `trace-context`, `ContextualError` are defined but barely used — low leverage abstractions
- **Locality**: Error handling, markdown formatting, haversine, cache patterns, mock generators all violate locality
