# P1: 配置真实天气 API

## 背景

当前天气服务完全依赖 mock 数据（随机温度），`.env` 中 `OPENWEATHER_API_KEY=` 为空。用户看到的天气预报是假的。

## 目标

接入真实天气 API，返回准确的温度、天气状况、风力信息。

---

## 决策记录（Grill Me 已确认）

### D1. 数据源优先级链
**和风天气 > 高德天气 > OpenWeatherMap > mock**

- 和风天气：7 天预报 + 原生中文 + 1000 次/天免费 = 最佳
- 高德天气：3 天预报但 5000 次/天，fallback
- OWM：保留现有实现，第三备选

### D2. 城市查询方式
用经纬度，复用现有 `dualGeocode()` 获取坐标，不维护城市 ID 映射表。

### D3. 字段策略
只填充现有 `WeatherInfo` 字段（dayWeather/nightWeather/dayTemp/nightTemp/windDirection/windPower）。和风天气多出的信息（湿度、紫外线、日出日落）忽略，不扩展类型。

### D4. 配置方式
`.env` 新增 `QWEATHER_API_KEY=xxx`，`config.ts` 新增 `qweatherApiKey` 字段。和现有 OWM/AMAP 配置方式一致。

---

## 文件变更

### 修改
1. `src/services/weather-service.ts` — 新增和风天气 + 高德天气数据源
   - `fetchFromQWeather()` — 和风天气 7 天预报
   - `fetchFromAmapWeather()` — 高德天气 3 天预报
   - `searchWeather()` — 优先级链重构

2. `src/services/config.ts` — 新增 `qweatherApiKey` 字段
3. `.env.example` — 新增 `QWEATHER_API_KEY=` 说明

### 不变
- `src/tools/weather.ts` — tool 层不变
- `src/types/trip.ts` — `WeatherInfo` 类型不扩展

## 优先级链逻辑

```typescript
async function searchWeather(params) {
  // 1. 和风天气（7天，中文）
  if (config.qweatherApiKey) {
    try { return await fetchFromQWeather(params); }
    catch (e) { warn("QWeather failed", e); }
  }

  // 2. 高德天气（3天，中文）
  if (config.amapWebKey) {
    try { return await fetchFromAmapWeather(params); }
    catch (e) { warn("Amap weather failed", e); }
  }

  // 3. OpenWeatherMap（5天，需翻译）— 已有实现
  if (config.openWeatherApiKey) {
    try { return await fetchFromOWM(params, config.openWeatherApiKey); }
    catch (e) { warn("OWM failed", e); }
  }

  // 4. Mock 降级 — 已有实现
  return { weather: mockWeather(params), source: "mock" };
}
```

## 和风天气 API 调用

- 7 天预报：`https://devapi.qweather.com/v7/weather/7d?location={lng},{lat}&key={apiKey}`
- 返回字段映射：
  - `textDay` → `dayWeather`
  - `textNight` → `nightWeather`
  - `tempMax` → `dayTemp`
  - `tempMin` → `nightTemp`
  - `windDirDay` → `windDirection`
  - `windScaleDay` → `windPower`

## 高德天气 API 调用

- 查询：`https://restapi.amap.com/v3/weather/weatherInfo?city={adcode}&key={apiKey}&extensions=all`
- 需要城市 adcode（通过高德 geocode 获取）
- 返回 3 天预报

## 验收标准

- [ ] 配置 `QWEATHER_API_KEY` 后返回真实 7 天预报
- [ ] 中文天气描述直接使用（不翻译 map）
- [ ] 降级链正确：和风 → 高德 → OWM → mock
- [ ] 无任何 Key 时降级到 mock（行为不变）
- [ ] 现有 `WeatherInfo` 类型不变
- [ ] 现有测试通过
- [ ] 新增和风天气 + 高德天气的 mock 测试

## 测试策略

Mock API 响应，测试：
1. 和风天气正常返回 7 天
2. 高德天气返回 3 天
3. 和风失败 → 降级到高德
4. 全部无 Key → mock
5. 中文描述直接透传
