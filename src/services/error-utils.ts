/**
 * 错误增强工具 — 为 Error 附加上下文，便于 debug 追踪
 */

export interface ErrorContext {
  /** 当前操作 */
  operation?: string;
  /** 请求参数 */
  params?: Record<string, unknown>;
  /** 外部服务名 */
  service?: string;
  /** API 端点 */
  endpoint?: string;
  /** 请求城市 */
  city?: string;
  /** 其他上下文 */
  [key: string]: unknown;
}

/**
 * 为现有 Error 附加上下文（不丢失原始调用栈）
 *
 * 用法:
 *   try {
 *     await fetchGooglePlaces(city);
 *   } catch (err) {
 *     throw withContext(err, { operation: "search_attractions", city, service: "google_places" });
 *   }
 */
export function withContext(err: unknown, ctx: ErrorContext): Error {
  if (err instanceof Error) {
    // 保留原始消息和调用栈，追加上下文
    const ctxStr = JSON.stringify(ctx);
    err.message = `${err.message} [ctx: ${ctxStr}]`;
    (err as Error & { context?: ErrorContext }).context = ctx;
    return err;
  }
  return new Error(String(err), { cause: ctx });
}

/**
 * 创建带上下文的 ApiError（用于 service 层统一抛出）
 */
export function createServiceError(
  message: string,
  ctx: ErrorContext,
  options?: { status?: number; cause?: unknown },
): Error {
  const err = new Error(message, { cause: options?.cause });
  (err as Error & { context?: ErrorContext; status?: number }).context = ctx;
  if (options?.status !== undefined) {
    (err as Error & { status?: number }).status = options.status;
  }
  return err;
}
