# PRD: AI 端到端测试基础设施 + 测试覆盖补齐

## 背景

当前测试系统在传统软件测试层面已非常完善（覆盖率 90%+、62 个后端测试、8 维质量守卫），但 **AI 端到端测试完全缺失**：所有 AI 调用被 Mock 替代，无法验证真实 LLM 的输出质量和完整 Agent 流程。此外，新增的 `free-sources/` 模块（4 个 adapter）缺少测试，导致 quality guard 有 12 个失败项。

## 目标

1. **修好 quality guard**：补齐 `free-sources/` 4 个 adapter 的独立单元测试 + 对应 HTTP Mock
2. **搭建 AI E2E 测试基础设施**：支持真实 LLM 调用的条件执行、评估、CI 集成
3. **构建黄金数据集**：典型旅行规划场景的基准输入/输出

---

## Part A: 修好 Quality Guard（优先级 P0）

### A1. free-sources adapter 独立 Mock 测试

为以下 4 个 adapter 创建独立的 MSW mock 测试文件：

| 源文件 | 新测试文件 |
|--------|-----------|
| `services/free-sources/opentripmap-adapter.ts` | `unit/services/opentripmap-adapter.test.ts` |
| `services/free-sources/qunar-adapter.ts` | `unit/services/qunar-adapter.test.ts` |
| `services/free-sources/wikipedia-adapter.ts` | `unit/services/wikipedia-adapter.test.ts` |
| `services/free-sources/wikivoyage-adapter.ts` | `unit/services/wikivoyage-adapter.test.ts` |

**每个 adapter 测试覆盖**：
- 正常响应解析（mock 典型 API 响应，验证输出字段映射）
- 空结果处理（API 返回空数组/404）
- 错误降级（API 500/超时 → 返回空数组不抛异常）
- 边界输入（特殊字符城市名、缺少参数）

**Mock 策略**：
- 主搜索端点 + 错误场景（如 OTM 的 `/geoname` + `/radius`，qunar 的 HTML 抓取端点）
- 详情端点用通用 200 handler

### A2. quality guard 豁免

将 `free-sources/` 下已被 `free-sources.test.ts` 整体覆盖的子模块加入 `SOURCE_FILES_EXEMPT`：
- `services/free-sources/fusion-engine.ts` — 已在 `free-sources.test.ts` 中直接 import 测试
- `services/free-sources/index.ts` — 已在 `free-sources.test.ts` 中通过 `searchFreeSources` 端到端测试
- `services/free-sources/types.ts` — 纯类型定义

### A3. HTTP Mock 补齐

在 `src/__tests__/mocks/handlers.ts` 中补充 `api.opentripmap.com` 等缺失域名的 mock handler。

### 验收标准

- `npm run test` 全部通过（0 failures）
- `npm run test:unit -- src/__tests__/quality` 全部通过

---

## Part B: AI E2E 测试基础设施（优先级 P1）

### B1. 独立 Vitest 配置 + 条件执行框架

**核心决策**：AI E2E 测试使用独立 vitest 配置，完全绕过 MSW。

创建 `vitest.ai-e2e.config.ts`：
- 不引入 MSW setup（`setupFiles` 为空或用独立的轻量 setup）
- `testTimeout: 60_000`
- `include: ["src/__tests__/e2e/**/*.test.ts"]`

在 `package.json` 添加：
```json
"test:ai-e2e": "AI_E2E=true vitest run --config vitest.ai-e2e.config.ts"
```

创建 `src/__tests__/helpers/ai-e2e.ts`：
```ts
// 条件执行：无 Key 则 skip 整个 suite
export function describeAiE2e(name: string, fn: () => void): void {
  const hasKey = !!(process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY);
  const enabled = process.env.AI_E2E === "true";
  if (!enabled || !hasKey) {
    describe.skip(`[AI E2E] ${name} (skipped: no API key or AI_E2E not set)`, fn);
    return;
  }
  describe(`[AI E2E] ${name}`, fn);
}

// 费用追踪器（soft report，不硬拦截）
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}
export function reportTokenUsage(scenario: string, usage: TokenUsage): void {
  // 写入内存，测试结束后输出 JSON 报告
}
```

