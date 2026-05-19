# 架构深化 #2: 分解 TravelAgent God Object

## 优先级
⭐⭐⭐ — 高影响，高工作量

## 问题

`TravelAgent` 类（310 行）承担了 8+ 职责：

1. 模型选择（`selectModelForRequest` / L1/L2 分级）
2. 工具注册（`setToolsByPhase`）
3. Prompt 构建（`buildPrompt`）
4. 预搜索编排（`preSearch` 调用）
5. 消息压缩（`maybeCompressHistory`）
6. 后处理调度（`finalize` — 预算+链接+审查+修复循环）
7. 对话控制（`planTrip` / `steer` / `steerDiff` / `followUp`）
8. 费用追踪（`costTracker`）
9. 审查协调（`lastReview` / `reviewer`）

构造函数接收 7 个配置项，暴露 15+ 个方法。接口几乎和实现一样复杂。

## 方案

分步提取子模块：

### Phase 1: PromptBuilder
- 提取 `buildPrompt()` 到独立的 `src/agent/prompt-builder.ts`
- 职责：TripRequest → 完整 prompt 文本
- 包含人群画像格式化、偏好挖掘判断、语言指令注入

### Phase 2: ModelSelector
- 提取 `selectModelForRequest()` 到 `src/agent/model-selector.ts`
- 职责：根据 TripRequest 复杂度返回模型层级（L1/L2）
- 封装 strong/cheap model 实例管理

### Phase 3: FinalizeOrchestrator
- 将 `finalize()` 中的 review + fix 循环下沉到 `ReviewAgent` 或独立的 `FinalizeOrchestrator`
- TravelAgent 的 `finalize()` 变为薄包装

### Phase 4: 简化后的 TravelAgent
- 核心方法缩减为 3 个：`planTrip()` / `steer()` / `finalize()`
- 内部通过子模块委托实现

## 涉及文件

### 新建
- `src/agent/prompt-builder.ts`
- `src/agent/model-selector.ts`

### 修改
- `src/agent/travel-agent.ts` — 大幅简化
- `src/agent/review-agent.ts` — 吸收 review+fix 循环

### 测试更新
- `src/__tests__/unit/agent/travel-agent.test.ts` — 简化
- 新增 `prompt-builder.test.ts` / `model-selector.test.ts`

## 收益

- **Depth**: TravelAgent 接口变窄（3 个核心方法），背后是子模块的深度
- **Locality**: prompt 构建的 bug 只看 PromptBuilder，模型选择的 bug 只看 ModelSelector
- **测试**: 子模块可独立测试，不再需要 mock 整个 Agent

## 验收标准

- [ ] `TravelAgent` 类 < 150 行
- [ ] 核心公开方法 ≤ 5 个
- [ ] `PromptBuilder` 独立可测
- [ ] `ModelSelector` 独立可测
- [ ] 所有现有测试通过
- [ ] 不改变外部 API（planTrip/steer/finalize 签名不变）
