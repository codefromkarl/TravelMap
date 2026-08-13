# 天气数据流与跨层契约研究

> 调研日期：2026-08-13
> 范围：当前仓库中的 Node/TypeScript 天气服务与工具、浏览器端 `search_weather`、Agent 事件、`TripPlan.weatherInfo`、地图天气覆盖层及相关测试。
> 本文只记录当前事实和建议契约，不代表已修改生产代码。

## 结论摘要

当前天气能力不是一条闭环，而是两套互相漂移的实现：

1. `src/` 后端能产出结构化 `WeatherInfo[]`，工具结果字段为 `details.weather`。
2. 实际浏览器 Agent 注册的是 `web/modules/tools/weather.js`；它把 Open-Meteo 每日数据格式化成字符串数组，同样放在 `details.weather`。
3. 浏览器事件处理只监听不存在的 `get_weather` / `getWeather`，并读取不存在的 `details.weatherInfo`，因此实际 `search_weather` 完成后不会触发地图天气层。
4. `addWeatherOverlay()` 要求可迭代的结构化 `WeatherInfo[]`。即使事件名修好，浏览器工具当前返回的 `string[]` 也不能满足它。
5. 最终用于地图和保存的浏览器 `TripPlan` 通常经 `generate_action_links` 进入 `window._lastTripPlan`，但该工具参数 schema 根本没有 `weatherInfo`，因此最终行程也没有可靠的天气载体。
6. 无论后端还是浏览器工具，查询参数都没有 `startDate`。当前实现只能查询“从现在开始”的供应商预报，不能保证与用户旅行日期对齐；把结果称作“目标日期天气”是不成立的。

因此本任务的第一优先级应是建立一个可验证的统一契约，再做每日天气卡、天气驱动的行程建议和实时雷达外链。不能只把现有地图事件中的两个字段名改一致。

## 1. 当前数据流（已验证事实）

### 1.1 浏览器实际运行路径

```text
Agent ALL_TOOLS
  -> web/modules/tools/weather.js: search_weather
  -> Open-Meteo daily response
  -> details = { city, weather: string[], source: "open-meteo" }
  -> tool_execution_end(toolName = "search_weather")
  -X chat-init 只接受 get_weather/getWeather
  -X chat-init 只读取 details.weatherInfo
  -X addWeatherOverlay 需要 WeatherInfo[]，不是 string[]
```

- `web/modules/tools/index.js:4-11,24-34` 把浏览器版 `searchWeatherTool` 加入 `ALL_TOOLS`；`web/modules/trip/chat-init.js:132-142` 用这组工具创建页面 Agent。因此 Web 页面不是在调用 `src/tools/weather.ts`。
- 浏览器工具输入只有 `city` 和 `days`（`web/modules/tools/weather.js:16-25`），通过静态 `CITY_CENTERS` 找坐标（`:27-35`），请求 Open-Meteo 的日天气、最高/最低温和最大降雨概率（`:36-40`）。
- 工具把每日数据先格式化为展示字符串（`:49-57`），成功结果的 `details.weather` 就是这些字符串，而不是对象（`:59-65`）。未知城市、空结果和异常分支只返回 `{ city, source, error? }`，没有稳定的空数组（`:27-32,42-46,66-70`）。
- `chat-init` 的增量渲染只匹配 `get_weather` / `getWeather`，然后读取 `details.weatherInfo`（`web/modules/trip/chat-init.js:265-283`）；实际工具名是 `search_weather`，实际字段是 `weather`。
- 地图函数遍历输入数组，并读取 `w.dayWeather`、`w.city`、`w.dayTemp`（`web/modules/ui/map.js:1653-1669`）。这正是后端 `WeatherInfo` 形状，而不是浏览器工具的字符串元素。

结论：当前生产浏览器链路在三个边界同时不匹配：工具名、数组字段名和数组元素形状。

### 1.2 地图天气层的生命周期

