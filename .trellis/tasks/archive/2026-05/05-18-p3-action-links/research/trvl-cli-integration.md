# trvl CLI 集成研究

## 项目信息

- **GitHub**: https://github.com/MikkoParkkola/trvl
- **版本**: v1.2.3 (2026-05)
- **语言**: Go（单二进制）
- **License**: PolyForm NC 1.0（非商用免费）
- **安装**: `brew install MikkoParkkola/tap/trvl` 或下载二进制

## 核心能力

| 命令 | 功能 | 示例 |
|------|------|------|
| `trvl flights ORG DEST DATE` | 航班搜索 | `trvl flights PEK SHA 2026-07-01 --format json` |
| `trvl hotels CITY --checkin DATE --checkout DATE` | 酒店搜索 | `trvl hotels "北京" --checkin 2026-07-01 --checkout 2026-07-03 --format json` |
| `trvl ground FROM TO DATE` | 地面交通 | 火车/巴士/渡轮 |
| `trvl watch` | 价格监控 | 降价提醒 |

## 关键 CLI 参数

### flights

```bash
trvl flights <ORIGIN> <DEST> <DATE> [flags]
  --return DATE          # 返程日期
  --cabin string         # economy/business/first (default "economy")
  --stops string         # nonstop/0/1/2+
  --sort string          # price/duration/quality
  --adults int           # 乘客数 (default 1)
  --format string        # table/json (default "table")
  --currency string      # 目标货币 (CNY/USD/EUR)
```

### hotels

```bash
trvl hotels <LOCATION> --checkin DATE --checkout DATE [flags]
  --guests int           # 住客数 (default 2)
  --stars int            # 最低星级 (0=any, 2-5)
  --sort string          # cheapest/rating/distance/stars
  --format string        # table/json
  --currency string      # 目标货币
  --min-price float      # 最低价
  --max-price float      # 最高价
  --min-rating float     # 最低评分 (0-10)
  --amenities string     # 设施过滤 (pool,wifi,breakfast)
```

## JSON 输出结构

### FlightSearchResult

```typescript
interface FlightSearchResult {
  success: boolean;
  count: number;
  trip_type: string; // "one_way" | "round_trip"
  flights: FlightResult[];
  provider_statuses?: ProviderStatus[];
  error?: string;
}

interface FlightResult {
  price: number;
  currency: string;
  duration: number; // 总分钟数
  stops: number;
  provider?: string;
  booking_url?: string; // ⭐ 直接可用的预订链接
  legs: FlightLeg[];
  carry_on_included?: boolean;
  checked_bags_included?: number;
  emissions?: number; // CO2 克
}

interface FlightLeg {
  departure_airport: { code: string; name: string };
  arrival_airport: { code: string; name: string };
  departure_time: string;
  arrival_time: string;
  duration: number;
  airline: string;
  airline_code: string;
  flight_number: string;
}
```

### HotelSearchResult

```typescript
interface HotelSearchResult {
  success: boolean;
  count: number;
  total_available?: number;
  hotels: HotelResult[];
  provider_statuses?: ProviderStatus[];
  error?: string;
}

interface HotelResult {
  name: string;
  hotel_id: string;
  rating: number;
  review_count: number;
  stars: number;
  price: number;
  currency: string;
  address: string;
  neighborhood?: string;
  distance_km?: number;
  booking_url?: string; // ⭐ 直接可用的预订链接
  sources: PriceSource[]; // ⭐ 多平台比价
  savings?: number; // 跨平台节省金额
  cheapest_source?: string;
}

interface PriceSource {
  provider: string; // "google_hotels" | "trivago" | "airbnb" | "booking"
  price: number;
  currency: string;
  booking_url?: string; // ⭐ 各平台的预订链接
}
```

## 集成方案

### 调用方式

Node.js 通过 `child_process.execFile` 调用 trvl CLI：

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function searchFlights(origin: string, dest: string, date: string) {
  const { stdout } = await execFileAsync("trvl", [
    "flights", origin, dest, date,
    "--format", "json",
    "--currency", "CNY",
    "--sort", "price",
  ], { timeout: 30000 });
  return JSON.parse(stdout) as FlightSearchResult;
}

async function searchHotels(city: string, checkin: string, checkout: string) {
  const { stdout } = await execFileAsync("trvl", [
    "hotels", city,
    "--checkin", checkin,
    "--checkout", checkout,
    "--format", "json",
    "--currency", "CNY",
    "--sort", "cheapest",
  ], { timeout: 30000 });
  return JSON.parse(stdout) as HotelSearchResult;
}
```

### 降级策略

```
trvl 已安装 → 调用 CLI 获取实时价格 + booking_url
  ↓ (失败或未安装)
URL 模板生成（现有逻辑，作为 fallback）
```

### 数据增强

1. **航班**: 实时价格 + 预订链接 (booking_url) 替代 URL 模板
2. **酒店**: 多平台比价 (sources[]) + 各平台预订链接 + 节省金额
3. **类型扩展**: TripPlan 类型新增 price 字段

## 风险

| 风险 | 缓解 |
|------|------|
| trvl 未安装 | fallback 到 URL 模板 |
| trvl 超时 | 30s timeout + fallback |
| 中国城市 IATA 代码 | 需城市→IATA映射表 |
| License 限制 | PolyForm NC 仅限非商用 |
| Google 数据源在国内可达性 | 可能需要代理，fallback 到 URL 模板 |
