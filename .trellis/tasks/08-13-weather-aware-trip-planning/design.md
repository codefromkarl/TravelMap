# 技术设计

## 架构边界

浏览器实际数据流统一为：

```text
search_weather(city, startDate, days)
  -> Open-Meteo daily response
  -> WeatherQueryResult.details.weatherInfo[]
  -> Agent tool result / final TripPlan.weatherInfo[]
  -> weather-planning pure functions
  -> routePanelData.weather + weatherImpact + radarUrl
  -> renderRoutePanel()
```

`content[0].text` 只供模型阅读；下游 UI 不解析展示字符串。

## 模块设计

### `web/modules/tools/weather.js`

- 接收 `city`、`startDate`、`days`。
- 对日期和天数做边界校验；Open-Meteo 请求包含目标日期范围。
- 将 WMO code 映射为结构化 `WeatherInfo`，保留降雨概率。
- 输出稳定的 `WeatherQueryResult`：`weatherInfo`、`source`、`fetchedAt`、`isSynthetic`、`coverage`、可选 `error`。
- 所有 fetch 分支检查 `resp.ok`。

### `web/modules/weather-planning.js`

新增无 DOM、无网络的纯函数模块：

- `matchWeatherToDay(day, tripPlan, weatherInfo)`：优先精确 `(date, city)`；主城市回退；只有日期唯一时才允许日期回退。
- `classifyWeatherRisk(weather)`：返回 `low|medium|high|unknown`、原因键、建议键以及是否需要室内备选。
- `shouldShowRadar(weather, impact, now)`：短期降水风险或高风险降水。
- `buildWindyRadarUrl(coords, zoom)`：验证坐标、国内 GCJ-02 转 WGS-84、限制缩放和精度，生成稳定 deep link。
- 格式化函数只返回安全文本片段；最终 HTML 仍在渲染边界转义。

### `web/modules/ui/map.js`

- 不再使用多日同点的天气 marker 作为主要 UI。
- 普通和动画渲染路径构造一致的 route-panel 天气数据。
- `renderRoutePanel()` 在 `.route-day-label` 下渲染 `.route-day-weather` 和可选 `.route-day-weather-advice`。
- 雷达 anchor 阻止事件冒泡；所有动态文本经过 `escapeHtml()`。

### TripPlan 与提示词边界

- `generate_action_links` 的 TypeBox schema增加完整 `weatherInfo` 与可选字段，确保最终工具调用不会丢失天气。
- 浏览器校验器将缺失 `weatherInfo` 规范化为空数组，兼容历史行程。
- system prompt 要求逐日引用工具事实、说明风险调整，并明确超出预报范围时提示临行复查。
- system prompt 对方向确认使用稳定的文本协议：每轮一个决策、2-4 个编号选项、推荐项置顶、末尾自由输入兜底。当前聊天由外部 `pi-chat-panel` 渲染，因此本任务不新增不可验证的快捷按钮能力。

## 兼容与降级

- 历史 TripPlan 没有 `weatherInfo`：显示原路线，不显示天气行，不报错。
- 旧记录缺少降雨概率、风向或风力：仅省略相应片段，其他字段照常展示。
- 超出预报范围：返回空天气与 coverage，不把“当前未来几天”冒充旅行日期。
- 多城市：严格按 city+date 关联；避免日期相同却跨城市串用。
- Windy 只是外链，无 API key、SDK 或 iframe 依赖。

## 安全与可访问性

- 外部链接固定由内部 URL builder 生成，禁止接受模型提供的 URL。
- `target="_blank" rel="noopener noreferrer"`。
- 动态天气/城市文本 HTML 转义。
- 链接有可见文字、上下文 aria-label、focus-visible 样式和移动端可点击区域。

## 回滚点

- 天气规划逻辑是独立模块；删除 route-panel 消费即可恢复原 UI。
- `weatherInfo` 是附加字段，历史数据和旧行程不需要迁移。
- 不改变底图、地图实例和现有路线 marker 生命周期。
