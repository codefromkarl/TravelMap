# Weather-aware itinerary UX research

## Scope and recommendation

This research covers the smallest useful UX for:

1. per-day weather in the itinerary experience;
2. deterministic weather risk and actionable advice;
3. a contextual external Windy radar link.

The recommended MVP is **not** a Windy iframe or a radar tile layer. It is:

- require the assistant's final itinerary Markdown to place a compact weather line inside each day's section;
- render the same normalized, deterministic weather/risk summary in the project-owned map route panel for every day;
- show an external `查看实时雷达` / `View live radar` link only on a day where short-term precipitation or storm risk makes radar useful;
- leave the always-visible map toolbar and the bottom day-filter pills unchanged.

The route panel is the best deterministic UI insertion point. The chat transcript is rendered by an external Web Component, while the route panel is already project-owned, organized by day, clickable back into the matching chat day, and covered by existing map-panel tests.

## Confirmed repository facts

### 1. The chat itinerary is AI Markdown, not a project-owned day-card component

- The left side of the map page contains a `pi-chat-panel`; there is no separate itinerary-card container (`web/index.html:494-508`).
- `pi-chat-panel` comes from `@earendil-works/pi-web-ui` and is explicitly described as the external component that the project does not modify (`.trellis/spec/frontend/component-guidelines.md:9-12`).
- On agent completion, `chat-init.js` scans assistant text, stores the long text as export content, then separately extracts `details.tripPlan` from tool results for the map (`web/modules/trip/chat-init.js:203-253`). The visible itinerary and the structured map data are therefore two related but separate outputs.
- The current system prompt asks only for generic "每日行程" and "天气信息" sections; it does not require weather to be joined into each day's section or require weather-driven alternatives (`web/modules/trip/prompt.js:66-72`).
- Map-to-chat navigation already searches rendered chat messages for `第 N 天`, `Day N`, or `N日` (`web/modules/ui/map.js:1873-1897`). Preserving these headings in the final Markdown is important.

**Implication:** do not attempt to retrofit bespoke cards inside the third-party chat renderer for the MVP. Tighten the assistant output contract so each day contains a compact weather line, and use an owned deterministic UI as the verification surface.

### 2. The route panel is the existing project-owned per-day itinerary outline

- The map toolbar already exposes route, layer, and locate controls (`web/index.html:529-540`).
- The route panel has a project-owned header and body (`web/index.html:559-571`) and is opened/closed by the route toolbar button (`web/modules/ui/map.js:836-844`).
- Map rendering builds `routePanelData` once per `tripPlan.days` entry (`web/modules/ui/map.js:1055-1061`, `web/modules/ui/map.js:1199-1206`) and does the same in the animated rendering path (`web/modules/ui/map.js:1321-1329`, `web/modules/ui/map.js:1552-1556`).
- `renderRoutePanel()` produces one `.route-day-group` and `.route-day-label` per day, then makes the day label navigate to that day's chat text (`web/modules/ui/map.js:1992-2026`).
- The route panel is 300px wide on desktop and expands to almost full viewport width on mobile (`web/styles/main.css:1123-1165`, `web/styles/main.css:2162-2166`).

**Implication:** add the weather/risk summary immediately below each `.route-day-label`. This keeps the information next to the day's attractions without creating another panel or competing top-level navigation.

### 3. Existing weather UI is disconnected and cannot provide per-day UX as-is

- The browser-side `search_weather` tool requests Open-Meteo daily weather code, max/min temperature, and maximum precipitation probability (`web/modules/tools/weather.js:16-36`). However, it flattens each forecast into display strings and returns those strings under `details.weather`, not a structured `details.weatherInfo` array (`web/modules/tools/weather.js:49-65`).
- `chat-init.js` listens for tool names `get_weather` / `getWeather`, not the registered `search_weather`, and expects `details.weatherInfo` (`web/modules/trip/chat-init.js:277-283`). Consequently the actual browser weather result does not satisfy the overlay listener contract.
- The existing map weather overlay expects an iterable `weatherInfo` with `city`, `dayWeather`, and `dayTemp`, then places every day's badge at the same city center (`web/modules/ui/map.js:1653-1671`). For a multi-day single-city trip the badges overlap, so it is not a usable per-day visualization.
- The temperature-chart module is imported globally (`web/index.html:710`) and has a mount function (`web/modules/weather-chart.js:100-114`), but no production code calls `_mountWeatherChart` or creates a weather chart container. Its current tests prove only standalone SVG generation/mounting (`web/modules/__tests__/weather-chart.test.js:44-129`).
- The TypeScript domain model has a structured `TripPlan.weatherInfo` array, but `WeatherInfo` currently contains only date, city, day/night condition, day/night temperature, wind direction, and wind power (`src/types/trip.ts:131-160`). It has no precipitation probability, data source, observed/fallback status, or fetch time.
- Real provider adapters populate that existing shape (`src/services/weather/qweather-adapter.ts:70-82`, `src/services/weather/amap-adapter.ts:55-69`, `src/services/weather/owm-adapter.ts:139-148`). The service always appends a mock provider fallback (`src/services/weather-service.ts:19-46`), so the UI cannot currently tell a real forecast from a fallback after data has been copied into `TripPlan`.

