# P1-1: 景点搜索工具

## 目标
实现 `search_attractions` Agent Tool，接入外部景点数据源，返回结构化景点列表。

## 需求
- 接入至少一个景点数据源（优先 Google Places API，备选 TripAdvisor）
- 工具返回结构化数据：景点名称、地址、经纬度、描述、评分、图片URL
- 支持按城市 + 关键词搜索
- 支持按偏好标签过滤（如"历史文化"、"美食"、"自然风光"）
- 错误处理：API 不可用时返回有意义的降级信息

## 技术方案
- `src/services/attraction-service.ts` — 封装外部 API 调用
- `src/tools/attractions.ts` — Agent Tool 定义（TypeBox schema）
- 环境变量：`GOOGLE_MAPS_API_KEY` 或 `TRIPADVISOR_API_KEY`

## 验收标准
- [ ] `search_attractions` 工具可通过 Agent 调用
- [ ] 返回至少包含 name/address/location/description 的结构化数据
- [ ] Vitest 单元测试覆盖
- [ ] API 调用失败时有 graceful degradation
