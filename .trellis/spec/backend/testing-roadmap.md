# Testing Roadmap

> 测试框架后续迭代计划。按优先级排列，随项目开发逐步推进。

---

## 现状 (2025-05-18)

| 指标 | 值 |
|------|-----|
| 测试总数 | 55 |
| 通过率 | 100% |
| 服务层覆盖率 | 94.79% |
| 工具层覆盖率 | 76.87% |
| Agent 层覆盖率 | 60.52% |

---

## Phase 1: 跟随开发同步补充（持续进行）

**触发条件**: 每次新增/修改 service、tool、agent 代码时

- [ ] 新增 service → 补 `unit/services/` 测试 + `mocks/handlers.ts` 补 mock
- [ ] 新增 tool → 补 `unit/tools/` 测试，覆盖 execute 正常/异常路径
- [ ] 新增类型 → 补 `mocks/fixtures.ts` 工厂函数
- [ ] agent prompt 变更 → 更新 `unit/agent/prompts.test.ts`
- [ ] 目标：新增代码覆盖率 ≥ 80%

---

## Phase 2: Agent 集成测试深化

**触发条件**: 工具 execute 全部实现完成后

- [ ] 补充完整的多工具编排测试（景点→天气→酒店→行程编排的完整调用链）
- [ ] 测试 Agent steer / followUp 多轮对话场景
- [ ] 测试 Agent abort 中断场景
- [ ] 测试错误传播（工具失败后 Agent 的降级行为）
- [ ] 目标：agent 层覆盖率 ≥ 80%

---

## Phase 3: 真实 LLM E2E 评估

**触发条件**: Agent 核心流程稳定后

- [ ] 搭建 LLM-as-Judge 评估器（接入真实 LLM API 打分）
- [ ] 建立评估数据集（10-20 条 golden examples）
- [ ] 评估维度：行程合理性、景点安排逻辑、预算准确性、响应格式合规
- [ ] 评估结果写入报告，跟踪版本间质量变化
- [ ] 集成到 CI（可选，按需手动触发）

---

## Phase 4: CI 集成 & 质量门禁

**触发条件**: Phase 1-2 基本完成后

- [ ] `npm test` 加入 CI pipeline
- [ ] vitest.config.ts 中覆盖率阈值从 0 改为实际目标值
- [ ] `npm run check` 作为 PR 合并前置条件
- [ ] lint-staged 加入测试文件检查

---

## 迭代指引

- 每个_phase_不要求一次性完成，按开发节奏逐步推进
- Phase 1 是日常纪律，Phase 2-4 是里程碑
- 此文档随项目演进持续更新
