/**
 * definePoiSearcher 测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { definePoiSearcher } from "../../services/poi-searcher.js";

// Mock 依赖
vi.mock("../../services/config.js", () => ({
  config: {
    amapWebKey: undefined as string | undefined,
    googleMapsApiKey: undefined as string | undefined,
  },
}));

vi.mock("../../services/dual-map-service.js", () => ({
  isDomesticCity: vi.fn((city: string) => city === "北京" || city === "上海"),
}));

vi.mock("../../services/logger.js", () => ({
  getLogger: () => ({
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

interface TestPoi {
  name: string;
  source?: string;
}

describe("definePoiSearcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 mock 数据当无 API Key 时", async () => {
    const searcher = definePoiSearcher<{ keyword: string }, TestPoi>({
      name: "test",
      adapters: {
        amap: {
          search: vi.fn().mockResolvedValue([{ name: "amap-result", source: "amap" }]),
          apiKey: () => undefined,
        },
        google: {
          search: vi.fn().mockResolvedValue([{ name: "google-result", source: "google" }]),
          apiKey: () => undefined,
        },
        mock: () => [{ name: "mock-result", source: "mock" }],
      },
      cacheKey: (params) => params.keyword,
    });

    const result = await searcher.search({ keyword: "测试" }, "北京");

    expect(result.source).toBe("mock");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe("mock-result");
    expect(result.warning).toContain("mock");
  });

  it("国内城市应优先使用 amap", async () => {
    const searcher = definePoiSearcher<{ keyword: string }, TestPoi>({
      name: "test",
      adapters: {
        amap: {
          search: vi.fn().mockResolvedValue([{ name: "amap-result", source: "amap" }]),
          apiKey: () => "test-key",
        },
        google: {
          search: vi.fn(),
          apiKey: () => "google-key",
        },
        mock: () => [{ name: "mock-result", source: "mock" }],
      },
      cacheKey: (params) => params.keyword,
    });

    const result = await searcher.search({ keyword: "测试" }, "北京");

    expect(result.source).toBe("amap");
    expect(result.data[0].name).toBe("amap-result");
  });

  it("国外城市应使用 google", async () => {
    const searcher = definePoiSearcher<{ keyword: string }, TestPoi>({
      name: "test",
      adapters: {
        amap: {
          search: vi.fn(),
          apiKey: () => "amap-key",
        },
        google: {
          search: vi.fn().mockResolvedValue([{ name: "google-result", source: "google" }]),
          apiKey: () => "google-key",
        },
        mock: () => [{ name: "mock-result", source: "mock" }],
      },
      cacheKey: (params) => params.keyword,
    });

    const result = await searcher.search({ keyword: "测试" }, "东京");

    expect(result.source).toBe("google");
    expect(result.data[0].name).toBe("google-result");
  });

  it("API 返回空结果时应降级到 mock", async () => {
    const searcher = definePoiSearcher<{ keyword: string }, TestPoi>({
      name: "test",
      adapters: {
        amap: {
          search: vi.fn().mockResolvedValue([]),
          apiKey: () => "test-key",
        },
        google: {
          search: vi.fn(),
          apiKey: () => undefined,
        },
        mock: () => [{ name: "mock-result", source: "mock" }],
      },
      cacheKey: (params) => params.keyword,
    });

    const result = await searcher.search({ keyword: "测试" }, "北京");

    expect(result.source).toBe("mock");
    expect(result.warning).toContain("API 无结果");
  });

  it("API 异常时应降级到 mock", async () => {
    const searcher = definePoiSearcher<{ keyword: string }, TestPoi>({
      name: "test",
      adapters: {
        amap: {
          search: vi.fn().mockRejectedValue(new Error("网络超时")),
          apiKey: () => "test-key",
        },
        google: {
          search: vi.fn(),
          apiKey: () => undefined,
        },
        mock: () => [{ name: "mock-result", source: "mock" }],
      },
      cacheKey: (params) => params.keyword,
    });

    const result = await searcher.search({ keyword: "测试" }, "北京");

    expect(result.source).toBe("mock");
    expect(result.warning).toContain("网络超时");
  });

  it("clearCache 应清除缓存", async () => {
    const amapSearch = vi.fn().mockResolvedValue([{ name: "result", source: "amap" }]);
    const searcher = definePoiSearcher<{ keyword: string }, TestPoi>({
      name: "test",
      adapters: {
        amap: { search: amapSearch, apiKey: () => "key" },
        google: { search: vi.fn(), apiKey: () => undefined },
        mock: () => [],
      },
      cacheKey: (params) => params.keyword,
    });

    // 第一次搜索
    await searcher.search({ keyword: "测试" }, "北京");
    expect(amapSearch).toHaveBeenCalledTimes(1);

    // 第二次搜索（应走缓存）
    await searcher.search({ keyword: "测试" }, "北京");
    expect(amapSearch).toHaveBeenCalledTimes(1);

    // 清除缓存
    searcher.clearCache();

    // 第三次搜索（应重新调用 API）
    await searcher.search({ keyword: "测试" }, "北京");
    expect(amapSearch).toHaveBeenCalledTimes(2);
  });
});
