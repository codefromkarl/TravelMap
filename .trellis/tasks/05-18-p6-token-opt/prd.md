# P6: Token 消耗优化

## 目标
全方位减少 LLM 调用次数与 Token 消耗，降低单次旅行规划的成本。

## 当前消耗分析

| 阶段 | LLM 调用次数 | 模型 | 典型 Token |
|------|-------------|------|-----------|
| System Prompt 注入 | 每轮 1 次 | 全部 | ~2000 input/turn |
| 搜索景点 | 1 次决策 + 1 次继续 | gpt-4o-mini | ~500 in + ~200 out |
| 查询天气 | 1 次决策 + 1 次继续 | gpt-4o-mini | ~500 in + ~200 out |
| 酒店搜索 | 1 次决策 + 1 次继续 | gpt-4o-mini | ~500 in + ~200 out |
| 行程编排 | 1 次 | claude-sonnet-4 | ~3000 in + ~4000 out |
| 预算计算 | 1 次决策 + 1 次继续 | claude-sonnet-4 | ~500 in + ~100 out |
| 行动链接 | 1 次决策 + 1 次继续 | claude-sonnet-4 | ~500 in + ~200 out |
| 最终输出 | 1 次 | claude-sonnet-4 | ~500 in + ~3000 out |
| **合计** | **~14 次调用** | | **~3000 in + ~10000 out** |

## 优化策略

### P0a: 搜索工具预编排（并行直接调用）
将 search_attractions / weather / hotels 从"LLM 逐个决策"改为"入参时直接并行调用"，省掉 ~6-8 次 LLM 调用。

### P0b: 确定性计算移出 LLM
budget / action_links 完全是确定性计算，直接在代码层调用 service，省掉 ~2-4 次 LLM 调用。

### P1a: 分阶段精简 System Prompt
不同阶段使用不同的精简 prompt，大幅降低每轮的 input tokens。

### P1b: 工具 schema 按需注入
当前阶段只注入相关工具 schema，减少 input tokens。

## 验收标准
- [ ] P0a: 搜索工具预编排 → 搜索阶段仅 1 轮 LLM 调用
- [ ] P0b: budget/links 后处理 → 编排后自动计算，无额外 LLM 调用
- [ ] P1a: 分阶段 prompt → 搜索阶段 prompt < 500 tokens
- [ ] P1b: 按需注入 schema → 搜索阶段只带搜索工具 schema
- [ ] 规划阶段总 LLM 调用 ≤ 5 次（原 ~14 次）
- [ ] 搜索阶段总 LLM 调用 ≤ 2 次（原 ~6 次）
- [ ] `npm run check` 全部通过