- `addWeatherOverlay()` 对每个天气日都在同一城市中心创建 marker（`web/modules/ui/map.js:1657-1668`）。同一城市的多日 badge 会完全重叠，不等于逐日天气展示。
- marker 被加入通用 `pageMapLayers`（`:1668`），没有独立 weather layer group，也没有按城市/日期去重。
- 完整行程动画渲染会移除全部 `pageMapLayers` 并清空数组（`web/modules/ui/map.js:1297-1312`）；普通地图刷新也会清空全部图层（`:735-747`）。
- `renderTripOnPageMap()` 只遍历 `tripPlan.days` 的景点/路线（`web/modules/ui/map.js:1027-1068` 起），没有重建 `tripPlan.weatherInfo` 的调用。仓库内 `addWeatherOverlay` 也只有事件入口调用。

结论：即使天气增量 marker 一度出现，后续完整 TripPlan 渲染仍可能把它清掉，且无法从持久化行程恢复。

### 1.3 浏览器 `TripPlan` 进入地图的路径

- `agent_end` 会从工具结果的 `details.tripPlan` 设置 `window._lastTripPlan` 并刷新地图（`web/modules/trip/chat-init.js:223-253`）。
- `generate_action_links` 是系统 prompt 要求的最终步骤（`web/modules/trip/prompt.js:27-37`），其执行结果返回 `details.tripPlan`（`web/modules/tools/action-links.js:95-120`）。
- 但该工具的 `tripPlan` TypeBox schema 只声明 `city/cities/startDate/endDate/days`，没有 `weatherInfo` 和 `overallSuggestions`（`web/modules/tools/action-links.js:9-52`）。LLM 工具调用参数因此没有契约要求携带天气。
- `query_trip_data` 的 schema 才声明了 `weatherInfo`，但只包含 `date/city/dayWeather/dayTemp/nightTemp`，缺少后端类型要求的 `nightWeather/windDirection/windPower`（`web/modules/tools/companion.js:39-45`）。
- 浏览器 `validateTripPlanSchema()` 只校验 `city`、`days` 和景点名，不校验 `weatherInfo`（`web/modules/tools/validate-trip.js:16-61`）。

结论：浏览器最终 TripPlan 是否带天气、天气字段是否完整，都依赖 LLM 偶然输出，且现有校验不会发现缺失。

### 1.4 天气图表现状

- `web/modules/weather-chart.js:20-97` 已能从结构化 `WeatherInfo[]` 生成温度曲线 SVG；`:103-114` 提供挂载函数和 `window` 入口。
- `web/index.html:710` 仅导入模块。仓库生产代码没有调用 `renderWeatherChart()` / `mountWeatherChart()`；调用只存在于组件自身测试。
- `web/modules/__tests__/weather-chart.test.js:44-128` 对空值、温度、图标、日期和 DOM 挂载做了隔离测试。

结论：图表组件本身有单测，但没有接入行程页面，不能作为“天气已经展示”的证据。

### 1.5 Node/TypeScript 后端路径

```text
WeatherProvider
  -> WeatherResult { weather: WeatherInfo[], source }
  -> searchWeather()
  -> search_weather tool details { city, days, weather, source }
  或 runParallelSearch().weather
  -> 文本注入 LLM
  -> LLM 重新生成 TripPlan.weatherInfo
  -> parser 只检查 city + days 后强制断言 TripPlan
```