**Implication:** the MVP needs one normalized structured weather contract before UI rendering. The route panel must join weather to a day by `date + city`, not consume the current display strings or the broken overlay event shape. Precipitation probability can be optional so existing providers and stored trips remain compatible.

### 4. Existing tests currently encode the wrong weather event contract

- The cross-layer helper simulates only `get_weather` / `getWeather` and expects `details.weatherInfo` (`web/__tests__/flows/cross-layer-integration.spec.ts:73-94`).
- Its weather fixture supplies `weatherInfo` as a single object rather than the iterable array required by `addWeatherOverlay()` (`web/__tests__/flows/cross-layer-integration.spec.ts:122-133`).
- The assertion only verifies that a boolean was produced and explicitly accepts the absence of visible weather (`web/__tests__/flows/cross-layer-integration.spec.ts:260-288`). It does not prove the real `search_weather` path works.
- Tool unit tests validate only the number of weather display strings (`web/modules/__tests__/tools.test.js:74-96`).
- Existing page-map tests already cover map toolbar layer switching and route-panel show/hide, providing the right place to add focused weather/radar expectations (`web/__tests__/page-map.spec.ts:286-336`).

### 5. i18n and accessibility constraints

- The UI supports Chinese, English, and Japanese, and the test requires all three dictionaries to have exactly the same key set (`web/modules/__tests__/i18n.test.js:19-68`).
- `applyI18n()` updates `[data-i18n]` text and `[data-i18n-title]` titles (`web/modules/infra/i18n.js:289-315`). Any new radar label, weather-risk label, unavailable state, or button title must be present in all three dictionaries.
- Although the map search input uses `data-i18n-placeholder`, `applyI18n()` currently does not process that attribute (`web/index.html:531-534`, `web/modules/infra/i18n.js:289-315`). Do not copy that unsupported pattern for new UI.
- Project guidance requires an accessible name for every interactive button and at least a 44px close-button touch target (`.trellis/spec/frontend/component-guidelines.md:94-99`). Existing E2E accessibility checks flag obscured controls and inspect touch sizes (`web/__tests__/accessibility.spec.ts:90-153`).
- External links in Markdown are already constrained against horizontal overflow (`web/styles/main.css:197-217`). A route-panel radar link needs its own compact wrapping/focus style.

## Recommended minimal UX

### A. Assistant itinerary output (primary planning surface)

For every `第 N 天 / Day N` section, require a single compact, source-backed line before the attractions:

```text
🌧️ 小雨 · 20–26°C · 降雨 70% · 东风 2级
⚠️ 上午优先室内，户外景点保留可取消的备选安排。 查看实时雷达 ↗
```

Rules:

- Keep the day heading patterns already used by `scrollChatToDay()`.
- Values must come from normalized weather data; the model must not invent precipitation, wind, or warning values.
- Advice must state the planning change, not merely repeat the forecast. Examples: move outdoor activity away from the rain window, avoid exposed mountain/boat/cable-car activity in storms or strong wind, reduce noon outdoor time in extreme heat, or recommend traction/warm layers for snow/cold.
- When no trustworthy forecast matches the date/city, render a neutral unavailable/long-range note and do not fabricate a risk level.
- The assistant line is useful for reading/export, but it is not the deterministic acceptance surface because model wording varies.

### B. Route-panel per-day summary (deterministic acceptance surface)

Extend the day data passed to `renderRoutePanel()` with:

```js
{
  dayNum,
  date,
  city,
  weather,       // normalized optional WeatherInfo
  weatherRisk,   // deterministic optional { level, reasons, advice }
  radarUrl,      // optional external URL
  attractions,
  meals,
}
```

Render directly below each day label:

```text
Day 2 · 杭州
🌧️ 小雨 20–26°C · 降雨 70% · 东风 2级
中风险 · 上午优先室内    查看实时雷达 ↗
```

