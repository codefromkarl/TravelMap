/**
 * search_hotels Tool — MSW 深度测试
 *
 * 不 mock hotel-service，让 tool→service→amap API 完整链路跑通。
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { searchHotelsTool } from "../../../tools/hotels.js";
import { createEnvStub } from "../../helpers/env.js";
import { server } from "../../mocks/server.js";

const env = createEnvStub();

describe("search_hotels tool (MSW 深度)", () => {
  it("应通过高德 API 获取酒店并格式化", async () => {
    env.set("AMAP_WEB_KEY", "test-key");
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchHotelsTool.execute("tc-1", {
      city: "杭州",
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("酒店");
    expect(result.details.hotels).toBeDefined();
  });

  it("高德返回错误时应降级", async () => {
    env.set("AMAP_WEB_KEY", "test-key");
    env.unset("GOOGLE_MAPS_API_KEY");

    server.use(
      http.get("https://restapi.amap.com/v3/place/around", () => {
        return HttpResponse.json({ status: "0", info: "INVALID_USER_KEY" });
      }),
    );

    const result = await searchHotelsTool.execute("tc-2", { city: "北京" });

    // service 有降级逻辑
    expect(result.content).toBeDefined();
  });

  it("无 API key 时应降级到 mock 数据", async () => {
    env.unset("AMAP_WEB_KEY");
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchHotelsTool.execute("tc-3", { city: "北京" });

    expect(result.content).toBeDefined();
  });
});
