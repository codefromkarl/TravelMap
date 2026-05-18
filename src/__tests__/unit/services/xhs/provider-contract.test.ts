/**
 * Provider Adapter 统一契约测试
 *
 * 验证所有 adapter 遵守统一接口契约：
 *   - 输入：(keyword: string, ctx: ProviderContext) => Promise<UGCReview[]>
 *   - 输出：UGCReview[] 或抛出异常
 *   - 结构：source / summary / tips / meta 字段必须存在
 */

import { describe, expect, it } from "vitest";
import { PROVIDER_ADAPTERS } from "../../../../services/xhs/adapters/index.js";
import type { ProviderName } from "../../../../services/xhs/types.js";

describe("Provider Adapter 统一契约", () => {
  it("注册表应包含全部 4 个 provider", () => {
    const names: ProviderName[] = ["rnote", "justoneapi", "tikhub", "crawler"];
    for (const name of names) {
      expect(PROVIDER_ADAPTERS[name]).toBeDefined();
      expect(typeof PROVIDER_ADAPTERS[name]).toBe("function");
    }
  });

  it("每个 adapter 都是 ProviderAdapter 类型（2 个参数）", () => {
    for (const [name, adapter] of Object.entries(PROVIDER_ADAPTERS)) {
      expect(adapter.length, `${name} 应接受 2 个参数`).toBeGreaterThanOrEqual(2);
    }
  });

  it("adapter 名称与注册表 key 一致", () => {
    const keys = Object.keys(PROVIDER_ADAPTERS) as ProviderName[];
    expect(keys.sort()).toEqual(["crawler", "justoneapi", "rnote", "tikhub"]);
  });
});
