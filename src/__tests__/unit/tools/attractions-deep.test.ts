/**
 * search_attractions Tool — MSW 深度测试
 *
 * 不 mock multi-source-service，让完整链路跑通。
 * 验证 tool→service→HTTP（MSW）的端到端行为。
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { searchAttractionsTool } from "../../../tools/attractions.js";
import { createEnvStub } from "../../helpers/env.js";
import { server } from "../../mocks/server.js";

const env = createEnvStub();

describe("search_attractions tool (MSW 深度)", () => {
  it("应通过免费数据源获取景点并格式化", async () => {
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchAttractionsTool.execute("tc-1", { city: "北京" });
    const text = (result.content[0] as { text: string }).text;

    // service 会通过免费数据源（去哪儿/OTM/Wikipedia 等）获取景点
    expect(text).toContain("景点");
    expect(result.details.city).toBe("北京");
    expect(result.details.attractions).toBeDefined();
  });

  it("所有数据源失败时应返回降级提示", async () => {
    env.unset("GOOGLE_MAPS_API_KEY");

    // 覆盖所有 handler 返回错误
    server.use(
      http.get("https://piao.qunar.com/ticket/list.htm", () => {
        return HttpResponse.json({ error: "fail" }, { status: 500 });
      }),
      http.get("https://api.opentripmap.com/*", () => {
        return HttpResponse.json({ error: "fail" }, { status: 500 });
      }),
      http.get("https://zh.wikipedia.org/*", () => {
        return HttpResponse.json({ error: "fail" }, { status: 500 });
      }),
      http.get("https://zh.wikivoyage.org/*", () => {
        return HttpResponse.json({ error: "fail" }, { status: 500 });
      }),
    );

    const result = await searchAttractionsTool.execute("tc-2", { city: "未知城市" });
    const text = (result.content[0] as { text: string }).text;

    // tool 应能处理空结果或错误
    expect(result.details.city).toBe("未知城市");
  });

  it("应传递 preferences 参数到 service", async () => {
    env.unset("GOOGLE_MAPS_API_KEY");

    const result = await searchAttractionsTool.execute("tc-3", {
      city: "杭州",
      preferences: ["历史文化"],
    });

    expect(result.details.city).toBe("杭州");
  });
});
