# 架构深度机会分析

> 来源：idle-explorer 自动探索（2026-05-23T02:04Z）
> Skill：improve-codebase-architecture
> 词汇表：Module, Interface, Depth, Seam, Adapter, Leverage, Locality

---

## 深度机会清单（按优先级排序）

### P0 — 低成本高收益（Trivial / Low effort）

| # | 机会 | 涉及文件 | 问题 | 杠杆率 |
|---|------|----------|------|--------|
| 1 | **提取 `wrapToolError()` 工具函数** | 所有 15 个 tool 文件 | 错误处理模式在每个 tool 的 `execute` 中重复 8+ 次 | 消除 8x 重复，统一错误格式 |
| 2 | **提取 `geo-utils.ts`** | `hotel-service.ts`, `restaurant-service.ts` | `haversineMeters()` 和 `WALK_SPEED_MPM` 完全重复 | 消除 2x 重复，单点修复 |
| 3 | **删除未使用抽象** | `http-client.ts` (`createApiClient`), `trace-context.ts` | 定义但未使用，增加认知负担 | 减少死代码，降低维护成本 |

### P1 — 中等投入中等收益（Medium effort）

| # | 机会 | 涉及文件 | 问题 | 杠杆率 |
|---|------|----------|------|--------|
| 4 | **提取 `withFallback` 高阶函数** | `hotel-service.ts`, `restaurant-service.ts`, `weather-service.ts` 等 | catch + 降级模式重复 10+ 处 | 统一降级策略，单点修复 |
| 5 | **提取 `createServiceCache` 工厂** | `hotel-service.ts`, `restaurant-service.ts`, `transport-service.ts` | LRUCache 配置、key 生成、clear 函数重复 4+ 处 | 消除缓存配置重复 |
| 6 | **拆分 God Modules（hotel/restaurant/weather/transport）** | `hotel-service.ts` (380行), `restaurant-service.ts` (350行), `weather-service.ts` (290行) | Adapter + 业务逻辑 + 缓存混合在单文件 | 提升可测试性和可维护性 |
| 7 | **集中化 `MapRouter` 路由决策** | `hotel-service.ts`, `restaurant-service.ts`, `transport-service.ts`, `dual-map-service.ts` | `isDomesticCity()` 判断分散在 4 个 service | 消除 4x 路由重复 |
| 8 | **统一错误类型层次** | `error-utils.ts` (`ContextualError`), `http-client.ts` (`NetworkError`/`ApiError`) | 两套平行错误体系无继承关系 | 消除错误处理混乱 |

### P2 — 中等投入高收益（Medium effort, High leverage）

| # | 机会 | 涉及文件 | 问题 | 杠杆率 |
|---|------|----------|------|--------|
| 9 | **拆分 TravelAgent 类** | `travel-agent.ts` (300行) | 中等 God Object：编排 + 后处理 + 对话管理混合 | 降低认知复杂度，提升可测试性 |
| 10 | **修正 Tools ↔ Services 抽象边界** | 所有 tool 文件 | Tools 做 60% 格式化，Services 做逻辑；边界不清晰 | 正确的关注点分离 |
| 11 | **提取共享 `formatResultList()` 工具** | `hotels.ts`, `restaurants.ts`, `attractions.ts`, `transport.ts` | Markdown 列表格式化重复 4+ 处 | 消除格式化重复 |

### P3 — 观察 / 设计决策（High effort / Design decision）

| # | 机会 | 涉及文件 | 问题 | 杠杆率 |
|---|------|----------|------|--------|
| 12 | **评估 companion-service 和 image-recognize 工具必要性** | `companion-service.ts`, `image-recognize.ts` | 关键词匹配逻辑本可由 LLM 原生完成 | 可能简化 Agent 架构 |
| 13 | **依赖注入替代全局单例** | `config.ts`, `logger.ts`, `cost-tracker.ts`, `trace-context.ts` | 全局单例 + reset 模式在测试中易遗漏 | 更好的可测试性（高 effort） |

---

## 候选 Trellis 任务标题

| 任务标题 | 风险 | 预期杠杆 | 证据路径 |
|----------|------|----------|----------|
| 提取 `wrapToolError` 工具函数消除 8x 错误处理重复 | 🟢 低 | 高 | `src/tools/*.ts` catch 块 |
| 提取 `geo-utils.ts` 消除 haversine 重复 | 🟢 低 | 中 | `src/services/hotel-service.ts`, `restaurant-service.ts` |
| 删除未使用的 `createApiClient` 和 `trace-context` | 🟢 低 | 低 | `src/services/http-client.ts`, `trace-context.ts` |
| 提取 `withFallback` 高阶函数统一降级模式 | 🟡 中 | 高 | `src/services/*-service.ts` catch 块 |
| 提取 `createServiceCache` 工厂消除缓存配置重复 | 🟡 中 | 中 | `src/services/hotel-service.ts`, `restaurant-service.ts`, `transport-service.ts` |
| 拆分 weather-service God Module 为独立 Adapter | 🟡 中 | 中 | `src/services/weather-service.ts` (290行) |
| 集中化 `MapRouter` 路由决策消除 4x 路由重复 | 🟡 中 | 中 | `src/services/*-service.ts` 中 `isDomesticCity()` 调用 |
| 统一错误类型层次：ContextualError 与 NetworkError/ApiError | 🟡 中 | 高 | `src/services/error-utils.ts`, `http-client.ts` |
| 拆分 TravelAgent 为 TripOrchestrator + TripFinalizer + ConversationManager | 🔴 高 | 高 | `src/agent/travel-agent.ts` (300行) |
| 修正 Tools ↔ Services 抽象边界：格式化逻辑下沉 | 🟡 中 | 高 | `src/tools/*.ts` 格式化代码 |

---

## 架构词汇检查

- ✅ **Module**: 识别了 15 个 tool + 37 个 service + TravelAgent 作为独立模块
- ✅ **Interface**: 分析了 TypeBox schema（过复杂）、planTrip/steer/finalize（清晰）
- ✅ **Depth**: 评估了模块深度（TravelAgent 深，tts/ai-guide 浅，prompts 浅但合适）
- ✅ **Seam**: 识别了 `{{LANGUAGE_INSTRUCTION}}`、trace context、config proxy 作为 seam
- ✅ **Adapter**: 分析了 HTTP 客户端、日志、配置管理的 adapter 模式；发现 God Module 中 adapter 被埋没
- ✅ **Leverage**: planTrip 高杠杆（一次调用触发完整管道）；createApiClient/trace-context 零杠杆
- ✅ **Locality**: 错误处理、haversine、缓存配置、mock 生成器均违反 Locality