Behavior:

- Join using exact `date + city`; if a day omits city, use `tripPlan.city`. Date-only fallback is acceptable only when it is unambiguous.
- Missing optional fields disappear cleanly; never display `undefined`, `NaN`, `0级`, or an empty warning row.
- Show low-risk weather as a neutral compact line. Show medium/high risk with the existing amber/red semantic colors; do not reuse route risk as if it were weather risk.
- Keep the existing click target on `.route-day-label` for chat navigation. The radar anchor must stop propagation so opening it does not also scroll the chat.
- Escape every external/weather string before inserting into the existing `innerHTML` renderer. The current route panel already escapes city and attraction names; the new fields must follow the same boundary (`web/modules/ui/map.js:1992-2017`).
- Do not add weather text to the bottom day-filter pills in this MVP. They are always visible and already compete with the mobile map/chat switch near the bottom (`web/styles/main.css:1480-1539`, `web/styles/main.css:2167-2189`).

### C. Deterministic weather-risk/advice rules

The UI should consume a pure classifier rather than ask the LLM to invent advice. Exact thresholds are a product decision, but this is a safe initial proposal:

| Level | Trigger examples | Minimal planning advice |
|---|---|---|
| High | thunderstorm/hail; heavy rain/snow; precipitation probability >= 70%; force 6+ wind; max >= 35°C or min <= 0°C | move to indoor alternatives; explicitly discourage exposed mountain, water, cable-car, or long outdoor segments as applicable |
| Medium | rain/snow/fog; precipitation probability >= 40%; force 4-5 wind; max >= 32°C or min <= 5°C | shorten/re-time outdoor segments and carry condition-specific gear |
| Low | none of the above | no warning row; optionally show one short comfort suggestion |
| Unknown | missing/stale/untrusted forecast | show forecast unavailable; do not claim low risk |

Notes:

- Parse provider condition text conservatively across known Chinese terms (e.g. `雷暴`, `冰雹`, `暴雨`, `大雨`, `雪`, `雾`) and any normalized WMO code if that code is retained.
- Wind power is currently a provider string, so extract a numeric range conservatively. If parsing fails, do not classify it.
- Temperature and weather risk are separate from existing scenic-route `riskAssessment`; present them independently and combine advice only at the planning layer.
- Long-range dates and mock fallback must not be labelled as a confirmed live forecast. This requires source/provenance work outside the purely visual change.

### D. Contextual external Windy radar link

Use a normal external anchor, not an iframe and not a permanent toolbar button.

Show it when:

- the selected day has rain/shower/thunderstorm/hail risk, and
- the forecast is short-term enough to make radar actionable (recommended: today/tomorrow), **or** a high-risk precipitation warning is being shown.

Placement:

- next to the deterministic advice row in the route panel;
- optionally in the assistant's matching day section for export/readability.

Coordinate choice, in order:

1. first valid attraction coordinate for that day;
2. day hotel coordinate;
3. known city center.

Project trip and city-center coordinates are GCJ-02; Windy expects global map coordinates. Convert to WGS-84 using the existing exported `gcj02ToWgs84()` (`web/modules/ui/map.js:20-67`) before building the external URL. Round the public URL to a reasonable precision (for example, five decimals) and use a bounded zoom.

Security/accessibility:

- `target="_blank" rel="noopener noreferrer"`;
- visible localized link text plus an accessible label that includes day/city context;
- keyboard focus style and no dependency on icon-only meaning;
- if no valid coordinates exist, omit the link rather than opening a misleading default location.

### E. Explicitly out of scope for this MVP

- Windy iframe/modal;
- Windy or another provider as a native Leaflet radar/tile overlay;
- a permanent weather button in `#page-map-toolbar`;
- animated weather chart integration;
- changing existing route/day filter behavior;
- pretending mock or long-range climate data is a real forecast;
- redesigning `pi-chat-panel` internals.

## Acceptance criteria

