# 测试系统架构深化：5 项推进计划

## Goal

基于架构分析，识别出测试系统的 5 个 deepening opportunity，按依赖关系和影响面排序，逐步推进。

## Candidates（按执行顺序）

### C1. 测试分层策略文档（基础设施）

**优先级**: P0 — 后续所有任务的前置条件
**状态**: ✅ 已完成
**Files**: `.trellis/spec/backend/testing-strategy.md`（新建）
**Problem**: 新开发者/AI session 不知道何时用 `vi.mock` vs MSW vs 真实调用，unit/integration/e2e 边界模糊，前端测试无规范。
**Solution**: 创建测试策略文档，覆盖：
  - Mock 路由规则：service 层用 MSW mock HTTP，tool 层用 `vi.mock(service)` mock 接口
  - 分层标准：unit（单模块+MSW）、integration（跨模块+mock LLM）、e2e（Playwright）
  - 前端测试规范：jsdom 环境、localStorage mock、模块测试模板
  - 新模块测试 checklist
**Acceptance**: 文档创建完成，被 `testing-roadmap.md` 引用

---

### C2. MSW handlers 按域拆分

**优先级**: P1 — C5 的前置条件
**状态**: ✅ 已完成
**Files**: `src/__tests__/mocks/handlers.ts` → `src/__tests__/mocks/handlers/` 目录
**Problem**: 597 行、28 个 handler 挤在一个文件。新增 API 需手动追加，无命名空间隔离。
**Solution**:
  - 按 domain 拆分：`handlers/weather.ts`、`handlers/attractions.ts`、`handlers/xhs.ts`、`handlers/transport.ts`、`handlers/images.ts`、`handlers/index.ts`（barrel re-export）
  - 每个子文件导出 handler 数组，`index.ts` 汇总
  - 保持 `server.ts` 不变（import from `./handlers/index.js`）
**Acceptance**:
  - `handlers.ts` 拆为 6+ 子文件
  - 所有测试通过
  - `quality-guard.test.ts` 的 API 覆盖检查仍通过

---

### C3. Fixtures 工厂推广使用

**优先级**: P2 — 与 C2 并行
**状态**: ✅ 已完成（6 个 tool 测试改用工厂 + fixtures 增强）
**Files**: `src/__tests__/mocks/fixtures.ts` + `src/__tests__/unit/tools/*.test.ts`（6 个文件）
**Problem**: `createCityScenario()`/`createMultiCityScenario()` 精心设计但 0 处使用。大部分工具测试手动构造 mock 数据，类型结构变更需 grep 全部测试文件。
**Solution**:
  1. 迁移已有 tool 测试使用 `createMock*` 工厂（手动构造 → 工厂 + overrides）
  2. quality-guard 增加检查：新测试文件应使用工厂
  3. 补充缺失的工厂函数（如 `createMockToolResult`）
**Acceptance**:
  - 15 个 tool 测试中至少 10 个改用工厂
  - quality-guard 检查工厂使用率
  - 所有测试通过

---

### C4. 工具层测试：从 shallow mock → MSW 深度 mock

**优先级**: P3 — 依赖 C2 完成
**状态**: ✅ 已完成（5 个 tool 新增 MSW deep 测试，16 个用例）
**Files**: `src/__tests__/unit/tools/*-deep.test.ts`（5 个新文件）
**Problem**: 每个 tool 测试用 `vi.mock()` 完全 mock 掉底层 service，只测了"格式化字符串"。service 的降级/重试/融合逻辑在 tool 测试中不可见，tool 和 service 测的是两件不相干的事。
**Solution**:
  - 为 5 个 tool 创建 MSW deep 测试文件（weather/attractions/transport/hotels/restaurants）
  - tool→service→HTTP 完整调用链在单测中跑通
  - 验证降级、空结果、API 错误等场景
**Acceptance**:
  - 5 个 tool 新增 MSW deep 测试（16 个用例）
  - tool 测试能捕获 service 层降级逻辑的回归
  - 所有测试通过

---

### C5. 前端测试基础设施 + 核心模块覆盖

**优先级**: P4 — 依赖 C1（策略文档）
**状态**: ✅ 已完成（30 新增测试）
**Files**: `web/modules/{logger,perf-trace,trace}.js` → `web/modules/__tests__/`
**Problem**: 前端 27 个模块仅 6 个有测试（22%），新增的 `logger.js`、`perf-trace.js`、`trace.js`、`waterfall.js` 完全无测试。前端无 MSW 层、无 fixtures 工厂、无 env helper。
**Solution**:
  1. 建立前端测试基础设施：
     - `web/__tests__/setup.js`（jsdom 环境 + fetch mock）
     - `web/__tests__/helpers/`（localStorage mock、DOM fixtures）
  2. 优先覆盖纯逻辑模块（ROI 最高）：
     - `trace.js` — traceId/sessionId 生成、header 管理
     - `logger.js` — 结构化日志、环形缓冲区、级别控制
     - `perf-trace.js` — span CRUD、瀑布图数据生成
  3. `waterfall.js` 暂缓（DOM 依赖重，需 jsdom + 组件测试框架）
**Acceptance**:
  - 3 个模块有完整测试（trace、logger、perf-trace）
  - 前端测试基础设施文件创建
  - 所有测试通过

---

## Execution Order

```
C1 (策略文档) ──┬── C2 (MSW 拆分) ──→ C4 (tool 层深度化)
                ├── C3 (fixtures 推广) ──→ (与 C4 互补)
                └── C5 (前端测试) ──→ 后续前端覆盖扩展
```

- C1 先行（P0），C2/C3/C5 可并行（P1/P2/P4）
- C4 依赖 C2 完成

## Definition of Done

- [ ] C1: 测试策略文档创建并被 testing-roadmap.md 引用
- [ ] C2: MSW handlers 按域拆分，所有测试通过
- [ ] C3: 10+ tool 测试改用 fixtures 工厂
- [ ] C4: 5+ tool 测试从 vi.mock 迁移到 MSW
- [ ] C5: 前端 trace/logger/perf-trace 有测试覆盖
- [ ] 全量测试通过（1258+）
- [ ] testing-roadmap.md 更新 Phase 状态

## Out of Scope

- ❌ Playwright E2E 测试扩展
- ❌ Mutation testing 集成
- ❌ CI pipeline 配置
- ❌ 覆盖率阈值提升（后续 Phase 6）
