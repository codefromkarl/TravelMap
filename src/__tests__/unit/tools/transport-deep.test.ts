/**
 * search_transport Tool — MSW 深度测试
 *
 * 不 mock transport-service，让 tool→service→amap API 完整链路跑通。
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { searchIntercityTransportTool } from "../../../tools/transport.js";
import { createEnvStub } from "../../helpers/env.js";
import { server } from "../../mocks/server.js";

const env = createEnvStub();

describe("search_transport tool (MSW 深度)", () => {
  it("应通过高德 API 获取交通方案并格式化", async () => {
    env.set("AMAP_WEB_KEY", "test-key");

    const result = await searchIntercityTransportTool.execute("tc-1", {
      originCity: "杭州",
      destCity: "上海",
      date: "2026-06-01",
    });
    const text = (result.content[0] as { text: string }).text;

    // MSW handler 返回了杭州→上海的高铁方案
    expect(text).toContain("杭州");
    expect(text).toContain("上海");
    expect(result.details.options).toBeDefined();
  });

  it("高德 API 返回空方案时应降级", async () => {
    env.set("AMAP_WEB_KEY", "test-key");

    server.use(
      http.get("https://restapi.amap.com/v3/direction/transit/integrated", () => {
        return HttpResponse.json({
          status: "1",
          route: { transits: [] },
        });
      }),
    );

    const result = await searchIntercityTransportTool.execute("tc-2", {
      originCity: "北京",
      destCity: "拉萨",
      date: "2026-06-01",
    });
    const text = (result.content[0] as { text: string }).text;

    // 空结果应被正常处理
    expect(result.details).toBeDefined();
  });

  it("无 API key 时仍应返回结果（降级）", async () => {
    env.unset("AMAP_WEB_KEY");

    const result = await searchIntercityTransportTool.execute("tc-3", {
      originCity: "杭州",
      destCity: "上海",
      date: "2026-06-01",
    });

    // service 在无 key 时有降级逻辑
    expect(result.content).toBeDefined();
  });
});
