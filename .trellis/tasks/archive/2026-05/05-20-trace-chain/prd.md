# 数据溯源链：端到端 traceId 传递

## Goal

当前 traceId 仅在后端 `planTrip` 入口创建一次，无法从用户反馈追溯到完整调用链。本次任务实现端到端的 traceId 传递，让用户反馈 bug 时可以提供 traceId，开发者直接查到完整调用链。

## What I already know

### 现有基础设施（已就绪）
- `trace-context.ts`：AsyncLocalStorage 实现 traceId/spanId 传播
- `createChildSpan()`：已实现，已在 `pre-search`、`post-process`、`review` 中使用
- `CostTracker`：已自动关联 traceId
- `logger.ts`：已自动从 TraceContext 获取 traceId 并附加到日志

### 当前断裂点
1. **前端→后端**：API 请求无 traceId 传递
2. **后端→前端**：API 响应无 traceId 返回
3. **session/conversation ID**：前端无会话级 ID
4. **日志聚合**：无法按 traceId 查询完整调用链

### 相关文件
- `web/modules/auth.js` — 前端 API 调用（通过 `/api/chat` 代理）
- `web/functions/api/chat.js` — Cloudflare Workers API handler
- `src/agent/travel-agent.ts` — 后端入口（已有 runWithTrace）
- `src/services/trace-context.ts` — 追踪上下文实现
- `src/services/logger.ts` — 日志系统（已集成 traceId）

## Requirements

### 1a. 前端→后端 traceId 传递
- 前端在每次 API 请求中生成 traceId（或复用已有）
- 通过 HTTP header `x-trace-id` 传递到后端
- 后端 API handler 解析 header 并注入 TraceContext

### 1b. 后端→前端 traceId 返回
- API 响应 header 包含 `x-trace-id`
- 前端提取并存储当前 traceId
- 用户可在 UI 中看到「问题追踪 ID」

### 1c. session/conversation ID
- 前端生成会话 ID（UUID），存储在 localStorage
- 每次请求携带 `x-session-id` header
- 后端日志关联 session ID

### 1d. 日志聚合查询（可选）
- 提供 CLI 或 API 按 traceId 查询日志
- 输出完整调用链：请求→搜索→LLM→后处理

## Acceptance Criteria

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | API 请求 header 包含 `x-trace-id` | 浏览器 Network 面板验证 |
| 2 | API 响应 header 包含 `x-trace-id` | 浏览器 Network 面板验证 |
| 3 | 后端日志关联前端传入的 traceId | grep 日志验证 |
| 4 | 前端 UI 展示「问题追踪 ID」 | 页面截图验证 |
| 5 | session ID 在同一会话内保持一致 | localStorage 验证 |
| 6 | 所有测试通过，lint/typecheck 绿 | CI 通过 |

## Definition of Done

* 前端→后端 traceId 传递正常工作
* 用户可通过 traceId 反馈 bug
* 后端日志可按 traceId 查询完整调用链
* 测试覆盖 + lint/typecheck 绿

## Out of Scope

- ❌ 远程日志存储/查询系统（如 ELK、Sentry）
- ❌ 前端结构化日志系统（下一阶段）
- ❌ 性能监控/APM 集成

## Technical Notes

### 实现方案

**前端**：
```javascript
// 在 fetch 请求中添加 traceId
const traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
headers['x-trace-id'] = traceId;
```

**后端 API handler**：
```javascript
// 从 header 提取 traceId
const traceId = request.headers.get('x-trace-id') || generateTraceId();
// 注入 TraceContext
await runWithTrace({ traceId, spanId: generateSpanId(), operation: 'chat' }, () => handler());
```

**响应 header**：
```javascript
response.headers.set('x-trace-id', traceId);
```
