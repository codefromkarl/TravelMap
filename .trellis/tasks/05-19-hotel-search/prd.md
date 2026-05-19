# P0: 实现酒店搜索服务

## 背景

当前 `search_hotels` tool 是空壳占位，返回硬编码文本。酒店推荐和预算计算完全依赖 LLM 编造，是整个行程规划精准度的最大短板。

## 目标

实现真实的酒店搜索服务，返回酒店名称、位置、价格、评分、房型等真实数据。

## 需求

### 数据源选型

优先级从高到低：

1. **高德 POI 周边搜索**（`around` API）— 国内酒店，免费，已有 `amapWebKey` 配置
2. **Google Places Nearby Search** — 国外酒店，需 `googleMapsApiKey`
3. **Mock 降级** — 无 API Key 时返回通用建议

### 搜索参数

- `city`: 城市名
- `location`: 可选，经纬度（景点附近搜索时传入）
- `budget`: 预算范围，如 "300-500"
- `style`: 住宿风格，如 "经济型"、"精品民宿"
- `checkIn` / `checkOut`: 可选，入住/离店日期

### 返回数据

```typescript
interface Hotel {
  name: string;           // 酒店名称
  rating: number;         // 评分 (0-5)
  price: number;          // 参考价格（元/晚）
  address: string;        // 地址
  location: Location;     // 坐标
  distance?: number;      // 距搜索中心距离（米）
  tags: string[];         // 标签：如 ["有电梯", "亲子房", "免费停车"]
  source: "amap" | "google" | "mock";
}
```

### 人群画像适配

根据出行人群调整推荐策略（已在 system prompt 中定义规则，服务层需要支持过滤）：
- 带老人 → 优先有电梯、低楼层
- 带婴幼儿 → 优先亲子房、婴儿床
- 人数 ≥ 5 → 推荐家庭套房

### 文件变更

1. `src/services/hotel-service.ts` — 新建，核心搜索逻辑
2. `src/tools/hotels.ts` — 改造，调用真实服务
3. `src/services/post-processor.ts` — 集成酒店数据到行程后处理

### 验收标准

- [ ] 输入城市名 + 预算范围，返回 5-10 个真实酒店
- [ ] 支持景点坐标附近搜索
- [ ] 无 API Key 时优雅降级到 mock
- [ ] 酒店数据正确写入 TripPlan 的 day.hotel
- [ ] 预算计算使用真实酒店价格
- [ ] 单元测试覆盖搜索 + 降级逻辑

## 技术参考

- 餐厅服务 (`src/services/restaurant-service.ts`) — 类似的 POI 周边搜索实现
- 高德周边搜索 API: `https://restapi.amap.com/v3/place/around?types=酒店&location=lng,lat`
- Google Places Nearby: `https://maps.googleapis.com/maps/api/place/nearbysearch/json?type=lodging`
