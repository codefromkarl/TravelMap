# P6-P0b: 确定性计算移出 LLM

## 目标
将 `calculate_budget` 和 `generate_action_links` 从 LLM 工具调用改为纯代码层计算，省掉 ~2-4 次 LLM 调用。

## 当前问题

```
[LLM 编排完成行程] → [LLM 决定调用 calculate_budget] → 执行 → [LLM 继续]
→ [LLM 决定调用 generate_action_links] → 执行 → [LLM 继续]
→ [LLM 最终格式化输出]
```

budget 和 action_links 完全是确定性计算，不需要 LLM 推理：
- `calculateBudget()` — 纯数学计算（求和）
- `enrichTripWithLiveLinks()` — API 调用 + URL 生成

## 优化方案

### 方案: 编排后自动后处理

在 `TravelAgent` 中，LLM 生成 `TripPlan` 后，代码层自动调用后处理：

```typescript
// 编排完成后
const tripPlan = await agent.generatePlan(searchResults);

// 后处理：纯计算，不走 LLM
tripPlan.budget = calculateBudget(tripPlan);
tripPlan = await enrichTripWithLiveLinks(tripPlan);
```

### 具体改动

1. **新增 `src/services/post-processor.ts`** — 后处理编排器
   - `process(tripPlan)` — 依次调用 budget/links
   - 支持部分输出（先出 budget，再出 links）

2. **修改 `calculateBudgetTool`** — 改为同步函数 export
   - tool 仍然保留（向后兼容），但默认不注册到 Agent
   - 直接 `import { calculateBudget } from "../services/budget-service.js"` 调用

3. **修改 `generateActionLinksTool`** — 改为同步/异步函数 export
   - 同样保留 tool 但不注册
   - 直接 `import { enrichTripWithLiveLinks } from "../services/action-link-service.js"`

4. **修改 `TravelAgent`** — 在输出前自动触发后处理
   - 监听 LLM 完成事件
   - 解析 JSON 输出为 `TripPlan`
   - 调用后处理器

## 验收标准
- [ ] 新增 `post-processor.ts` + 单元测试
- [ ] `calculateBudget` 和 `enrichTripWithLiveLinks` 可直接 service 层调用
- [ ] budget/links 不再触发 LLM 工具调用
- [ ] LLM 编排后 tripPlan 自动附带 budget + links
- [ ] 保留 tool 向后兼容（可选注册）
- [ ] `npm run check` 全部通过
