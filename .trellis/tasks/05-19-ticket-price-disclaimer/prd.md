# P2: 门票价格添加仅供参考免责声明

## 背景

门票价格来源多样（Google Places 不返回价格、去哪儿爬取可能过时、mock 数据是编造的），输出中没有标注数据可靠性，用户可能误认为是实时价格。

## 目标

在景点搜索结果中标注价格数据来源和可靠性。

---

## 决策记录（Grill Me 已确认）

### D1. 不改 Attraction 类型
纯展示层问题，不加 `priceReliable`/`priceNote` 字段。只在 tool 格式化输出时处理。

### D2. 三层价格显示逻辑
- `ticketPrice > 0` → `¥80（参考价，以景区为准）`
- `ticketPrice === 0` 且 `category` 包含公园/自然风光 → `免费`
- `ticketPrice === 0` 其他 → `价格待查`

### D3. 免费推断规则
城市公园和自然风光免费的居多，`category` 为"公园"或"自然风光"时合理推断为免费。博物馆/主题乐园 0 元大概率是数据缺失，显示"价格待查"。

### D4. 预算不受影响
`budget-service.ts` 直接用 `ticketPrice` 数值计算，不走格式化文本。只在给用户看的文本中加提示。

---

## 文件变更

### 修改
1. `src/tools/attractions.ts` — 仅修改第 49 行的格式化输出

### 不变
- `src/types/trip.ts` — Attraction 类型不改
- `src/services/budget-service.ts` — 预算计算不改
- `src/services/multi-source-service.ts` — 搜索逻辑不改

## 核心逻辑

```typescript
const FREE_CATEGORIES = ["公园", "自然风光"];

function formatTicketPrice(price: number, category: string): string {
  if (price > 0) return `¥${price}（参考价，以景区为准）`;
  if (FREE_CATEGORIES.includes(category)) return "免费";
  return "价格待查";
}
```

## 输出变更对比

```
之前：🎫 ¥80 | ⏱ 120分钟
之后：🎫 ¥80（参考价，以景区为准）| ⏱ 120分钟

之前：🎫 ¥0 | ⏱ 120分钟（西湖，自然风光）
之后：🎫 免费 | ⏱ 120分钟

之前：🎫 ¥0 | ⏱ 180分钟（某博物馆）
之后：🎫 价格待查 | ⏱ 180分钟
```

## 验收标准

- [ ] price > 0 → "¥XX（参考价，以景区为准）"
- [ ] price = 0 + 公园/自然风光 → "免费"
- [ ] price = 0 + 其他类型 → "价格待查"
- [ ] 预算计算仍使用原始数值
- [ ] 现有测试通过
