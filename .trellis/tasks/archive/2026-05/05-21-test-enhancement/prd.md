# 测试体系增强：Agent E2E 执行追踪与可视化

## 背景

分析了 [app-test-control](https://github.com/dj931567261/app-test-control) 项目的测试实践，发现以下可吸收的改进点。

**关键发现**：当前 `golden-e2e.test.ts` 直接调用 LLM（`chatCompletion()`），**没有经过 TravelAgent**，无法验证 Agent 的多步骤执行（工具调用、编排、后处理、审查）。

---

## P0：Agent E2E 执行追踪（替代原 P0 HTML 报告）

### 目标
让 `golden-e2e.test.ts` 真正测试 TravelAgent 的多步骤执行，追踪工具调用、token 消耗、审查结果。

### 需求
1. **Agent 执行追踪**
   - 使用真实的 `TravelAgent` 而非 `chatCompletion()`
   - 追踪工具调用序列（名称、参数、结果、耗时）
   - 追踪 token 消耗（通过 costTracker）
   - 追踪审查结果（ReviewAgent）
   - 追踪 steer() 修复记录

2. **结构化输出**
   - 输出 JSON 到 `eval-results/agent-{timestamp}.json`
   - 包含：工具调用序列、token 消耗、审查结果、最终 TripPlan

3. **工具调用验证**
   - 验证 `expectedTools`（当前是死代码）
   - 检查工具调用是否符合预期

### 验收标准
- [x] `golden-e2e.test.ts` 使用 `TravelAgent` 而非 `chatCompletion()`（新建 `agent-e2e.test.ts`）
- [x] 输出结构化 JSON（工具调用序列、token 消耗、审查结果）
- [x] `expectedTools` 被真正验证
- [ ] 所有 golden 场景通过（需要真实 API Key）

---

## P1：Agent E2E HTML 报告（替代原 P1 Impact Testing）

### 目标
为 Agent E2E 测试生成交互式 HTML 报告，可视化多步骤执行过程。

### 需求
1. **HTML 报告生成**
   - 单文件 HTML，内嵌 CSS/JS
   - 可视化工具调用时间线
   - 展示 token 消耗和成本
   - 展示审查结果（error/warning/info）
   - 展示 steer() 修复记录
   - 输出到 `eval-results/reports/`

2. **本地看板服务**
   - `npm run eval:sessions` 启动本地网页服务
   - 浏览、过滤、对比所有历史 Agent E2E 结果

### 验收标准
- [x] `npm run test:ai-e2e` 自动生成 HTML 报告（`npm run test:ai-e2e:report`）
- [x] `npm run eval:sessions` 可浏览历史报告
- [x] 报告包含：工具调用时间线、token 消耗、审查结果

---

## P2：Golden Dataset 扩展（替代原 P1 Failure Signature）

### 目标
扩展黄金数据集，覆盖更多场景和边界情况。

### 需求
1. **新场景**
   - 多城市行程（上海→杭州→苏州）
   - 长途行程（7天+）
   - 预算约束（经济型/豪华型）
   - 特殊需求（老人、儿童、孕妇）
   - 边界情况（模糊输入、不存在的城市）

2. **场景管理**
   - 场景文件独立管理（`golden-examples.ts`）
   - 支持按类别筛选运行

### 验收标准
- [x] 黄金数据集扩展到 15+ 场景（当前 15 个）
- [x] 覆盖多城市、预算约束、特殊需求
- [ ] 所有场景通过（需要真实 API Key）

---

## P3：Impact Testing（降级）

### 目标
CI PR 阶段只跑受影响的测试。

### 需求
1. **智能测试选择**
   - 读 `git diff` 分析变更文件
   - 映射到对应 test 文件

2. **CI 集成**
   - PR 阶段：`npm run test:impact` 只跑受影响测试
   - main push：跑全量测试

### 验收标准
- [x] `npm run test:impact` 根据 git diff 选择测试文件
- [ ] CI PR 阶段使用 test:impact 加速（需要 CI 配置）

---

## P3：Delta-Debug / 状态图 / PRD 对齐（长期）

### 目标
长期改进，不紧急。

### 需求
- Delta-Debug：精简复现路径（需要 Agent 有多步骤执行）
- 状态图探索：自动遍历页面功能（需要 Playwright 集成）
- PRD 对齐：读 PRD 自动生成测试用例（需要 PRD 结构化）

---

## 实施计划

| 阶段 | 任务 | 工作量 | 依赖 |
|---|---|---|---|
| Phase 1 | P0 Agent E2E 执行追踪 | 2 天 | 无 |
| Phase 2 | P1 HTML 报告 + 看板 | 2 天 | Phase 1 |
| Phase 3 | P2 Golden Dataset 扩展 | 1 天 | Phase 1 |
| Phase 4 | P3 Impact Testing | 1 天 | 无 |

---

## 参考

- [app-test-control 仓库](https://github.com/dj931567261/app-test-control)
- [已有 PRD：AI E2E 测试基础设施](.trellis/tasks/archive/05-19-ai-e2e-testing-infra/prd.md)
