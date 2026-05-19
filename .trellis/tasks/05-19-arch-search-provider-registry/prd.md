# 架构深化 #6: SearchOrchestrator 引入 Provider 注册表

## 优先级
⭐⭐ — 中影响，低工作量

## 问题

`runParallelSearch()` 硬编码了三个搜索源（景点/天气/地理编码）。添加新搜索源（如酒店、餐厅到预搜索阶段）需要修改这个函数。

与 XHS 的 Provider 适配器模式对比，这里缺少类似的 `SearchProvider` 接口。

## 方案

### SearchProvider 接口 + 注册表

```typescript
interface SearchProvider {
  name: string;
  search(request: TripRequest): Promise<SearchProviderResult>;
}

interface SearchProviderResult {
  key: string;  // "attractions" | "weather" | "geocode" | "hotels" | ...
  data: unknown;
  source: string;
}

// 注册表
const providers = new Map<string, SearchProvider>();

// orchestrator 变为通用管线
async function runParallelSearch(request: TripRequest): Promise<SearchResultsBundle> {
  const results = await Promise.all(
    Array.from(providers.values()).map(p => p.search(request).catch(...))
  );
  return aggregate(results);
}
```

### 默认注册的 Provider

| Provider | 说明 |
|----------|------|
| `AttractionSearchProvider` | 景点搜索 |
| `WeatherSearchProvider` | 天气查询 |
| `GeocodeSearchProvider` | 地理编码 |

### 扩展（由 hotel-search 任务触发）

- `HotelSearchProvider` — 酒店搜索（当前 hotel-search 任务完成后注册）

## 涉及文件

### 新建
- `src/services/search/providers/types.ts` — SearchProvider 接口
- `src/services/search/providers/attraction.ts`
- `src/services/search/providers/weather.ts`
- `src/services/search/providers/geocode.ts`

### 修改
- `src/services/search-orchestrator.ts` — 重构为 provider 注册表 + 通用管线

### 测试
- Provider 单元测试
- Orchestrator 集成测试

## 收益

- **Depth**: 添加新搜索源只需 `registerProvider(new XXX())`
- **Locality**: 每个搜索源的 bug 集中在自己的 provider
- **一致性**: 与 XHS adapter 模式对齐

## 验收标准

- [ ] `SearchProvider` 接口定义
- [ ] 现有 3 个搜索源迁移为 Provider
- [ ] `runParallelSearch()` 使用注册表
- [ ] 注册新 Provider 不需要改 orchestrator
- [ ] 现有测试通过
