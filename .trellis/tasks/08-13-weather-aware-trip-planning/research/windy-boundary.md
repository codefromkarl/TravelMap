# Windy 接入边界

本任务只生成 `www.windy.com` 实时雷达 deep link，不嵌入 iframe，也不使用 Windy Map Forecast API。

原因：

- Windy Map Forecast API 当前不提供 radar 图层；`rain & thunder` 是数值预报，不是观测雷达。
- iframe 是独立地图，不能自然保留 TravelMap 的景点和路线联动，并存在额外许可边界。
- 旅行规划的核心时间尺度是未来几天，雷达只在今天/明天的降水风险下作为临场辅助有价值。

稳定链接只构造官方文档公开的状态部分：

```text
https://www.windy.com/{detailLat}/{detailLon}?radar,{mapLat},{mapLon},{zoom}
```

不生成或依赖分享链接中的内部 `m:*` token。

参考：

- https://community.windy.com/topic/77/windy-com-url-parameters
- https://community.windy.com/topic/39713/weather-radar-overlay-not-available/3
- https://api.windy.com/map-forecast/pricing
