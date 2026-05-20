/**
 * search_restaurants Tool — MSW 深度测试
 *
 * 不 mock restaurant-service，让 tool→service→amap API 完整链路跑通。
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { searchRestaurantsTool } from "../../../tools/restaurants.js";
import { createEnvStub } from "../../helpers/env.js";
import { server } from "../../mocks/server.js";

const env = createEnvStub();

describe("search_restaurants tool (MSW 深度)", () => {
  it("应通过高德 API 获取餐厅并格式化", async () => {
    env.set("AMAP_WEB_KEY", "test-key");
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchRestaurantsTool.execute("tc-1", {
      city: "杭州",
      cuisine: "浙江菜",
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("餐厅");
    expect(result.details).toBeDefined();
    expect(result.details.city).toBe("杭州");
  });

  it("高德返回空结果时应正常处理", async () => {
    env.set("AMAP_WEB_KEY", "test-key");
    env.unset("GOOGLE_MAPS_API_KEY");

    server.use(
      http.get("https://restapi.amap.com/v3/place/around", () => {
        return HttpResponse.json({ status: "1", count: "0", pois: [] });
      }),
    );

    const result = await searchRestaurantsTool.execute("tc-2", {
      city: "未知城市",
    });

    expect(result.content).toBeDefined();
    // 空结果时 service 降级
    expect(result.details).toBeDefined();
  });

  it("service 降级时 tool 仍应返回结构化结果", async () => {
    env.unset("AMAP_WEB_KEY");
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchRestaurantsTool.execute("tc-3", {
      city: "北京",
    });

    // 无 key 时 service 有降级
    expect(result.content).toBeDefined();
    expect(result.details.city).toBe("北京");
  });
});
