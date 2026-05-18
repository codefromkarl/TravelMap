# P6-P1b: 工具 schema 按需注入

## 目标
每个阶段只注入当前需要的工具 schema，减少 input tokens。

## 当前问题

当前 `createTools()` 返回 8 个工具的完整 schema，每次 LLM 调用都全量注入。

## 优化方案

```typescript
// 阶段化工具集
const SEARCH_TOOLS: AgentTool[] = [
  searchAttractionsTool,
  searchWeatherTool,
  searchHotelsTool,
];

const PLANNING_TOOLS: AgentTool[] = [
  calculateBudgetTool,
  generateActionLinksTool,
  planMultiCityTool,
];

const COMPANION_TOOLS: AgentTool[] = [
  companionQATool,
];
```

### 具体改动

1. **修改 `src/tools/index.ts`** — 按阶段导出工具集
   - `createSearchTools()` — 搜索工具
   - `createPlanningTools()` — 编排工具
   - `createCompanionTools()` — 伴游工具

2. **修改 `TravelAgent`** — 阶段切换时更新 tools
   - 搜索阶段只注入搜索工具
   - 编排阶段只注入编排工具

## 验收标准
- [ ] 工具按阶段分组导出
- [ ] 搜索阶段只注入搜索工具
- [ ] 编排阶段只注入编排工具
- [ ] 伴游问答阶段只注入 companion 工具
- [ ] `npm run check` 全部通过
