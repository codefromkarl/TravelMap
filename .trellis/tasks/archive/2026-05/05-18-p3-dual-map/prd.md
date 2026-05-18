# P3-2: 双地图引擎

## 目标
国内用高德地图，国外用 Google Maps，自动检测降级。

## 需求
- 地理编码、POI 搜索、路线规划根据目标城市自动选择引擎
- Google Maps 失败时自动降级到高德
- 全局标记避免逐个超时（参考 TripStar 的 _google_geo_failed_flag）
- 代理支持（国内访问 Google 需代理）

## 验收标准
- [ ] 查询北京景点使用高德，查询东京景点使用 Google
- [ ] Google 超时后自动降级高德
