/**
 * 并发限制器 — 控制外部 API 请求的并发数量
 *
 * 用于防止单个请求中的并行搜索/丰富操作打爆外部 API 限额。
 * 基于简单的 semaphore 实现，零外部依赖。
 *
 * 用法:
 *   const limiter = createConcurrencyLimiter(5);
 *   const results = await Promise.all(items.map(item => limiter.run(() => fetchItem(item))));
 */

export interface ConcurrencyLimiter {
  /** 在并发限制下执行异步任务 */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** 当前等待队列长度 */
  readonly pending: number;
  /** 当前正在执行的任务数 */
  readonly active: number;
}

/**
 * 创建并发限制器
 *
 * @param concurrency 最大并发数（默认 6，适合大多数外部 API）
 */
export function createConcurrencyLimiter(concurrency = 6): ConcurrencyLimiter {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  function next(): void {
    if (queue.length > 0 && activeCount < concurrency) {
      activeCount++;
      const resolve = queue.shift()!;
      resolve();
    }
  }

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (activeCount >= concurrency) {
        await new Promise<void>((resolve) => queue.push(resolve));
      }

      activeCount++;
      try {
        return await fn();
      } finally {
        activeCount--;
        next();
      }
    },

    get pending() {
      return queue.length;
    },

    get active() {
      return activeCount;
    },
  };
}

/**
 * 并发映射 — 限制并行度执行异步函数（向后兼容）
 *
 * @param items 待处理列表
 * @param fn 异步处理函数
 * @param concurrency 最大并行数（默认 3）
 * @returns 所有结果（保持顺序）
 */
export async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 3,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const queue = items.map((item, index) => ({ item, index }));

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry) break;
      results[entry.index] = await fn(entry.item, entry.index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** 全局默认限制器（用于 supply-enrich、search 等场景） */
let defaultLimiter: ConcurrencyLimiter | null = null;

/** 获取全局默认并发限制器（最大 6 并发） */
export function getDefaultLimiter(): ConcurrencyLimiter {
  if (!defaultLimiter) {
    defaultLimiter = createConcurrencyLimiter(6);
  }
  return defaultLimiter;
}

/** 重置全局限制器（测试用） */
export function resetDefaultLimiter(): void {
  defaultLimiter = null;
}
