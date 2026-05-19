# P2: 门票价格添加仅供参考免责声明

## 背景

门票价格来源多样（Google Places 不返回价格、去哪儿爬取可能过时、mock 数据是编造的），但输出中没有标注数据可靠性，用户可能误认为是实时价格。

## 目标

在景点搜索结果中标注价格数据来源和可靠性。

## 需求

### 改动点

1. **`src/tools/attractions.ts`** — 输出格式调整
   - 当 `ticketPrice > 0` 且来源为去哪儿/免费源：显示 "¥80（仅供参考）"
   - 当 `ticketPrice === 0`：显示 "免费" 或 "价格待查"
   - 当来源为 mock：显示 "价格待查"

2. **`src/types/trip.ts`** — Attraction 类型新增字段
   ```typescript
   priceReliable?: boolean;  // 价格是否可靠
   priceNote?: string;       // 价格备注
   ```

3. **`src/services/multi-source-service.ts`** — 融合时标注价格来源
   - 去哪儿价格：`priceReliable: true`，`priceNote: "参考价格，以景区实际为准"`
   - Google/mock：`priceReliable: false`，`priceNote: "价格待查"`

### 输出格式变更

```
之前：🎫 ¥80 | ⏱ 120分钟
之后：🎫 ¥80（参考价，以景区为准）| ⏱ 120分钟
```

```
之前：🎫 ¥0 | ⏱ 120分钟
之后：🎫 免费或价格待查 | ⏱ 120分钟
```

### 验收标准

- [ ] 有可靠价格来源时显示 "参考价，以景区为准"
- [ ] 无价格数据时显示 "价格待查" 而非 "¥0"
- [ ] 不影响预算计算逻辑（预算仍然用原始数值）
