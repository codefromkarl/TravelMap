/**
 * search_weather Tool — MSW 深度测试
 *
 * 不 mock service，让 tool→service→HTTP 完整链路通过 MSW mock HTTP 跑通。
 * 验证 tool 能正确格式化 service 返回的真实解析数据。
 */

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { searchWeatherTool } from "../../../tools/weather.js";
import { createEnvStub } from "../../helpers/env.js";
import { server } from "../../mocks/server.js";

const env = createEnvStub();

describe("search_weather tool (MSW 深度)", () => {
  it("应通过 OWM API 获取天气并格式化输出", async () => {
    env.set("OPENWEATHER_API_KEY", "test-key");
    env.unset("QWEATHER_API_KEY");
    env.unset("AMAP_WEB_KEY");

    const result = await searchWeatherTool.execute("tc-1", { city: "TestCity" });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("天气预报");
    expect(result.details.weather).toBeDefined();
    expect(result.details.weather.length).toBeGreaterThan(0);
    // 验证 service 解析了 MSW 返回的 OWM 数据
    expect(result.details.source).toBe("openweathermap");
  });

  it("应通过和风天气 API 获取天气", async () => {
    env.set("QWEATHER_API_KEY", "test-key");
    env.unset("OPENWEATHER_API_KEY");
    env.unset("AMAP_WEB_KEY");

    const result = await searchWeatherTool.execute("tc-2", { city: "北京" });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("天气预报");
    expect(result.details.weather.length).toBeGreaterThan(0);
    expect(result.details.source).toBe("qweather");
  });

  it("API 无 key 时应降级到 mock 并仍返回格式化结果", async () => {
    env.unset("OPENWEATHER_API_KEY");
    env.unset("QWEATHER_API_KEY");
    env.unset("AMAP_WEB_KEY");

    const result = await searchWeatherTool.execute("tc-3", { city: "北京" });
    const text = (result.content[0] as { text: string }).text;

    // tool 应能正常处理 service 的 mock 降级数据
    expect(text).toContain("天气预报");
    expect(result.details.source).toBe("mock");
  });

  it("service HTTP 错误时应降级", async () => {
    env.set("OPENWEATHER_API_KEY", "test-key");
    env.unset("QWEATHER_API_KEY");
    env.unset("AMAP_WEB_KEY");

    // 让 OWM 返回 500 错误 → service 降级到 mock
    server.use(
      http.get("https://api.openweathermap.org/data/2.5/forecast", () => {
        return HttpResponse.json({ cod: "500", message: "Internal error" }, { status: 500 });
      }),
    );

    const result = await searchWeatherTool.execute("tc-4", { city: "北京" });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("天气预报");
    // service 降级到 mock
    expect(result.details.source).toBe("mock");
  });
});
