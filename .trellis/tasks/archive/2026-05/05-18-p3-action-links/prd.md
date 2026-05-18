# P3-4: 行动链接增强 — 集成 trvl CLI 实时价格

## 目标
从"URL 模板"升级到"实时价格 + 直接预订链接"——通过集成 trvl CLI 获取真实航班/酒店数据。

## 背景
- 当前实现使用 URL 模板拼接搜索链接（Booking.com/Skyscanner/携程等），无实时价格
- [trvl](https://github.com/MikkoParkkola/trvl) 是开源旅行 MCP Server + CLI，支持 Google Flights/Hotels/Trivago 等 21 个数据源
- trvl 的 `--format json` 输出包含 `booking_url`（直接预订链接）和实时价格

## 实现方案

### 1. 新增 trvl-service.ts — trvl CLI 调用层

- 通过 `child_process.execFile` 调用 trvl CLI
- `searchFlights(origin, dest, date)` → `trvl flights PEK SHA 2026-07-01 --format json --currency CNY`
- `searchHotels(city, checkin, checkout)` → `trvl hotels "北京" --checkin 2026-07-01 --checkout 2026-07-03 --format json --currency CNY`
- 检测 trvl 是否可用（`trvl version`），不可用则标记 `available: false`
- 30s timeout，失败抛出错误让调用方 fallback

### 2. 修改 action-link-service.ts — 双层策略

```
trvl 可用 → 调用 trvl 获取实时价格 + booking_url
  ↓ (失败/不可用)
URL 模板 fallback（保留现有逻辑）
```

增强点：
- **航班链接**: trvl 返回带价格的 `FlightResult.booking_url` 替代 URL 模板
- **酒店链接**: trvl 返回 `HotelResult.sources[]`（多平台比价链接 + 各平台价格）
- **新增字段**: `ActionLink` 类型扩展 price/currency 字段（可选）

### 3. 类型扩展

```typescript
// ActionLink 扩展
export interface ActionLink {
  platform: string;
  url: string;
  label: string;
  price?: number;       // 新增：实时价格
  currency?: string;    // 新增：货币
  source?: string;      // 新增：数据来源 "trvl" | "template"
}

// 航班搜索结果
export interface FlightSearchResult {
  success: boolean;
  count: number;
  trip_type: string;
  flights: FlightResult[];
  error?: string;
}

export interface FlightResult {
  price: number;
  currency: string;
  duration: number;
  stops: number;
  booking_url?: string;
  legs: FlightLeg[];
}

export interface FlightLeg {
  departure_airport: { code: string; name: string };
  arrival_airport: { code: string; name: string };
  departure_time: string;
  arrival_time: string;
  airline: string;
}

// 酒店搜索结果
export interface HotelSearchResult {
  success: boolean;
  count: number;
  hotels: HotelSearchItem[];
  error?: string;
}

export interface HotelSearchItem {
  name: string;
  rating: number;
  stars: number;
  price: number;
  currency: string;
  booking_url?: string;
  sources: { provider: string; price: number; currency: string; booking_url?: string }[];
}
```

### 4. 城市→IATA 映射

trvl 需要 IATA 机场代码，我们的行程数据用的是中文城市名。需要一个映射表：

```typescript
const CITY_IATA_MAP: Record<string, string[]> = {
  "北京": ["PEK", "PKX"],
  "上海": ["PVG", "SHA"],
  "广州": ["CAN"],
  "深圳": ["SZX"],
  "成都": ["CTU", "TFU"],
  "西安": ["XIY"],
  "杭州": ["HGH"],
  "重庆": ["CKG"],
  "南京": ["NKG"],
  "武汉": ["WUH"],
  // ... 扩展
};
```

### 5. 测试策略

- **trvl-service.ts**: mock `child_process.execFile`，测试正常/超时/未安装场景
- **action-link-service.ts**: 新增 "trvl 可用" 场景测试，验证 fallback 逻辑
- **MSW handlers**: 不需要（trvl 是 CLI 不是 HTTP）

## 验收标准
- [ ] trvl 可用时，酒店附带实时比价链接（含价格）
- [ ] trvl 可用时，城际交通附带实时航班搜索链接
- [ ] trvl 不可用时，fallback 到现有 URL 模板
- [ ] 新增类型定义完整
- [ ] 测试覆盖正常路径 + trvl 不可用 + trvl 超时
- [ ] `npm run check` 全部通过
