# P8-b: Steering 增量输出

## 目标
Steer 时 LLM 只输出变更部分（diff），代码层合并到原行程，减少 90% output tokens。

## 当前问题

```
steer("第二天换成文化景点") → LLM 输出完整 3天 TripPlan JSON → ~5000 output tokens
```

## 优化方案

### Diff 模式

LLM 只输出变更：

```json
{
  "changedDays": [2],
  "day2": { /* 新的 Day 2 */ },
  "reason": "按用户要求将 Day 2 改为文化景点"
}
```

代码层合并：

```typescript
const merged = { ...originalPlan };
merged.days[1] = diff.day2;
```

### Prompt 调整

```typescript
const STEERING_PROMPT_DIFF = `你是「旅图」旅行管家。

当前任务：基于已有行程做最小化修改。

规则：
- 只修改用户指定的天数
- 只输出变更的部分（JSON 格式）
- 不要输出未修改的天数

输出格式：
{
  "changedDays": [天数索引],
  "dayN": { /* 变更后的当天行程 */ }
}`;
```

## 验收标准
- [ ] steer 只输出变更天数
- [ ] 代码层正确合并 diff
- [ ] 最终 TripPlan 完整且正确
- [ ] `npm run check` 通过
