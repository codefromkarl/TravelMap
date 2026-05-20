# LLM Token 优化

## Goal

减少每次规划的 input tokens，预计节省 30-40% LLM 成本。

## Current State

- 14 个工具全部注入到每次 LLM 调用
- PreSearch 成功后，搜索类工具仍然保留在工具列表中
- System prompt 在所有阶段使用相同的模板

## Target State

- PreSearch 成功后，移除搜索类工具定义
- 工具定义按需加载
- Steering 阶段使用精简 prompt

## Requirements

### 1. PreSearch 后移除搜索工具
- 文件: `src/agent/travel-agent.ts`
- 当 `preSearch` 成功且搜索结果已注入时，从工具列表中移除:
  - `search_attractions`
  - `search_weather`
  - `search_xhs`
- 保留: `get_route`, `get_budget`, `ai_guide` 等非搜索工具

### 2. 工具按阶段分组优化
- `createSearchTools()` 返回搜索类工具
- `createPlanningTools()` 返回规划类工具
- PreSearch 后自动切换到 `createPlanningTools()`

### 3. Token 计数监控
- 在 `CostTracker` 中添加 token 使用趋势
- 对比优化前后的 token 使用量

## Acceptance Criteria

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | PreSearch 后工具数减少 | 日志显示工具数量变化 |
| 2 | Planning 阶段不包含搜索工具 | 代码审查 + 测试 |
| 3 | 所有现有测试通过 | `npm test` |
| 4 | Token 使用量可对比 | CostTracker 输出 |

## Technical Notes

### 实现方案

在 `planTrip()` 方法中：
```typescript
// PreSearch 成功后切换工具集
if (this.preSearch && searchBundle.attractions.length > 0) {
  this.setToolsByPhase("planning"); // 只保留规划工具
}
```
