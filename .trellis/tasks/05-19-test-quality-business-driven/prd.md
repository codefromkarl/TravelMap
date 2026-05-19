# 测试质量优化：从覆盖率导向转向业务需求导向

## 背景

当前测试体系覆盖率数字好看（大部分 service/tool 75%-100%），但存在大量"为覆盖而覆盖"的测试：
- `travel-agent.test.ts` 5 个 `.not.toThrow()`，零业务断言
- `restaurants.test.ts`（tool 层）只验证 schema，不测试 execute
- `budget-service.test.ts` 遗漏 `travelers` 人群画像核心参数
- 路线风险评估、UGC 提取等复杂逻辑测试充分，但 Agent 编排层测试几乎空白

## 目标

将测试策略从"追求覆盖率数字"转向"验证用户场景正确性"。

## 优先级任务

### P0 — 补全核心业务逻辑测试（影响用户决策）

| 模块 | 当前问题 | 业务风险 | 验收标准 |
|-----|---------|---------|---------|
| `travel-agent.ts` | 行覆盖 30.4%，prompt 构建/多轮对话/流式处理无测试 | LLM 输出质量不可控 | 覆盖 planTrip() 主流程、handlePreferenceDig()、steer()、多轮对话编排 |
| `budget-service.ts` | `travelers` 参数零测试 | 家庭/老人/儿童预算计算错误 | 验证老人半价、儿童半价、婴幼儿免费、酒店按房间数计算 |

### P1 — 替换/补强"伪测试"

| 模块 | 当前问题 | 改进方向 |
|-----|---------|---------|
| `restaurants.test.ts`（tool） | 只验证 name/label/schema | 添加 execute 行为测试：mock 降级、参数传递、结果格式 |
| 纯 `.not.toThrow()` 断言 | quality-guard 已标记 5 处 | 替换为值断言或删除无意义测试 |

### P2 — 增强鲁棒性测试

| 场景 | 当前状态 | 改进方向 |
|-----|---------|---------|
| LLM 输出解析 | `trip-plan-parser.test.ts` 存在但需审计 | 覆盖格式变异、部分缺失、乱码恢复 |
| 多轮对话上下文 | 无测试 | 验证会话状态在工具调用间正确传递 |
| Prompt 质量回归 | 无测试 | 添加结构化断言：prompt 必须包含城市名、日期、预算等关键字段 |

### P3 — 测试基础设施优化

1. **质量守卫增强**：quality-guard.test.ts 增加 "业务断言密度检查" —— 每个测试文件必须至少有一个验证业务结果的断言（非纯结构/非纯 not.toThrow）
2. **AI Evaluator 落地**：evaluators.test.ts 当前是框架骨架，接入真实评估数据集
3. **覆盖率阈值调整**：将 `travel-agent.ts` 从豁免列表移除，强制覆盖

## 不纳入范围

- 已有高质量测试的模块（route-service、restaurant-service、search-orchestrator 等）—— 保持现状
- E2E 测试扩展 —— 独立任务跟踪
- 性能测试 —— 独立任务跟踪

## 依赖

- 子任务：`05-18-test-travel-agent`（P0 travel-agent.ts 测试补全）
- 子任务：`05-18-coverage-thresholds`（P1 覆盖率阈值提升）

## 验收标准

- [ ] travel-agent.ts 行覆盖 ≥ 70%，且包含至少 3 个业务场景测试（非纯 not.toThrow）
- [ ] budget-service.test.ts 包含 travelers 人群画像测试
- [ ] quality-guard 新增 "业务断言密度检查" 并通过
- [ ] 所有 `.not.toThrow()` 唯一断言被替换或删除
- [ ] 测试运行全部通过：`npm run test:unit && npm run test:integration`