**费用控制策略**：
- **硬约束**：`testTimeout: 60_000`（超时强制终止）
- **软约束**：测试结束后解析 stream usage 字段，累计输出 token 消耗报告（JSON 文件）
- **不做**：tiktoken 预估（不值得引入依赖）

**LLM 供应商选择**：
- 自动发现——谁有 Key 就用谁
- pi-ai 的 `getModel(provider, modelId)` 已支持通过 env var 自动配置
- `beforeAll` 中检查可用 Key，无 Key 则 `return this.skip()`

### B2. Agent E2E 测试场景

在 `src/__tests__/e2e/` 下创建测试。**测试层**：`TravelAgent` 编排层（Vitest 进程内，new TravelAgent → prompt → 收集事件 → 验证输出）。

创建 `src/__tests__/e2e/travel-agent-e2e.test.ts`：

**场景 1：单轮行程规划**
```
输入: "帮我规划北京三日游"
断言:
  - Agent 调用了景点+酒店+餐厅相关工具（子集匹配，额外调用不算错）
  - 输出可被 trip-plan-parser 成功解析
  - 输出包含：目的地、日期、景点推荐
  - 费用在合理范围（0 - 50000 元）
```

**场景 2：多轮对话修改**
```
第 1 轮: "帮我规划上海两日游"
第 2 轮: "第一天改成去迪士尼"
断言:
  - 第二轮输出包含"迪士尼"
  - 修改后的行程仍然结构完整
```

**场景 3：模糊输入追问**
```
输入: "我想出去玩"
断言:
  - Agent 应追问更多信息（而非直接规划）
  - 回复中包含提问/引导性语句
```

### B3. LLM-as-Judge 评估器

**Judge 模型选择**：
- 默认 fallback 到与 Agent 同模型
- 支持 env override：`JUDGE_MODEL_PROVIDER` + `JUDGE_MODEL_ID`

**评估维度与验证方式**：

| 维度 | 验证方式 | 通过条件 |
|------|---------|---------|
| 完整性 | 代码断言 | 必含字段（景点名/日期/城市）全部存在 |
| 准确性 | 代码断言 | 调用了正确的工具集（子集匹配） |
| 合理性 | LLM 打分 (1-5) | 记录分数，≥3/5 **不 fail**（soft report） |
| 格式规范 | 代码断言 | 输出可被 trip-plan-parser 成功解析 |

**实现位置**：在 `src/__tests__/evaluation/evaluators.test.ts` 中扩展，接入真实 LLM。

**结果持久化**：
- 格式：JSON，每次运行覆盖
- 路径：`eval-results/run-{timestamp}.json`（gitignored）
- 内容：每个场景的完整 Agent 回复 + Judge 评分 + 结构检查结果
- CI 中作为 artifact 上传

### B4. Playwright AI E2E（低优先级）

- 为真实 AI E2E 添加独立 Playwright 配置 `playwright.ai.config.ts`
- 从主配置的 `testIgnore` 中评估移除 `ai-scenario-generator.spec.ts`
- 仅在 `AI_E2E=true` + 本地 dev server 运行时执行
- 优先级低于 B1-B3，可在后续迭代中完成

---

## Part C: 黄金数据集（优先级 P2）

### C1. 数据集创建流程

1. 手写 `input` + `expectedTools`
2. 跑一次真实 Agent，捕获输出
3. 人工审核输出是否合理
4. 从审核过的输出提取 `expectedStructure`
5. 锁定为 golden，后续只改 `validationFn`

### C2. 基准场景（5 个）

创建 `src/__tests__/e2e/golden-examples.ts`：

