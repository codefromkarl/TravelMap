# 编排契约测试 — 景点→天气→酒店→预算四步链路

## 背景
当前集成测试只验证了 Agent 事件流和 partial-edit 端到端，但缺少"完整旅行规划编排"测试。核心业务流程是：

用户输入 → Agent 调用 attractions → 调用 weather → 调用 hotels → 计算 budget → 返回 TripPlan

这个链路中，任何一个 service 返回的数据格式与下游期望不匹配，都会导致静默失败或异常。例如：
- weather-service 返回的 `city` 字段大小写与 trip-plan 不一致
- attractions 返回的 `location` 缺少 `latitude`/`longitude`
- budget 计算依赖的字段在 hotel/service 中命名不同

## 目标
添加一个集成/编排契约测试，验证从用户输入到完整 TripPlan 的核心数据流，不验证具体值，只验证结构完整性和字段存在性。

## 验收标准
- [ ] 新增编排契约测试文件（如 `src/__tests__/integration/orchestration-contract.test.ts`）
- [ ] 测试覆盖： cities → days → attractions → weatherInfo → budget 的结构完整性
- [ ] 使用 MSW 统一 mock 所有外部 API
- [ ] 使用 fixtures 工厂构建输入
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
