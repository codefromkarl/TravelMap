# 真实餐厅推荐服务

## 背景

当前行程中每天有早中晚三餐推荐，但 `Meal.estimatedCost` 是 LLM 编排时的粗略估算，没有真实餐厅数据支撑。用户对"吃什么"的关注度极高（仅次于"住哪里"和"玩什么"），这是当前产品体验的最大短板之一。

项目已有高德 POI 搜索能力（`supply-validation-service.ts` 的 L1 层），只是未作为独立餐厅服务暴露。

## 目标

新增 `restaurant-service.ts`，基于高德 POI API 搜索景点周边真实餐厅，返回名称、评分、人均消费、距离等结构化数据，用于：
1. 替代 LLM 编排的粗略估算，生成有真实数据支撑的餐饮推荐
2. 融入后处理管道（`post-processor.ts`），自动丰富每日三餐
3. 前端可展示餐厅卡片（评分、价格、距离景点步行时间）

## 数据源分层

```
L1 高德周边搜索 API  — 国内精确坐标 + 评分 + 人均消费 + 距离
L2 Google Places API — 国外餐厅数据（Nearby Search）
L3 mock 降级         — 无 API Key 时保持现有行为
```

## 功能需求

### F1: `searchNearbyRestaurants` 核心搜索

输入：
- `location: { latitude, longitude }` — 搜索中心点（通常是景点坐标）
- `city: string` — 城市名（用于国内/国外判断）
- `radius?: number` — 搜索半径（米），默认 1000
- `mealType?: "breakfast" | "lunch" | "dinner"` — 餐类（影响搜索关键词）
- `cuisine?: string` — 菜系偏好（如"川菜"、"日料"）
- `limit?: number` — 返回数量上限，默认 5

输出：`RestaurantResult[]`

```ts
interface Restaurant {
  name: string;           // 餐厅名称
  rating: number;         // 评分 (0-5)
  averageCost: number;    // 人均消费（元）
  distance: number;       // 距搜索中心距离（米）
  walkMinutes: number;    // 步行时间估算（分钟，5km/h）
  cuisine: string;        // 菜系/品类
  address: string;        // 地址
  location: Location;     // 坐标
  businessHours?: string; // 营业时间
  phone?: string;         // 电话
  signature?: string;     // 招牌菜/推荐菜
  source: "amap" | "google" | "mock";
}
```

### F2: `enrichDayMeals` 行程餐饮丰富

输入：`DayPlan`（已有景点和坐标）
输出：`DayPlan`（meals 被替换为真实餐厅数据）

逻辑：
1. 取当天景点的坐标作为搜索中心
2. 早餐 → 酒店附近搜索；午餐 → 午间景点附近搜索；晚餐 → 最后一个景点附近搜索
3. 按评分 + 距离排序，取 Top 3
4. 合并到 `DayPlan.meals` 中，保留原有的 `type` 和 `estimatedCost`

### F3: 后处理管道集成

在 `post-processor.ts` 中新增可选步骤：
- `PostProcessorConfig.enableRestaurantEnrich?: boolean` — 默认 false（避免影响现有行为）
- 启用后，在预算计算之前调用 `enrichDayMeals`
- 预算计算自动使用真实人均消费

### F4: 缓存

- 同一坐标 + 半径的搜索结果缓存 4 小时（LRU，max 500）
- 缓存 key: `${lat.toFixed(3)},${lng.toFixed(3)}:${radius}:${mealType ?? "any"}`

### F5: Agent Tool `search_restaurants`

注册为 LLM 工具，供 Agent 在编排阶段或伴游问答时直接调用：
- `costTier: "cheap"` — 搜索类工具，用便宜模型
- 参数：city, location, mealType, cuisine, limit
- 返回格式化的餐厅列表文本

## 技术约束

1. **复用现有基础设施**：
   - HTTP 请求走 `http-client.ts` 的 `fetchWithTimeout`
   - 配置走 `config.ts` 的 `amapWebKey` / `googleMapsApiKey`
   - 国内/国外判断走 `dual-map-service.ts` 的 `isDomesticCity`

2. **不破坏现有行为**：
   - `PostProcessorConfig.enableRestaurantEnrich` 默认 false
   - API 无 key 时静默降级到 mock，不抛错
   - 前端不修改（先出后端能力，前端后续迭代）

3. **测试要求**：
   - 单元测试覆盖 `searchNearbyRestaurants`（mock API 响应）
   - 单元测试覆盖 `enrichDayMeals`（给定 DayPlan，验证 meals 被正确填充）
   - 降级测试：无 API Key → mock 数据

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `src/services/restaurant-service.ts` | 核心搜索 + enrich + mock |
| 新增 | `src/tools/restaurants.ts` | Agent Tool 定义 |
| 新增 | `src/__tests__/unit/services/restaurant-service.test.ts` | 单元测试 |
| 修改 | `src/services/post-processor.ts` | 新增 enableRestaurantEnrich 步骤 |
| 修改 | `src/tools/index.ts` | 注册新工具到 createSearchTools / createTools |
| 修改 | `src/types/trip.ts` | Meal 类型扩展（可选 restaurant 字段） |
| 修改 | `src/index.ts` | 导出新服务 |
