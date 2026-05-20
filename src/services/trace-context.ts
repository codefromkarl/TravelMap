/**
 * Trace Context — 分布式追踪上下文
 *
 * 双轨制设计:
 *   - Node.js 环境: 使用 AsyncLocalStorage 隐式传递
 *   - Cloudflare Workers / 无 ALS 环境: 显式参数传递（通过 options.traceContext）
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { getLogger } from "./logger.js";

export interface TraceContext {
  /** 全局唯一追踪 ID */
  traceId: string;
  /** 当前 span ID */
  spanId: string;
  /** 父 span ID */
  parentSpanId?: string;
  /** 当前操作名 */
  operation: string;
  /** 用户 ID */
  userId?: string;
  /** 当前城市 */
  city?: string;
  /** span 开始时间（自动设置） */
  _startTime?: number;
}

const asyncStorage = new AsyncLocalStorage<TraceContext>();

/** 生成 traceId: trace_<时间戳>_<随机串> */
export function generateTraceId(): string {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 生成 spanId */
export function generateSpanId(): string {
  return `span_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 在 trace context 下执行异步函数
 *
 * 自动记录 span 耗时并输出到结构化日志。
 *
 * 用法:
 *   const result = await runWithTrace(
 *     { traceId: generateTraceId(), spanId: generateSpanId(), operation: "planTrip" },
 *     () => travelAgent.planTrip(request)
 *   );
 */
export function runWithTrace<T>(ctx: TraceContext, fn: () => Promise<T>): Promise<T> {
  const spanLogger = getLogger().child({
    component: "trace",
    spanId: ctx.spanId,
    operation: ctx.operation,
  });
  const startTime = Date.now();
  ctx._startTime = startTime;

  spanLogger.debug("span 开始", {
    traceId: ctx.traceId,
    parentSpanId: ctx.parentSpanId,
  });

  return asyncStorage.run(ctx, async () => {
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      spanLogger.info("span 完成", {
        traceId: ctx.traceId,
        duration,
        status: "completed",
      });
      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      spanLogger.error("span 失败", {
        traceId: ctx.traceId,
        duration,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });
}

/** 获取当前 trace context（Node.js AsyncLocalStorage） */
export function getTrace(): TraceContext | undefined {
  return asyncStorage.getStore();
}

/**
 * 创建子 span context
 *
 * 用法:
 *   const childCtx = createChildSpan("search_attractions");
 *   const result = await runWithTrace(childCtx, () => tool.execute(...));
 */
export function createChildSpan(operation: string, base?: Partial<TraceContext>): TraceContext {
  const parent = getTrace();
  const traceId = parent?.traceId ?? base?.traceId ?? generateTraceId();
  return {
    traceId,
    spanId: generateSpanId(),
    parentSpanId: parent?.spanId ?? base?.parentSpanId,
    operation,
    userId: parent?.userId ?? base?.userId,
    city: parent?.city ?? base?.city,
  };
}
