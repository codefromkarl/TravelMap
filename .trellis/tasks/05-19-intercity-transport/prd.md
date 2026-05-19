# 城际交通查询服务

## 背景

当前城际交通方案有两层：
1. `trvl-service.ts` — 已支持航班搜索（通过 trvl CLI），可获取实时价格
2. `action-link-service.ts` — 生成携程/去哪儿的搜索 URL（无实际数据）

但**缺少高铁/火车查询**，而国内旅行中高铁是主力交通方式。用户说"杭州到上海怎么走"，只能拿到一个跳转链接，看不到具体班次。

## 目标

新增 `transport-service.ts`，提供统一的城际交通查询能力：
1. 航班：复用现有 trvl CLI 搜索
2. 高铁/火车：调用 12306 相关公开 API 或第三方接口
3. 统一输出结构化交通方案列表
4. 融入后处理管道，自动为城际移动日填充交通方案

## 数据源分层

```
L1 航班 — trvl CLI（已有，复用 searchFlights）
L2 火车 — 高德路线规划 API（路线规划接口返回火车方案） / 12306 公开数据
L3 mock — 无 API 时返回估算方案
```

### 火车数据源选择

经评估，**高德路线规划 API** 是最佳选择：
- 已有 `amapWebKey`，无需新 API Key
- 支持火车/大巴/自驾等多种交通方式
- 返回班次、时长、价格
- 覆盖国内主要城市

API 端点：`GET https://restapi.amap.com/v3/direction/transit/integrated`
- 参数：origin, destination, city, cityd, strategy
- 返回：transits[].segments[] 包含火车/公交方案

## 功能需求

### F1: `searchIntercityTransport` 核心查询

输入：
- `originCity: string` — 出发城市
- `destCity: string` — 目的城市
- `date: string` — 出发日期 (YYYY-MM-DD)
- `transportType?: "train" | "flight" | "all"` — 交通类型，默认 "all"

输出：`TransportOption[]`

```ts
interface TransportOption {
  type: "train" | "flight" | "bus";
  /** 班次号（如 G7590, MU5123） */
  code: string;
  /** 出发时间 */
  departureTime: string;
  /** 到达时间 */
  arrivalTime: string;
  /** 历时（分钟） */
  durationMinutes: number;
  /** 价格（元） */
  price: number;
  /** 出发站/机场 */
  departureStation: string;
  /** 到达站/机场 */
  arrivalStation: string;
  /** 座位类型/舱位（如"二等座"/"经济舱"） */
  seatType?: string;
  /** 预订链接 */
  bookingUrl?: string;
  /** 数据来源 */
  source: "trvl" | "amap" | "mock";
}
```

### F2: `enrichTransferDays` 城际移动日丰富

输入：`TripPlan`
输出：`TripPlan`（transferDay 的 transferInfo 被替换为结构化交通方案）

逻辑：
1. 找到所有 `isTransferDay = true` 的天
2. 从前后城市推断出发/目的地
3. 并行查询航班 + 火车
4. 取价格最优的 2-3 个方案写入 `transferInfo`

### F3: 后处理管道集成

- `PostProcessorConfig.enableTransportEnrich?: boolean` — 默认 false
- 启用后，在预算计算之前调用 `enrichTransferDays`

### F4: Agent Tool `search_intercity_transport`

- `costTier: "cheap"`
- 参数：originCity, destCity, date, transportType
- 返回格式化的交通方案列表

### F5: 缓存

- 同路线 + 日期缓存 2 小时（LRU，max 300）
- 缓存 key: `${originCity}:${destCity}:${date}:${transportType}`

## 技术约束

1. **复用现有基础设施**：
   - 航班搜索复用 `trvl-service.ts` 的 `searchFlights`
   - HTTP 请求走 `fetchWithRetry`
   - 配置走 `config.ts` 的 `amapWebKey`
   - 城市→坐标走 `dual-map-service.ts`

2. **不破坏现有行为**：
   - `enableTransportEnrich` 默认 false
   - trvl 不可用时不报错，只走火车 + mock
   - 高德无 key 时降级到 mock

3. **测试要求**：
   - 单元测试覆盖火车搜索（mock 高德 API）
   - 单元测试覆盖 enrichTransferDays
   - 降级测试

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `src/services/transport-service.ts` | 核心搜索 + enrich + mock |
| 新增 | `src/tools/transport.ts` | Agent Tool 定义 |
| 新增 | `src/__tests__/unit/services/transport-service.test.ts` | 单元测试 |
| 新增 | `src/__tests__/unit/tools/transport.test.ts` | Tool 测试 |
| 修改 | `src/services/post-processor.ts` | 新增 enableTransportEnrich |
| 修改 | `src/tools/index.ts` | 注册新工具 |
| 修改 | `src/types/trip.ts` | 新增 TransportOption 类型 |
| 修改 | `src/index.ts` | 导出新服务 |
