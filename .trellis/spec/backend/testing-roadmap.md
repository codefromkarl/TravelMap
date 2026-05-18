# Testing Roadmap

> 测试框架后续迭代计划。按优先级排列，随项目开发逐步推进。

---

## 现状 (2025-05-18)

| 指标 | 值 |
|------|-----|
| Vitest 测试总数 | 141 |
| Playwright E2E 测试 | 50 (desktop + mobile) |
| 通过率 | 100% |
| 质量守卫测试 | 17 (源文件覆盖/Mock覆盖/Fixtures/命名规范) |

### 测试分层

```
src/__tests__/
├── unit/              # 单元测试 (不依赖外部服务)
│   ├── services/      # attraction, budget, geocode, weather, partial-edit, dual-map, multi-source
│   ├── tools/         # 所有 tool 的 execute + 参数验证
│   └── agent/         # TravelAgent 构造/事件 + prompts 内容
├── integration/       # 集成测试 (跨模块调用链)
│   ├── agent-integration.test.ts       # Mock LLM + Agent 事件流
│   └── partial-edit-integration.test.ts # parseTargetDays → applyPartialEdit → calculateBudget
├── evaluation/        # AI 评估框架 (结构化断言)
├── quality/           # 测试质量守卫 (元测试，防偏移)
└── mocks/             # 共享 mock (MSW handlers + fixtures + mock-llm)

web/__tests__/         # Playwright E2E
├── page-load.spec.ts  # 页面结构/CSS/响应式
└── interaction.spec.ts # 用户交互/无障碍/错误恢复
```

---

## Phase 1: 跟随开发同步补充（持续进行）✅

- [x] 所有 service 都有单元测试
- [x] 所有 tool execute 都有测试
- [x] 质量守卫自动检测新增未测试文件
- [x] MSW mock handlers 覆盖所有外部 API
- [ ] 新增 service/tool → 补测试 + 补 mock + 补 fixture

---

## Phase 2: Agent 集成测试深化 ✅

- [x] 局部修改端到端 (parseTargetDays → applyPartialEdit → calculateBudget)
- [x] Mock LLM + Agent 工具调用链
- [x] 多工具并行执行测试
- [ ] 完整编排: 景点→天气→酒店→预算 的四步链路
- [ ] Agent steer/followUp 多轮对话测试
- [ ] Agent abort 中断场景测试

---

## Phase 3: 测试质量守卫 ✅（持续迭代）

### 已实现

- [x] 源文件 → 测试文件映射检查
- [x] Mock handlers API 覆盖检查
- [x] Fixtures 工厂完整性检查
- [x] 测试命名规范检查
- [x] 新文件发现告警（不阻塞）

### Phase 3a: 断言质量检查 ✅ (2025-05-18)

- [x] 检测仅 `.not.toThrow()` 而无实质值断言的测试文件
- [x] 检测 services 中 catch 块缺少错误路径测试
- [x] 断言密度扫描（expect/test 比例）
- [x] 覆盖率阈值 `lines: 30%`（起始阶段）

### Phase 3b: Pre-commit 快速扫描 ✅ (2025-05-18)

- [x] `scripts/test-qa-check.sh` — 3 项反模式检测
- [x] 可在 `.husky/pre-commit` 中启用

### 后续计划

- [ ] 覆盖率阈值逐步提升: 30% → 50% → 70%
- [ ] Mutation testing 集成（stryker-mutator）
- [ ] 新项目成员入职检查清单
- [ ] CI 中 test:qa 作为 blocking gate

---

## Phase 4: E2E 页面测试 ✅

- [x] Playwright 配置 (desktop + mobile projects)
- [x] 页面加载: 标题、header、chat-panel
- [x] CSS 深色主题验证
- [x] 响应式布局 (桌面端 + 移动端)
- [x] localStorage 持久化
- [x] 无障碍 & 键盘导航
- [x] DOM 结构完整性
- [x] 错误恢复 (快速刷新)

---

## Phase 5: 真实 LLM E2E 评估 (下一步)

**触发条件**: Agent 核心流程稳定后

- [ ] 搭建 LLM-as-Judge 评估器
- [ ] 建立评估数据集 (10-20 golden examples)
- [ ] 评估维度: 行程合理性、景点安排、预算准确性
- [ ] 集成到 CI (手动触发)

---

## Phase 6: CI 集成 & 质量门禁

**触发条件**: Phase 1-4 稳定后

- [ ] vitest + playwright 加入 CI pipeline
- [ ] 覆盖率阈值 ≥ 70%
- [ ] `npm run check` 作为 PR 合并前置
- [ ] lint-staged 加入测试文件检查
