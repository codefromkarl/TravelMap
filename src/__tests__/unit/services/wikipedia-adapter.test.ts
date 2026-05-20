/**
 * Wikipedia Adapter 单元测试
 *
 * Mock Wikipedia API，验证 geosearch + keyword search 两条路径。
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { searchWikipedia } from "../../../services/free-sources/wikipedia-adapter.js";
import { server } from "../../mocks/server.js";

describe("searchWikipedia", () => {
  it("有坐标时走 geosearch + extracts 路径", async () => {
    const results = await searchWikipedia({
      city: "北京",
      cityLocation: { latitude: 39.9042, longitude: 116.4074 },
    });

    expect(results.length).toBeGreaterThan(0);

    const gugong = results.find((r) => r.nameZh === "故宫");
    expect(gugong).toBeDefined();
    expect(gugong!.source).toBe("wikipedia");
    expect(gugong!.description).toContain("皇家宫殿");
    expect(gugong!.description!.length).toBeLessThanOrEqual(300);
  });

  it("无坐标时走 keyword search 路径", async () => {
    const results = await searchWikipedia({ city: "北京" });

    // 至少 keyword search 能返回结果
    expect(results.length).toBeGreaterThan(0);

    const yiheyuan = results.find((r) => r.nameZh === "颐和园");
    expect(yiheyuan).toBeDefined();
    expect(yiheyuan!.description).toContain("皇家园林");
  });

  it("description 截断到 300 字", async () => {
    const longDesc = "这是一个非常长的描述。".repeat(100);
    server.use(
      http.get("https://zh.wikipedia.org/w/api.php", ({ request }) => {
        const url = new URL(request.url);
        const list = url.searchParams.get("list");
        if (list === "geosearch") {
          return HttpResponse.json({
            query: {
              geosearch: [{ pageid: 99, title: "长描述景点", lat: 39.9, lon: 116.4, dist: 100 }],
            },
          });
        }
        return HttpResponse.json({
          query: {
            pages: {
              "99": { pageid: 99, title: "长描述景点", extract: longDesc },
            },
          },
        });
      }),
    );

    const results = await searchWikipedia({
      city: "北京",
      cityLocation: { latitude: 39.9, longitude: 116.4 },
    });

    const longItem = results.find((r) => r.nameZh === "长描述景点");
    expect(longItem).toBeDefined();
    expect(longItem!.description!.length).toBeLessThanOrEqual(300);
  });

  it("API 返回空时返回空数组", async () => {
    server.use(
      http.get("https://zh.wikipedia.org/w/api.php", () => HttpResponse.json({ query: {} })),
    );

    const results = await searchWikipedia({
      city: "不存在的城市xyz",
      cityLocation: { latitude: 0, longitude: 0 },
    });
    expect(results).toEqual([]);
  });

  it("两个策略的结果合并去重", async () => {
    // geosearch 和 keyword search 都返回"故宫"，应去重
    server.use(
      http.get("https://zh.wikipedia.org/w/api.php", ({ request }) => {
        const url = new URL(request.url);
        const list = url.searchParams.get("list");

        if (list === "geosearch") {
          return HttpResponse.json({
            query: {
              geosearch: [{ pageid: 1, title: "故宫", lat: 39.9163, lon: 116.3972, dist: 500 }],
            },
          });
        }
        if (list === "search") {
          return HttpResponse.json({
            query: { search: [{ pageid: 1, title: "故宫" }] },
          });
        }
        // extracts
        return HttpResponse.json({
          query: {
            pages: {
              "1": { pageid: 1, title: "故宫", extract: "明清皇家宫殿" },
            },
          },
        });
      }),
    );

    const results = await searchWikipedia({
      city: "北京",
      cityLocation: { latitude: 39.9042, longitude: 116.4074 },
    });

    const gugongCount = results.filter((r) => r.nameZh === "故宫").length;
    expect(gugongCount).toBe(1);
  });

  it("API 500 错误时返回空数组不抛异常", async () => {
    server.use(
      http.get("https://zh.wikipedia.org/w/api.php", () => new HttpResponse(null, { status: 500 })),
    );

    const results = await searchWikipedia({ city: "北京" });
    expect(results).toEqual([]);
  });
});