```ts
export interface GoldenExample {
  id: string;
  input: string;
  expectedTools: string[];           // 子集匹配——至少包含这些
  expectedStructure: RegExp[];       // 输出必须匹配的正则
  validationFn: (output: string, toolCalls: string[]) => boolean;
}
```

| 场景 | input | expectedTools | expectedStructure 关键点 |
|------|-------|---------------|------------------------|
| 单城市短途游 | "帮我规划北京三日游" | `[search_attractions, search_hotels, search_restaurants]` | 包含景点/酒店/餐厅段落 |
| 多城市跨省游 | "上海到杭州苏州五日游" | `[search_attractions, search_hotels, search_transport]` | 包含交通+多城市 |
| 预算约束 | "成都两日游，预算1000元" | `[search_attractions, search_hotels]` | 提及预算/费用 |
| 亲子游 | "带5岁小孩去广州玩两天" | `[search_attractions, search_restaurants]` | 适合儿童的内容 |
| 美食主题 | "重庆美食之旅三天" | `[search_restaurants, search_attractions]` | 餐饮推荐为主 |

`expectedTools` 验证方式：**子集匹配**——至少包含指定的工具，额外调用（如 geocode/weather）不算错。

---

## 不做（Out of Scope）

- ❌ 不修改现有 Mock 测试的行为
- ❌ 不引入新的测试框架（复用 Vitest + Playwright）
- ❌ 不做自动化回归监控看板（后续任务）
- ❌ 不做 CI nightly pipeline 配置（后续任务）
- ❌ 不做 tiktoken 预估 token 消耗
- ❌ 不做 LLM-as-Judge 趋势对比（需要数据库/dashboard）
- ❌ Playwright AI E2E 优先级低于 Vitest 进程内测试

---

## 实施顺序

```
Phase 1: Part A (P0) → 修好 quality guard，让全量测试通过
Phase 2: Part B1-B2 (P1) → 独立 vitest 配置 + 条件执行框架 + Agent E2E 核心场景
Phase 3: Part B3 (P1) → LLM-as-Judge 评估器 + 结果持久化
Phase 4: Part C (P2) → 黄金数据集（录制 + 审核 + 锁定）
Phase 5: Part B4 (P2) → Playwright AI E2E 启用（低优先级）
```

## 技术约束

- 真实 LLM 调用测试通过 `AI_E2E=true` env 开关控制，默认关闭
- AI E2E 使用独立 vitest 配置，不走 MSW setup
- 硬约束：`testTimeout: 60_000`；软约束：token 消耗报告
- 评估结果文件不进入 git（加入 `.gitignore`）
- `expectedTools` 使用子集匹配，不精确匹配
- LLM-as-Judge 打分作为 soft report，不作为测试 fail 条件

## 决策记录（Grill Me 结论）

| # | 问题 | 决策 |
|---|------|------|
| Q1 | adapter 测试范围 | A：每个 adapter 独立 mock 测试 |
| Q2 | fusion-engine/index 测试 | B：加入 SOURCE_FILES_EXEMPT |
| Q3 | handlers Mock 覆盖深度 | 主搜索端点 + 错误场景 |
| Q4 | E2E 测试层 | A：TravelAgent 编排层（Vitest 进程内） |
| Q5 | 绕过 MSW | A：独立 vitest.ai-e2e.config.ts |
| Q6 | Token 预算控制 | A+B：超时硬约束 + usage 软报告 |
| Q7 | LLM 供应商选择 | A：自动发现 env Key |
| Q8 | Judge 模型 | C：env override，默认同模型 |
| Q9 | 评估维度 | B：结构性 hard assertion + 语义 soft report |
| Q10 | expectedTools 粒度 | B：子集匹配 |
| Q11 | 黄金数据集来源 | C：录制 + 人工审核 + 锁定 |
| Q12 | 结果持久化目的 | A+C：调试查看 + CI artifact |