- 后端规范类型 `WeatherInfo` 包含 `date/city/dayWeather/nightWeather/dayTemp/nightTemp/windDirection/windPower`；`TripPlan.weatherInfo` 是必填数组（`src/types/trip.ts:131-164`）。
- Provider 契约是 `{ weather: WeatherInfo[], source: string }`，请求只有 `{ city, days? }`（`src/services/weather/types.ts:10-33`）。
- `searchWeather()` 按和风、高德、OWM、Mock 顺序降级并保留该结果形状（`src/services/weather-service.ts:21-47,52-74`）。
- `defineTool()` 默认把 params 和 result 展开到 details（`src/tools/define-tool.ts:76-86`），所以后端 `search_weather` 的实际成功 details 是 `{ city, days, weather, source }`，不是 `{ weatherInfo }`。`src/tools/weather.ts:9-35` 没有自定义 details 映射。
- 预搜索编排只查询请求中的第一个城市（`src/services/search-orchestrator.ts:39-61`），把结果聚合为 `SearchResultsBundle.weather`（`:98-174`）。多城市天气目前没有覆盖。
- compact 注入把每天天气压为 `date|dayWeather|nightWeather|dayTemp|nightTemp`，丢掉城市、风向、风力和 source 的逐日关联（`src/services/search-orchestrator.ts:181-216`）。readable 格式保留风信息（`:219-260`），但 `injectSearchResults` 默认使用 compact（`:265-272`）。
- LLM 随后需要根据文本重新生成 `TripPlan.weatherInfo`。解析器只检查对象有 `city` 和 `days`，即直接断言为 `TripPlan`（`src/agent/trip-plan-parser.ts:106-145`）。后端 `validateTripPlan()` 也只验证天数、日期连续性和景点坐标，不验证天气（`src/types/trip.ts:187-225`）。

结论：后端内部 provider 契约是一致的，但 `SearchResultsBundle -> 文本 -> LLM JSON -> TripPlan` 会丢字段且缺少运行时验证，不是可靠的数据直传。

## 2. 日期、范围和真实性风险

### 2.1 没有旅行开始日期

- 浏览器与后端 `search_weather` 参数都只有 `city/days`：`web/modules/tools/weather.js:20-25`、`src/tools/weather.ts:14-20`、`src/services/weather/types.ts:10-14`。
- QWeather 直接取供应商返回的头 N 天（`src/services/weather/qweather-adapter.ts:61-80`）。
- Amap 最多取供应商当前可用 casts（`src/services/weather/amap-adapter.ts:44-69`）。
- OWM 取当前 5 天/3 小时数据并按响应日期聚合（`src/services/weather/owm-adapter.ts:87-98,110-151`）。
- Mock 从执行当天起生成随机日期和温度（`src/services/weather/mock-adapter.ts:18-44`）。

因此，若用户规划数周或数月后的旅行，当前天气数据不是目标日期预报；若 TripPlan 仍把它复制到未来行程日期，会产生事实错误。契约必须表达“请求日期”和“供应商实际覆盖日期”，不能静默错配。

### 2.2 Mock 被当作正常成功结果

Mock provider 永远可用，返回随机温度但 `searchWeather()` 将其作为普通 `{ weather, source: "mock" }` 成功返回（`src/services/weather/mock-adapter.ts:11-45`、`src/services/weather-service.ts:44-74`）。用户界面和 TripPlan 没有 `isSynthetic` / `confidence` 字段，容易把演示数据呈现为真实预报。

### 2.3 当前字段不足以支持推荐中的 P0 决策

现有后端 `WeatherInfo` 没有降雨概率、雷暴/高温/强风等标准化风险、数据更新时间或预报可信范围。浏览器 Open-Meteo 已请求 `precipitation_probability_max`（`web/modules/tools/weather.js:36-55`），却只把它写进展示字符串，结构化数据丢失。仅靠 `dayWeather` 文本做行程自动调整会受供应商文案差异影响。

## 3. 建议的统一契约

### 3.1 查询输入

建议所有 runtime 使用同一语义，即使暂时仍有 TypeScript 和浏览器两个实现：

```ts
interface WeatherSearchRequest {
  city: string;
  startDate: string; // YYYY-MM-DD，用户行程开始日
  days: number;      // 1..16；provider 可返回较短覆盖，但必须显式报告
  latitude?: number; // 已有坐标时优先使用，避免再次地理编码及同名城市歧义
  longitude?: number;
}
```

