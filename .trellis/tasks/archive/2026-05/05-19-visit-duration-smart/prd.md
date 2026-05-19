# P1: 景点游览时长按类型智能推断

## 背景

当前所有景点的 `visitDuration` 硬编码为 `120` 分钟。导致博物馆被低估、公园被高估，行程编排时间不准。

## 目标

根据景点类型和名称特征智能推断游览时长。

---

## 决策记录（Grill Me 已确认）

### D1. 推断位置
在 `searchAttractionsMultiSource` 最终融合后、返回前，统一推断。一个函数处理，不分散到各 adapter。

### D2. 推断优先级
1. 免费源提供的真实时长（fusion-engine 已有 median 逻辑）→ 直接使用
2. 类型推断（查 `VISIT_DURATION_MAP`）
3. 名称关键词加时（+60min）
4. 默认值 120 分钟

### D3. 时长映射表

| 类别 | 时长(分钟) |
|------|-----------|
| 博物馆 | 180 |
| 艺术画廊 | 150 |
| 主题乐园 | 360 |
| 公园 | 90 |
| 自然风光 | 120 |
| 宗教场所 | 60 |
| 购物 | 90 |
| 景点（默认） | 120 |

### D4. 面积判断
不做面积判断（无景区边界数据）。改为名称关键词匹配加时。

### D5. 关键词加时词表
景点名包含以下任一关键词 → `visitDuration += 60`：
```typescript
const EXTENDED_KEYWORDS = ["大", "景区", "国家公园", "乐园", "度假区", "世界遗产", "5A"];
```

---

## 文件变更

### 修改
1. `src/services/multi-source-service.ts`
   - 新增 `VISIT_DURATION_MAP` 常量
   - 新增 `EXTENDED_KEYWORDS` 常量
   - 新增 `inferVisitDuration(attraction)` 函数
   - 修改 `searchAttractionsMultiSource()`：融合后遍历推断时长

2. `src/services/multi-source-service.ts` — `fetchGooglePlaces()`
   - 移除 `visitDuration: 120` 硬编码，改为 `visitDuration: 0`（占位，后续推断）

### 不变
- 免费源 adapter（已有 visitDuration 框架，暂不改）
- 融合引擎（已有 median 逻辑）
- Tool 层

## 核心逻辑

```typescript
const VISIT_DURATION_MAP: Record<string, number> = {
  "博物馆": 180, "艺术画廊": 150,
  "主题乐园": 360, "公园": 90,
  "自然风光": 120, "宗教场所": 60,
  "购物": 90, "景点": 120,
};

const EXTENDED_KEYWORDS = ["大", "景区", "国家公园", "乐园", "度假区", "世界遗产", "5A"];

function inferVisitDuration(a: EnrichedAttraction): number {
  // 1. 已有真实时长 → 直接用
  if (a.visitDuration && a.visitDuration > 0) return a.visitDuration;

  // 2. 类型查表
  const base = VISIT_DURATION_MAP[a.category] ?? 120;

  // 3. 名称关键词加时
  const hasExtended = EXTENDED_KEYWORDS.some(kw => a.nameZh.includes(kw));
  return hasExtended ? base + 60 : base;
}
```

## 验收标准

- [ ] 博物馆类景点 ≥ 150min
- [ ] 小型景点（宗教场所）≤ 90min
- [ ] 名称含"景区/乐园/5A"等关键词的景点时长 +60min
- [ ] 免费源有时长数据时优先使用，不做推断
- [ ] 所有现有测试通过
- [ ] 不同类型景点的时长推断有对应测试用例

## 测试策略

1. 博物馆 → 180min
2. 公园 → 90min
3. 名含"景区"的公园 → 150min（90+60）
4. 已有 visitDuration=200 → 保持 200
5. 未知类别 → 120min（默认）
6. 主题乐园 → 360min
