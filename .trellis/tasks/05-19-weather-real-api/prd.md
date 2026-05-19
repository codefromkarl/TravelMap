# P1: 配置真实天气 API

## 背景

当前天气服务完全依赖 mock 数据（随机温度），`.env` 中 `OPENWEATHER_API_KEY=` 为空。用户看到的天气预报是假的。

## 目标

接入真实天气 API，返回准确的温度、天气状况、风力信息。

## 需求

### 方案选型

| API | 免费额度 | 中文支持 | 天数 | 推荐 |
|-----|---------|---------|------|------|
| 和风天气 (QWeather) | 1000次/天 | ✅ 原生中文 | 7天 | ✅ 推荐 |
| OpenWeatherMap | 1000次/天 | ❌ 需翻译 | 5天 | 备选 |
| 高德天气 API | 5000次/天 | ✅ 原生中文 | 3天 | 已有 key |

**推荐：和风天气**（免费注册、原生中文、7天预报、实况天气）。

### 实现要点

1. 在 `src/services/weather-service.ts` 中增加和风天气数据源
2. 优先级：和风天气 > OpenWeatherMap > mock
3. 高德天气 API 作为已配置的额外备选（仅 3 天，但有 key）

### 配置变更

- `.env` 新增 `QWEATHER_API_KEY=`
- `.env.example` 新增说明
- `src/services/config.ts` 新增 `qweatherApiKey` 字段

### 验收标准

- [ ] 配置 API Key 后，天气查询返回真实数据
- [ ] 中文天气描述（不依赖翻译 map）
- [ ] 支持 7 天预报
- [ ] 无 Key 时降级到 mock（行为不变）
- [ ] 现有测试通过

## 技术参考

- 和风天气 API: `https://dev.qweather.com/docs/api/weather/weather-daily-forecast/`
- 高德天气: `https://restapi.amap.com/v3/weather/weatherInfo?city=城市编码&key=xxx`