约束：

- `startDate` 不应是可选字段。只有“查看现在天气”的独立入口可以显式用当天日期调用。
- `days` 必须在入口校验并截断到产品支持范围；不要让各 provider 各自静默截断。
- 多城市行程应按每个城市实际停留日期分别查询，而不是只查首个城市。

### 3.2 每日预报

保留现有字段，增加旅行决策所需的最小结构化数据：

```ts
interface WeatherInfo {
  date: string;                    // YYYY-MM-DD
  city: string;
  dayWeather: string;
  nightWeather: string;
  dayTemp: number;
  nightTemp: number;
  precipitationProbability: number | null; // 0..100；供应商无数据时为 null
  windDirection: string;
  windPower: string;
}
```

不要在 provider adapter 中直接生成“改去室内”等产品建议。Provider 负责规范化天气事实；单独的天气决策层再按统一规则生成风险和行程建议，避免把供应商适配与产品策略耦合。

### 3.3 查询结果与工具 details

建议统一使用 `weatherInfo`，直接对齐 `TripPlan.weatherInfo` 和 UI 消费者：

```ts
interface WeatherQueryResult {
  city: string;
  weatherInfo: WeatherInfo[]; // 所有成功/空/失败分支都存在
  source: "qweather" | "amap" | "openweathermap" | "open-meteo" | "mock" | "none";
  fetchedAt: string;          // ISO 8601
  isSynthetic: boolean;       // mock 必须为 true
  coverage: {
    requestedStartDate: string;
    requestedDays: number;
    availableStartDate: string | null;
    availableEndDate: string | null;
    complete: boolean;
  };
  error?: { code: string; message: string };
}
```

具体边界规则：

- `search_weather` 工具成功 details、Agent `tool_execution_end` 和 UI 都消费同一个 `WeatherQueryResult`；不要再并存 `weather` / `weatherInfo` 两个数组字段。
- `content[0].text` 只是给 LLM/用户看的派生展示，绝不能成为下游解析的数据源。
- 无城市、无数据或请求失败时返回 `weatherInfo: []` 和明确 source/error；UI 不应因字段缺失或非数组而崩溃。
- 如果实施期间需要兼容旧消息，应只在一个入口 normalizer 中读旧 `details.weather`，立即转换为规范形状；不要让每个消费者长期维护多个别名。

### 3.4 TripPlan 中的事实与决策

```ts
interface WeatherImpact {
  level: "low" | "medium" | "high";
  reasons: string[];
  suggestions: string[];
  needsIndoorFallback: boolean;
}

interface DayPlan {
  // 现有字段 ...
  weatherImpact?: WeatherImpact;
}

interface TripPlan {
  // 现有字段 ...
  weatherInfo: WeatherInfo[]; // 必填；无可用预报时为 []
}
```

- `TripPlan.weatherInfo` 保存规范化天气事实；`DayPlan.weatherImpact` 保存由事实推导出的规划决策。
- 关联键是 `(day.city, day.date)`，不能仅按数组下标关联，尤其是多城市/移动日。
- 风险规则应可测试，例如降雨、高温、雷暴、强风触发室内备选或安全提示。`reasons` 要能说明为什么调整，避免不可解释的 LLM 改行程。
- 超出供应商预报范围时，`weatherInfo` 不应伪造目标日期数据；`weatherImpact` 可提示“临行前复查”，并保留原行程而不是基于错误天气重排。

### 3.5 地图与每日卡片消费规则

- 每日行程卡按 `(city,date)` 显示天气、温度、降雨概率、风险原因和备选建议，这是当前旅行规划的 P0 消费者。
- 地图 badge 只显示当前选中日或每城市一个汇总，不要把 7 个日期 marker 堆在同一坐标。
- weather marker 应进入独立 Leaflet layer group，由完整 TripPlan render 从 `tripPlan.weatherInfo` 重建；不要混入会被全量清空的通用临时层。
- “实时雷达”保持轻量外链，且只在临行/旅途中有实时价值时展示。它不应阻塞天气事实与行程建议闭环。

