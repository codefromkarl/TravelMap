/**
 * concurrentMap — 单元测试
 */

import { describe, expect, it } from "vitest";
import { concurrentMap } from "../../../utils/concurrent.js";

describe("concurrentMap", () => {
  it("应保持结果顺序", async () => {
    const items = [3, 1, 2];
    const results = await concurrentMap(items, async (item) => item * 2);
    expect(results).toEqual([6, 2, 4]);
  });

  it("应限制并发数", async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);
    await concurrentMap(
      items,
      async (item) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        currentConcurrent--;
        return item;
      },
      3,
    );

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it("空列表应返回空数组", async () => {
    const results = await concurrentMap([], async (item) => item);
    expect(results).toEqual([]);
  });

  it("单项列表应正常执行", async () => {
    const results = await concurrentMap([42], async (item) => item + 1);
    expect(results).toEqual([43]);
  });
});