1. A generated or restored trip with matching structured weather displays one compact weather line for each day in the route panel, matched by exact date and city.
2. Each day's assistant Markdown section includes date/city, condition, min/max temperature, available precipitation probability, wind, and a planning adjustment when risk is medium/high.
3. A rainy Hangzhou Day 2 example shows rain-specific advice and a localized external radar link; a sunny low-risk day does not show the radar link.
4. Thunderstorm/heavy-rain/extreme-temperature inputs yield deterministic high risk; moderate rain/fog/strong-but-not-severe wind yield medium risk; missing/unparseable data yields unknown rather than low risk.
5. A multi-city trip with weather records on the same or adjacent dates maps each record to the correct day/city without leaking one city's forecast into another.
6. Missing precipitation, wind, or weather for one day degrades by omitting that fragment and never prints `undefined`, `null`, or `NaN`.
7. The radar URL uses a valid coordinate from the selected day and converts domestic GCJ-02 input to WGS-84. If no valid coordinate exists, no radar link is rendered.
8. The radar link opens a new external tab with `noopener noreferrer`; clicking it does not trigger route-day chat scrolling.
9. Chinese, English, and Japanese contain the same new i18n keys and the displayed route-panel/radar strings update when language changes.
10. Existing route panel toggling, map layer switching, day-to-chat navigation, and mobile map/chat switching continue to work.
11. The mobile route panel remains readable at a 375px viewport; weather advice wraps, does not obscure other controls, and the radar link has an accessible focus/touch target.
12. Re-rendering, animated rendering, and session restoration do not duplicate weather rows or stack one marker per forecast day at the same city point.

## Recommended focused tests

### Unit tests

- Add pure tests for `matchWeatherToDay(day, tripPlan, weatherInfo)`:
  - exact date+city;
  - day city fallback to main city;
  - multi-city mismatch rejection;
  - unique date fallback;
  - missing weather.
- Add pure tests for the risk classifier:
  - thunderstorm/hail/heavy rain -> high;
  - 70% and 40% precipitation boundaries;
  - parseable force ranges such as `4-5级`;
  - heat/cold boundaries;
  - unknown/malformed data -> unknown.
- Add pure tests for radar URL construction:
  - domestic GCJ-02 -> WGS-84 conversion;
  - non-China coordinates unchanged;
  - invalid coordinates rejected;
  - bounded zoom and stable precision.
- Extend `web/modules/__tests__/i18n.test.js` required keys or rely on its existing key-parity assertion, and test new localized labels explicitly.
- Replace/extend browser weather tool tests so the production tool name `search_weather` yields the normalized structured array, not only display strings (`web/modules/__tests__/tools.test.js:74-96`).

### Playwright tests

- Extend `web/__tests__/page-map.spec.ts` mock trip with `date` and `weatherInfo`; open `#page-map-routes` and assert each `.route-day-weather` has the correct condition, temperatures, wind, risk, and no undefined text.
- Add a rainy day and assert exactly one radar anchor, correct `target`/`rel`, and a URL centered on the converted day coordinate; intercept the popup/new-page event rather than navigating away.
- Add a sunny day and assert that day's radar anchor is absent.
- Re-render the same trip through normal and animated paths and assert weather row counts equal day counts.
- Add a 375x812 viewport case for route-panel wrapping and no obscured controls, following `web/__tests__/accessibility.spec.ts:90-153`.
- Add a language-switch case and assert route-panel/radar labels change for zh/en/ja.
- Repair `web/__tests__/flows/cross-layer-integration.spec.ts:73-94,122-133,260-288` to simulate the real `search_weather` contract and make visible per-day weather an actual assertion rather than a boolean/non-crash check.

## Likely implementation touch points

These are planning pointers, not changes made by this research task:

- `web/modules/trip/prompt.js` — require weather and adjustment inside each day section.
- `web/modules/tools/weather.js` and/or the shared TripPlan assembly boundary — return normalized structured forecast fields instead of display strings only.
- `src/types/trip.ts` and provider adapters — optional precipitation/provenance fields if included in MVP contract.
- `web/modules/ui/map.js` — match per-day weather, enrich both normal and animated `routePanelData`, render safe weather/risk/radar rows, and avoid stacked city weather badges.
- `web/styles/main.css` — compact route-panel weather/risk/link styles and mobile wrapping/focus behavior.
- `web/modules/infra/i18n.js` — add the same weather/risk/radar/unavailable keys to zh/en/ja.
- `web/modules/__tests__/tools.test.js`, `web/modules/__tests__/i18n.test.js`, `web/__tests__/page-map.spec.ts`, `web/__tests__/flows/cross-layer-integration.spec.ts`, and `web/__tests__/accessibility.spec.ts` — focused contract and UI coverage.

## Decision summary

The minimum valuable product change is not "weather on the map" as another layer. It is a date-aware decision aid attached to each planned day. The assistant Markdown makes that value visible in the itinerary itself; the owned route panel makes it deterministic and testable; the conditional external Windy link supports last-mile rain decisions without taking on embedded radar complexity or permanent toolbar clutter.
