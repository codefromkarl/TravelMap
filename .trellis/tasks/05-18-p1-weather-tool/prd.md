# P1-2: 天气查询工具

## 目标
实现 `search_weather` Agent Tool，接入天气 REST API，返回指定城市未来天气预报。

## 需求
- 接入天气 API（优先 OpenWeatherMap，备选和风天气）
- 返回未来 7 天天气：日期、天气状况、温度范围、风向风力
- 支持按城市名查询
- 温度统一为摄氏度

## 技术方案
- `src/services/weather-service.ts` — 封装天气 API
- `src/tools/weather.ts` — Agent Tool 定义
- 环境变量：`OPENWEATHER_API_KEY` 或 `QWEATHER_API_KEY`

## 验收标准
- [ ] 工具返回 7 天预报数据
- [ ] 温度为纯数字（摄氏度）
- [ ] API 失败时有降级文案
