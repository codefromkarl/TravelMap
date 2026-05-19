/**
 * 通用并发工具 — 限制并行度的批量异步处理
 */

/**
 * 并发映射 — 限制并行度执行异步函数
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
