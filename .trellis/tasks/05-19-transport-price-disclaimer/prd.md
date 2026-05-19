# P2: 交通票价为 0 时添加价格免责提示

## 背景

城际交通服务中，高德 API 返回的火车票价经常为 0（`transit_fee` 字段缺失或为空）。当前代码 `price: 0` 直接传给前端，用户可能误认为免费。

## 目标

当票价为 0 或不可靠时，在交通方案中添加价格免责提示。

## 需求

### 改动点

1. **`src/services/transport-service.ts`**
   - 当 `price === 0` 且 `source === "amap"` 时，标记 `priceReliable: false`
   - 在 `TransportOption` 类型中新增 `priceReliable?: boolean`

2. **`src/tools/transport.ts`**
   - 格式化输出时，`priceReliable === false` 显示 "¥?（以12306为准）" 而非 "¥0"

3. **`src/services/post-processor.ts`**
   - transferInfo 文本中的价格也做同样处理

### 输出格式变更

```
之前：🚄 G7500 08:00→09:30（1小时30分）¥0 杭州站→上海站 二等座
之后：🚄 G7500 08:00→09:30（1小时30分）价格待查（以12306为准）杭州站→上海站 二等座
```

### 验收标准

- [ ] price=0 时显示 "价格待查" 而非 "¥0"
- [ ] price > 0 时显示不变
- [ ] mock 数据不受影响
- [ ] 预约链接（12306）仍然正常生成
