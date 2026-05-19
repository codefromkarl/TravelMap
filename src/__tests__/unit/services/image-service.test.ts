/**
 * image-service 单元测试
 *
 * 测试景点图片获取的路由逻辑和降级策略
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearImageCache, getAttractionImages } from "../../../services/image-service.js";

// Mock http-client
vi.mock("../../../services/http-client.js", () => ({
  fetchWithTimeout: vi.fn(),
}));

// Mock config
vi.mock("../../../services/config.js", () => ({
  config: {
    unsplashAccessKey: "test-unsplash-key",
    pexelsApiKey: "test-pexels-key",
  },
}));

import { fetchWithTimeout } from "../../../services/http-client.js";

const mockFetch = fetchWithTimeout as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  clearImageCache();
});

describe("getAttractionImages", () => {
  it("应从 Unsplash 返回景点图片", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { urls: { small: "https://unsplash.com/1.jpg" }, alt_description: "西湖风景" },
          { urls: { small: "https://unsplash.com/2.jpg" }, alt_description: "西湖日落" },
        ],
      }),
    });

    const images = await getAttractionImages("西湖", "杭州");

    expect(images).toHaveLength(2);
    expect(images[0]).toEqual({
      url: "https://unsplash.com/1.jpg",
      source: "unsplash",
      alt: "西湖风景",
    });
    expect(images[1]!.source).toBe("unsplash");
  });

  it("Unsplash 失败时应 fallback 到 Pexels", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Unsplash timeout")).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        photos: [{ src: { medium: "https://pexels.com/1.jpg" }, alt: "灵隐寺" }],
      }),
    });

    const images = await getAttractionImages("灵隐寺", "杭州");

    expect(images).toHaveLength(1);
    expect(images[0]!.source).toBe("pexels");
    expect(images[0]!.url).toBe("https://pexels.com/1.jpg");
  });

  it("所有源失败时应返回空数组", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("Unsplash error"))
      .mockRejectedValueOnce(new Error("Pexels error"));

    const images = await getAttractionImages("不存在的景点", "火星");

    expect(images).toEqual([]);
  });

  it("API 返回非 200 时应返回空数组并继续尝试下一个源", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        photos: [{ src: { medium: "https://pexels.com/1.jpg" }, alt: "长城" }],
      }),
    });

    const images = await getAttractionImages("长城", "北京");

    expect(images).toHaveLength(1);
    expect(images[0]!.source).toBe("pexels");
  });

  it("第二次调用相同景点应命中缓存", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ urls: { small: "https://unsplash.com/cached.jpg" }, alt_description: "故宫" }],
      }),
    });

    const first = await getAttractionImages("故宫", "北京");
    const second = await getAttractionImages("故宫", "北京");

    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(mockFetch).toHaveBeenCalledTimes(1); // 只调用了一次 API
  });

  it("返回结果中无有效 URL 时应继续尝试下一个源", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ urls: {} }] }), // 无 small URL
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          photos: [{ src: { medium: "https://pexels.com/valid.jpg" }, alt: "黄山" }],
        }),
      });

    const images = await getAttractionImages("黄山", "安徽");

    expect(images).toHaveLength(1);
    expect(images[0]!.source).toBe("pexels");
  });
});