## 4. 现有测试能证明什么，不能证明什么

### 已覆盖

- 后端工具测试验证 `details.weather` 是结构化数组，且元素含 `date/dayTemp/nightTemp`：`src/__tests__/unit/tools/weather.test.ts:54-127`、`src/__tests__/unit/tools/real-tools.test.ts:127-156`。
- provider/service 测试覆盖成功、指定天数、中文转换、provider 降级和错误：测试清单位于 `src/__tests__/unit/services/weather-service.test.ts`、`src/__tests__/unit/services/weather/*.test.ts`、`src/__tests__/unit/tools/weather-deep.test.ts`。
- 编排契约测试只确认 `bundle.weather` 存在且首日有 `city/dayWeather/dayTemp`（`src/__tests__/integration/orchestration-contract.test.ts:71-85,103-115`）。
- 天气 SVG 组件隔离测试覆盖渲染与挂载（`web/modules/__tests__/weather-chart.test.js:44-128`）。

### 关键缺口与误导性覆盖

1. **浏览器工具测试只断言长度**：`web/modules/__tests__/tools.test.js:74-95` 没有断言 `details.weather[i]` 的字段，因此 `string[]` 也会通过。
2. **跨层测试没有触发生产事件监听器**：helper 直接复制一份条件逻辑（`web/__tests__/flows/cross-layer-integration.spec.ts:73-95`），仍使用旧名 `get_weather` 和 `details.weatherInfo`，所以不能证明实际 `search_weather` 链路。
3. **跨层 fixture 形状错误**：`WEATHER_RESULT.details.weatherInfo` 是单个 `{ city, temperature, description, icon }` 对象，不是 `WeatherInfo[]`（`:122-133`）。生产 `addWeatherOverlay` 对其 `for...of` 会要求可迭代数组。
4. **天气可见性没有被断言**：天气用例最终只断言 `typeof hasWeather === "boolean"`（`:260-288`）；`false` 也会通过。
5. **没有地图生命周期测试**：没有验证天气层在最终 TripPlan render、切换地图页、恢复历史行程后仍存在，也没有验证多日 marker 不重叠。
6. **没有 TripPlan 天气运行时契约测试**：后端 parser 只测缺少 `city/days` 会失败（`src/__tests__/unit/agent/trip-plan-parser.test.ts:109-145`）；没有测试 `weatherInfo` 缺失、字段错误或与行程日期不一致。浏览器 validator 同样忽略天气。
7. **没有目标日期/覆盖范围测试**：现有测试检查“返回 N 天”，没有检查查询日期是否等于 `TripRequest.startDate`，也没有检查超出 forecast horizon 的明确降级。
8. **没有多城市天气测试**：当前 orchestrator 只查首城，但集成测试的多城市用例只验证坐标（`src/__tests__/integration/orchestration-contract.test.ts:33-52`）。
9. **没有 mock 真实性标识测试**：测试接受 source=`mock`，但不要求 UI 标注为模拟数据或阻止其驱动真实行程调整。

## 5. 建议实施顺序与验收测试

### P0-A：先统一边界

1. 为 Web 与 Node 定义同语义的 `WeatherSearchRequest` / `WeatherQueryResult` / `WeatherInfo`。
2. 浏览器工具保留 Open-Meteo 原始每日对象，输出 `details.weatherInfo: WeatherInfo[]`，不再输出字符串数组。
3. 事件监听实际工具名 `search_weather`，并在入口做一次 runtime validation。
4. `generate_action_links`（以及任何保存最终 TripPlan 的工具）schema 明确携带完整 `weatherInfo`。
5. TripPlan parser/validator 校验天气数组并对缺失值规范化为 `[]`，不要靠 TypeScript 强制断言。

验收测试：

