# Debug 效率提升：前端测试覆盖 + 日志 + 数据溯源

## Goal

当前 debug 效率低，根因是四个维度的基础设施缺失：前端按钮测试覆盖率低、按钮可点击性未验证、日志记录稀疏、数据链无法溯源。本次任务补齐这些基础设施，使 future debug 可以快速定位问题。

## What I already know

### 前端按钮测试覆盖（现状 ~28%）
- `index.html` 中约 43 个可交互元素
- 12 个有点击行为测试，5 个仅 DOM 存在性测试，~26 个完全无测试
- 关键缺口：导出系列（MD/PDF/图片/链接/二维码）只有 disabled 状态检查，无启用后点击测试
- TTS、海报、语音伴游、移动端切换按钮完全无测试
- 关闭按钮（`btn-close-travelers`, `btn-close-history` 等）无测试

### 按钮可点击性
- 无测试验证按钮是否被遮挡
- 无测试验证 `disabled-ghost` 移除后事件是否绑定
- `btn-voice-input` 的 `display:none` 切换逻辑无测试

### 日志记录（后端）
- `src/services/logger.ts` 完整实现（structured, child, redact, level）
- `src/services/trace-context.ts` 完整实现（traceId, spanId, parentSpanId）
- 但实际调用点仅 5 处：travel-agent.ts(2), review-agent.ts(1), http-client.ts(2)
- 关键路径无日志：tool 调用、LLM 请求、搜索编排、后处理 pipeline

### 日志记录（前端）
- `web/functions/_lib/logger.js` 仅用于 Cloudflare Workers
- `web/modules/*.js` 全部是裸 `console.log/error`，无结构化日志

### 数据溯源
- `createChildSpan()` 已实现但 0 处调用
- SearchOrchestrator 记录 `sources[]` 但不关联 traceId
- CostTracker 记录 token/cost 但不关联 traceId
- 前端→后端无 traceId 传递
- 前端无 session/conversation ID

## Assumptions (temporary)

- 后端日志优先级高于前端（后端更难 debug）
- 测试补全覆盖率目标 80%+
- 数据溯源链改造不在本次范围内

## Open Questions

- MVP 范围：四个维度全做还是分优先级？
- 测试策略：Playwright 还是 vitest mock？
- 日志输出目标：stdout/file/远程上报？

## Requirements (evolving)

### A. 前端按钮测试 — Playwright E2E
- 覆盖 ~26 个无测试按钮
- 每个按钮验证：DOM 存在 + 点击不报错 + 正确效果（面板打开/关闭等）
- 含状态转换测试：disabled→enabled（如生成行程后导出按钮启用）
- 需要 mock agent 响应来触发状态变化

### B. 按钮可点击性验证
- 补 1 个遍历测试，验证无遮挡 + 事件绑定

### C. 后端结构化日志
- 在关键路径补 getLogger() 调用
- 日志级别策略：
  - 用户请求入口（planTrip）→ `info`
  - Tool 调用（输入/输出摘要）→ `debug`
  - LLM 请求（model/prompt/token）→ `info`
  - 搜索编排（provider 结果/耗时）→ `debug`
  - 后处理 pipeline（每步）→ `debug`
  - 错误和重试 → `warn/error`（已有）
- 默认 LOG_LEVEL：生产 info，开发 debug
- ❌ D. 数据溯源链 — out of scope（留到下一阶段）

## Acceptance Criteria (evolving)

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | ~26 个无测试按钮均有 Playwright 点击测试 | 测试文件存在且通过 |
| 2 | 每个按钮测试验证：DOM 存在 + 点击不报错 + 正确效果 | 测试断言覆盖 |
| 3 | 导出系列按钮有 disabled→enabled 状态转换测试 | mock agent 后验证按钮启用 |
| 4 | 1 个按钮可点击性遍历测试（无遮挡 + 事件绑定） | 测试存在且通过 |
| 5 | 后端关键路径（入口/tool/LLM/搜索/后处理）有 getLogger 调用 | grep 验证调用点数量 |
| 6 | 日志级别符合策略（入口+LLM=info, tool+搜索+后处理=debug） | 代码 review |
| 7 | 所有新测试通过，lint/typecheck 绿 | CI 通过 |

## Definition of Done

* 测试覆盖率 ≥ 80%（前端按钮点击测试）
* lint / typecheck / CI 绿
* 后端关键路径有结构化日志 + traceId
* 文档/笔记更新

## Out of Scope (explicit)

- ❌ 数据溯源链改造（createChildSpan 实际使用、前端→后端 traceId 传递、API 层改造）
- ❌ 前端结构化日志系统（当前用 console 即可，后续再统一）
- ❌ 远程日志上报

## Technical Notes

### 相关文件
- `web/index.html` — 所有前端按钮定义
- `web/__tests__/interaction.spec.ts` — 现有交互测试
- `web/__tests__/page-startup.spec.ts` — 启动测试
- `src/services/logger.ts` — 后端日志实现
- `src/services/trace-context.ts` — 追踪上下文
- `src/services/cost-tracker.ts` — 费用追踪
- `src/services/search-orchestrator.ts` — 搜索编排（记录 sources）
- `src/agent/travel-agent.ts` — 主 agent（仅 2 处日志）
- `web/modules/chat-init.js` — 前端初始化（裸 console）
- `web/functions/_lib/logger.js` — CF Workers 日志

### Playwright 配置
- `playwright.config.ts` 已配置 desktop + mobile projects
- testDir: `web/__tests__`
- 已有 interaction.spec.ts 模式可复用
