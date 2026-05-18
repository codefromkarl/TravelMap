# P6-P0a: 搜索工具预编排 — 并行直接调用搜索服务

## 目标
将景点/天气/酒店的搜索从"LLM 逐个决策调用"改为"代码层直接并行调用"，LLM 只负责编排。省掉 ~6-8 次 LLM 调用。

## 当前问题

当前流程中，LLM 每轮只能决定调用一个工具：

```
[LLM] "我要先搜景点" → search_attractions → [LLM 继续] "接下来查天气" → search_weather → ...
```

这是 N+1 轮的问题（N 个工具 + 1 次编排），每轮都消耗 system prompt + 历史消息的 input tokens。

## 优化方案

### 方案: PreSearchOrchestrator

在 `planTrip()` 入口处，根据 `TripRequest` 参数**直接并行调用**所有搜索服务，将结果打包后一次性发给 LLM 编排：

```typescript
class PreSearchOrchestrator {
  async run(request: TripRequest): Promise<SearchResultsBundle> {
    return Promise.all([
      this.searchAttractions(request),
      this.searchWeather(request),
      this.searchHotels(request),
    ]);
  }
}
```

然后 LLM 调用变为：

```
[LLM 1 次调用] 收到所有搜索结果 → 编排完整行程 → 输出 JSON
```

### 具体改动

1. **新增 `src/services/search-orchestrator.ts`** — 并行搜索编排器
   - `runParallelSearch(request)` — 并行调用 attraction/weather/hotel
   - `formatForAgent(bundle)` — 将搜索结果格式化为 agent prompt

2. **修改 `TravelAgent.planTrip()`** — 先执行预搜索再喂给 LLM
   - 调用 `searchOrchestrator.run()` 获取所有结果
   - 将结果注入 system prompt 或 user message
   - LLM 不再需要 search_* 工具，tool set 简化为 `calculate_budget`, `generate_action_links` 等

3. **修改 `createTools()`** — 移除搜索类工具（或标记为 "optional"）
   - 搜索工具改为可选/手动触发
   - LLM 只有编排相关工具

4. **新增 fallback 路径** — 如果预搜索失败，允许 LLM 手动调用搜索工具

## 类型设计

```typescript
// src/services/search-orchestrator.ts
interface SearchResultsBundle {
  attractions: EnrichedAttraction[];
  weather: WeatherInfo[];
  hotels: Hotel[];
  sources: string[]; // 数据来源
}
```

## 验收标准
- [ ] 新增 `search-orchestrator.ts` + 单元测试
- [ ] `planTrip()` 调用改为先预搜索后 LLM 编排
- [ ] LLM 不再自动调用 search_* 工具
- [ ] 搜索阶段总 LLM 调用 ≤ 1 次（原 ~6 次）
- [ ] 失败时 fallback 到手动搜索模式
- [ ] `npm run check` 全部通过