- 调用实际浏览器 `searchWeatherTool.execute()`，断言每个元素所有必填字段和 `precipitationProbability` 类型。
- 用真实生产订阅回调分发 `tool_execution_end({ toolName: "search_weather" })`，断言地图消费到结构化数组；测试不复制生产条件逻辑。
- 测试空/错误结果返回 `weatherInfo: []` 且不抛异常。
- 测试通过 `generate_action_links -> agent_end -> window._lastTripPlan` 后 `weatherInfo` 完整保留。

### P0-B：保证旅行日期真实性

1. 查询输入加入 `startDate`；按供应商可用范围裁剪，并输出 coverage。
2. 多城市按停留日期查询；将结果按 `(city,date)` 合并。
3. Mock 明确 `isSynthetic=true`，不得静默驱动生产级行程重排。

验收测试：

- 行程起始日在 forecast horizon 内：返回日期精确覆盖。
- 起始日超范围：`complete=false`，不伪造行程日期，UI 显示临行复查提示。
- 多城市：每个 `DayPlan` 都能按 `(city,date)` 找到对应预报或明确缺失状态。
- provider 只返回 3/5 天而请求 7 天：coverage 正确，不能声称 7 天完整。

### P0-C：天气驱动的每日规划

1. 从规范化事实生成 `DayPlan.weatherImpact`。
2. 日卡显示温度、降雨概率、风险原因和室内备选。
3. 规则层只调整受影响日，保留其他天；高风险户外活动要有明确警告。

验收测试至少覆盖：小雨、暴雨/雷暴、高温、强风、无预报、模拟数据；每例验证建议、受影响日期和未受影响日不变。

### P1：地图和雷达入口

1. 独立 weather layer group，从完整 TripPlan 重建。
2. 按选中日期显示一个 badge，验证刷新/历史恢复/图层切换。
3. 临行或旅途中显示 Windy 实时雷达外链；不把雷达 iframe 当作天气规划的前置条件。

## 6. 风险优先级

| 优先级 | 风险 | 后果 |
|---|---|---|
| P0 | `search_weather` vs `get_weather`，`weather` vs `weatherInfo` | 实际事件不渲染天气 |
| P0 | 浏览器 `string[]` vs UI `WeatherInfo[]` | 修一个字段名后仍会类型失败 |
| P0 | 查询无 `startDate` | 未来行程展示错误日期的天气 |
| P0 | 最终 TripPlan schema 不含天气 | 保存、地图、分享和恢复时天气丢失 |
| P0 | Mock 无真实性标识 | 随机数据可能驱动真实行程建议 |
| P1 | 后端预搜索只查首城 | 多城市后续日期无天气或错配 |
| P1 | 多日 badge 同坐标叠加且被全量 render 清除 | 地图天气短暂、不可读、不可恢复 |
| P1 | 两套 runtime 独立实现同名工具 | 后续字段和供应商继续漂移 |
| P1 | LLM 文本中转且 parser 不校验天气 | 字段丢失/幻觉无法被发现 |
| P2 | badge HTML 直接拼接 `dayTemp` | 若 TripPlan/工具结果不可信，存在注入面；应转数值并安全渲染 |

## 7. 后续实现应加载的规范

- `.trellis/spec/guides/cross-layer-thinking-guide.md`：要求先画完整数据流、定义每个边界格式和验证责任。
- `.trellis/spec/frontend/type-safety.md`：Web 为 Vanilla JS，应使用 JSDoc 和入口 runtime validation，尤其在数组 `.map()` / `for...of` 前验证 `Array.isArray()`。
- `.trellis/spec/frontend/component-guidelines.md`、`.trellis/spec/frontend/quality-guidelines.md`：每日卡片、地图 badge、错误/空态和可访问性。
- `.trellis/spec/backend/error-handling.md`、`.trellis/spec/backend/testing-strategy.md`：provider fallback、MSW、fixture 与错误路径。
