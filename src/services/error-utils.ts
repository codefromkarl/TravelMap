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
 * 增强版 Error — 附加上下文并通过 cause 链保留原始错误
 *
 * 不修改原始 Error，而是创建新实例并通过 cause 链接。
 * 这样多层 catch 不会导致消息膨胀或上下文覆盖。
 */
export class ContextualError extends Error {
  readonly context: ErrorContext;
  readonly originalMessage: string;

  constructor(message: string, ctx: ErrorContext, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "ContextualError";
    this.context = ctx;
    this.originalMessage = message;
  }

  /** 格式化为带上下文的可读字符串 */
  format(): string {
    return `${this.originalMessage} [ctx: ${JSON.stringify(this.context)}]`;
  }
}

/**
 * 为现有 Error 附加上下文（创建新 Error，不修改原始）
 *
 * 用法:
 *   try {
 *     await fetchGooglePlaces(city);
 *   } catch (err) {
 *     throw withContext(err, { operation: "search_attractions", city, service: "google_places" });
 *   }
 */
export function withContext(err: unknown, ctx: ErrorContext): ContextualError {
  const originalMessage = err instanceof Error ? err.message : String(err);
  return new ContextualError(originalMessage, ctx, { cause: err });
}

/**
 * 创建带上下文的 ApiError（用于 service 层统一抛出）
 *
 * 返回 ContextualError 而非原地修改 Error。
 */
export function createServiceError(
  message: string,
  ctx: ErrorContext,
  options?: { status?: number; cause?: unknown },
): ContextualError {
  const err = new ContextualError(message, ctx, { cause: options?.cause });
  if (options?.status !== undefined) {
    (err as ContextualError & { status?: number }).status = options.status;
  }
  return err;
}
