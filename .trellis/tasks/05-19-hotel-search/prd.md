# P0: 实现酒店搜索服务

## 背景

当前 `search_hotels` tool 是空壳占位，返回硬编码文本。酒店推荐和预算计算完全依赖 LLM 编造，是整个行程规划精准度的最大短板。

## 目标

实现真实的酒店搜索服务，返回酒店名称、位置、价格、评分、标签等真实数据。

---

## 决策记录（Grill Me 已确认）

### D1. 数据源
- **L1 高德 POI 周边搜索** — 国内酒店，`types=10`（住宿服务大类），`extensions=all` 获取 `biz_ext.cost/rating`
- **L2 Google Places Nearby** — 国外酒店，`type=lodging`，`price_level` 映射为价格区间
- **L3 Mock 降级** — 无 API Key 时返回通用建议

### D2. 搜索方式
- 有 `location` 参数 → 坐标周边搜索（精确）
- 只有 `city` → 先 geocode 到城市中心再搜索

### D3. 人群画像过滤
- 高德 POI 不返回"是否有电梯"等精确设施信息
- 用 `style` 参数映射到高德 `keywords` 过滤
- "有电梯"等精细信息交给 LLM 在编排时补充提醒

### D4. 酒店类型与 style 映射
- 默认搜 `types=10`（全部住宿）
- `style` 映射到 `keywords`：经济型→"快捷酒店", 精品民宿→"民宿,客栈", 豪华→"五星,豪华"

### D5. 价格分层（固定阈值）
| 档次 | 价格范围 |
|------|---------|
| 经济型 | < ¥200/晚 |
| 舒适型 | ¥200-500/晚 |
| 豪华型 | > ¥500/晚 |
- `budget` 参数：客户端过滤，先搜再筛价格范围
- Google `price_level` 映射：1→¥100, 2→¥300, 3→¥500, 4→¥800

### D6. 通勤模式（核心差异化功能）
Tool 新增参数：
```typescript
commuteMode?: "walk" | "transit" | "any"  // 通勤方式
commuteMinutes?: number                    // 通勤时间上限（分钟）
```

半径映射：
| 通勤模式 | 默认时间 | 映射半径 |
|---------|---------|---------|
| walk 15min | 15min | 1500m |
| walk 30min | 30min | 3000m |
| transit 30min | 30min | 8000m |
| any | — | 15000m |

- 默认值：`walk` + `30min`（约 3km）
- AI 可根据人群调整（带老人用 transit，年轻人用 walk）

### D7. 通勤信息展示
- 步行时间：从 `distance` 直接算（复用 `walkMinutes` 逻辑）
- 地铁信息：只标注"公共交通可达"，不编造具体站名
- 后续迭代可加高德公交路线规划 API

### D8. 搜索数量
- 最多 10 个，按 `distance` 排序

### D9. 类型衔接
- 复用现有 `Hotel` 类型（`src/types/trip.ts`），扩展 `source`, `tags`, `distance` 字段
- 不创建两套类型

### D10. 数据衔接
- `search_hotels` 返回 `details` 对象（和景点搜索一致）
- post-processor 新增 `enrichHotelsForTrip` 函数
- 如果 `day.hotel` 已有值（AI 已填），保留 AI 选择但补充真实价格和坐标

---

## 文件变更

### 新建
1. `src/services/hotel-service.ts` — 核心搜索逻辑
   - `searchAmapHotels()` — 高德 POI 周边搜索
   - `searchGoogleHotels()` — Google Places Nearby
   - `searchHotels()` — 主入口（L1 → L2 → L3 降级）
   - `enrichHotelsForTrip()` — 后处理：自动为 TripPlan 填充酒店

### 修改
2. `src/tools/hotels.ts` — 改造：调用真实服务，返回 `details`
3. `src/types/trip.ts` — `Hotel` 接口扩展 `source?`, `tags?`, `distance?`
4. `src/services/post-processor.ts` — 集成 `enrichHotelsForTrip`

## 返回数据格式

```typescript
interface HotelSearchResult {
  name: string;
  rating: number;
  price: number;           // 元/晚，高德 biz_ext.cost 或 Google 映射
  priceRange: string;      // "¥198" 或 "¥200-400"
  address: string;
  location: Location;
  distance: number;        // 距搜索中心距离（米）
  walkMinutes: number;     // 步行时间
  transitAccessible: boolean; // 公共交通可达（距离 < 8km）
  tags: string[];          // ["有电梯", "免费停车"] — 来自高德 tag 字段
  source: "amap" | "google" | "mock";
}
```

## Tool 参数

```typescript
{
  city: string;                              // 城市名
  location?: { latitude: number; longitude: number }; // 景点坐标
  budget?: string;                           // "300-500"
  style?: string;                            // "经济型" | "精品民宿" | "豪华"
  commuteMode?: "walk" | "transit" | "any";  // 通勤方式
  commuteMinutes?: number;                   // 通勤时间上限
}
```

## 输出格式示例

```
## 杭州酒店搜索结果

数据源: amap | 通勤: 🚶 步行30分钟内 | 共 8 家

1. 🏨 如家酒店（西湖店）
   📍 距搜索中心 1.2km · 🚶 步行约15分钟
   💰 ¥198/晚 · ⭐ 4.2 · 标签: [免费WiFi] [免费停车]

2. 🏨 全季酒店（龙翔桥店）
   📍 距搜索中心 0.8km · 🚶 步行约10分钟
   💰 ¥320/晚 · ⭐ 4.5 · 标签: [含早餐] [亲子房]
```

## 验收标准

- [ ] 输入城市名 + 预算范围，返回 ≤10 个真实酒店
- [ ] 支持景点坐标周边搜索
- [ ] `style` 参数正确映射到搜索关键词
- [ ] `budget` 参数客户端过滤生效
- [ ] `commuteMode` 参数正确映射搜索半径
- [ ] 步行时间准确显示
- [ ] 无 API Key 时优雅降级到 mock
- [ ] 酒店数据通过 post-processor 正确写入 `day.hotel`
- [ ] 预算计算使用真实酒店价格
- [ ] 现有 `Hotel` 类型扩展（不破坏已有代码）
- [ ] 单元测试覆盖：正常搜索 / style 过滤 / budget 过滤 / 降级

## 测试策略

Mock 高德/Google API 响应，测试：
1. 正常搜索返回酒店列表
2. `style` 参数 → keywords 映射
3. `budget` 参数 → 客户端价格过滤
4. `commuteMode` → 半径映射
5. 坐标搜索 vs 城市名搜索
6. 无 API Key → mock 降级
7. Google price_level → 价格区间映射

## 后续迭代（不在本期）

- 高德公交路线规划 API 查具体公交/地铁时间
- 真实地铁站点名展示
- 酒店比价链接（generate_action_links）
- OTA 价格对接（携程/去哪儿）
