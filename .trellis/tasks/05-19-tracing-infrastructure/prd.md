# 追踪基础设施（Trace + Logger + Error Context）

## 背景

当前系统 debug 定位困难：
- 无 Trace ID，一次 Agent 请求触发的多层级调用无法关联
- 65+ 个裸 `console.*` 调用，格式不统一，无级别控制
- 错误信息缺少上下文（不记录请求参数、调用链）

## 目标

建立轻量追踪基础设施，覆盖 Node.js 主进程 + Cloudflare Workers 双环境。

## 设计决策（已确认）

1. **Trace 传递**：双轨制 — Node.js 用 AsyncLocalStorage，Workers 用显式 context
2. **日志库**：自研轻量 logger（零新增依赖）
3. **日志格式**：开发 pretty-print，生产 JSON
4. **错误增强**：扩展现有 Error 类，增加 context 字段
5. **迁移策略**：渐进式，3 批次

## 任务

### 核心基础设施

- [ ] `src/services/logger.ts` — 自研 logger（level/JSON/pretty/child/redact）
- [ ] `src/services/trace-context.ts` — TraceContext + AsyncLocalStorage + 显式 fallback
- [ ] `src/services/error-utils.ts` — 错误增强辅助函数 `withContext()`

### 批次 1 迁移（核心链路）

- [ ] `src/services/http-client.ts` — console.warn → logger.warn，请求携带 traceId
- [ ] `src/agent/travel-agent.ts` — console.warn → logger.warn，planTrip 注入 traceId

### Workers 兼容

- [ ] `web/functions/_lib/logger.js` — 简化版 logger（显式 context）

### 测试

- [ ] `src/__tests__/unit/services/logger.test.ts`
- [ ] `src/__tests__/unit/services/trace-context.test.ts`

## 验收标准

- [ ] 所有测试通过
- [ ] lint + typecheck 通过
- [ ] `http-client.ts` 和 `travel-agent.ts` 不再使用裸 `console.*`
- [ ] logger 支持开发 pretty / 生产 JSON 切换
