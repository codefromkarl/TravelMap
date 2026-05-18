# P8-a: 两层模型智能路由

## 目标
根据请求复杂度自动选择 L1（轻量）或 L2（强推理）模型，优化成本。

## 两层模型

| 层级 | 模型 | 适用场景 | 成本对比 |
|------|------|----------|----------|
| L1 | gpt-4o-mini | 单城市、≤3天、无特殊偏好 | ~1x |
| L2 | claude-sonnet-4 | 多城市、>3天、复杂偏好 | ~50x |

## 选择逻辑

```typescript
function selectModelTier(request: TripRequest): "L1" | "L2" {
  if (request.cities.length > 1) return "L2";
  if (request.travelDays > 3) return "L2";
  if (request.preferences.length > 2) return "L2";
  if (request.freeTextInput && request.freeTextInput.length > 20) return "L2";
  return "L1";
}
```

## 具体改动

1. **修改 `TravelAgent`** — 构造时根据请求选择初始模型
   - 新增 `modelTier` 选项
   - `planTrip()` 时自动选择

2. **修改 `cost-tracker.ts`** — 记录 L1/L2 使用统计

## 验收标准
- [ ] 单城市3天自动使用 L1
- [ ] 多城市自动使用 L2
- [ ] 费用统计区分 L1/L2
- [ ] `npm run check` 通过
