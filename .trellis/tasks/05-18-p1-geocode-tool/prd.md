# P1-3: 地理编码工具

## 目标
实现 `geocode` Agent Tool，将地址文本转换为经纬度坐标。

## 需求
- 接入高德地图地理编码 API（国内）
- 备选 Google Maps Geocoding API（国外）
- 输入：地址文本 + 城市
- 输出：`{ longitude, latitude }`
- 调用失败返回默认坐标 + 警告

## 技术方案
- `src/services/geocode-service.ts`
- `src/tools/geocode.ts`
- 环境变量：`AMAP_WEB_KEY` 或 `GOOGLE_MAPS_API_KEY`

## 验收标准
- [ ] 输入"故宫博物院 + 北京"返回正确经纬度
- [ ] 调用失败时不抛异常，返回默认值
