# P2: 交通票价为 0 时添加价格免责提示

## 背景

城际交通服务中，高德 API 返回的火车票价经常为 0（`transit_fee` 字段缺失或为空）。当前直接显示 `¥0`，用户可能误认为免费。

## 目标

当票价不可靠时，显示合理提示而非 `¥0`。

---

## 决策记录（Grill Me 已确认）

### D1. 不改 TransportOption 类型
这是展示层问题，不加 `priceReliable` 字段。格式化时直接判断 `price === 0 && source`。

### D2. 价格显示逻辑
- `price > 0` → 显示 `¥${price}`
- `price === 0 && source === "amap"` → 显示 `价格待查（以12306为准）`
- `price === 0 && source === "mock"` → 显示 `价格待查`
- `price === 0 && source === "trvl"` → 显示 `¥0`（trvl 有真实价格，0 就是真 0）

### D3. 统一 helper 函数
两处格式化（transport-service.ts 和 transport.ts）共用 `formatTransportPrice(price, source)` 函数。

---

## 文件变更

### 修改
1. `src/services/transport-service.ts`
   - 新增 `formatTransportPrice(price, source)` helper
   - 修改 `enrichTransferDays()` 中的 transferInfo 格式化

2. `src/tools/transport.ts`
   - 修改 tool 输出的价格格式化，复用同一 helper

### 不变
- `src/types/trip.ts` — TransportOption 类型不改
- 搜索逻辑不改

## 核心逻辑

```typescript
function formatTransportPrice(price: number, source: string): string {
  if (price > 0) return `¥${price}`;
  if (source === "trvl") return "¥0";
  if (source === "amap") return "价格待查（以12306为准）";
  return "价格待查"; // mock 或其他
}
```

## 输出变更对比

```
之前：🚄 G7500 08:00→09:30（1小时30分）¥0 杭州站→上海站 二等座
之后：🚄 G7500 08:00→09:30（1小时30分）价格待查（以12306为准）杭州站→上海站 二等座

之前：🚄 G7590 10:00→11:00（1小时）¥73 杭州东站→上海虹桥站 二等座
之后：（不变）¥73
```

## 验收标准

- [ ] price=0 + source=amap → "价格待查（以12306为准）"
- [ ] price=0 + source=mock → "价格待查"
- [ ] price=0 + source=trvl → "¥0"
- [ ] price > 0 → 正常显示 "¥XX"
- [ ] 两处格式化行为一致
- [ ] 预约链接（12306）仍正常生成
- [ ] 现有测试通过
