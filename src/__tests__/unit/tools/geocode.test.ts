/**
 * geocode Tool 单元测试
 */

import { describe, expect, it, vi } from "vitest";
import { geocodeTool } from "../../../tools/geocode.js";

// Mock dual-map-service
vi.mock("../../../services/dual-map-service.js", () => ({
  dualGeocode: vi.fn(),
}));

import { dualGeocode } from "../../../services/dual-map-service.js";

const mockedDualGeocode = vi.mocked(dualGeocode);

describe("geocode tool", () => {
  it("应定义正确的 name 和 label", () => {
    expect(geocodeTool.name).toBe("geocode");
    expect(geocodeTool.label).toBe("地理编码");
  });

  it("costTier 应为 cheap", () => {
    expect(geocodeTool.costTier).toBe("cheap");
  });

  it("正常执行应返回坐标和引擎信息", async () => {
    mockedDualGeocode.mockResolvedValue({
      location: { latitude: 39.9163, longitude: 116.3972 },
      engine: "amap",
    });

    const result = await geocodeTool.execute("tc_1", { address: "故宫", city: "北京" });

    expect((result.content[0] as { text: string }).text).toContain("故宫");
    expect((result.content[0] as { text: string }).text).toContain("北京");
    expect((result.content[0] as { text: string }).text).toContain("39.9163");
    expect((result.content[0] as { text: string }).text).toContain("116.3972");
    expect((result.content[0] as { text: string }).text).toContain("amap");

    expect(result.details).toBeDefined();
    expect(result.details.location.latitude).toBe(39.9163);
    expect(result.details.location.longitude).toBe(116.3972);
    expect(result.details.engine).toBe("amap");
  });

  it("有 warning 时应在文本中包含警告", async () => {
    mockedDualGeocode.mockResolvedValue({
      location: { latitude: 39.9, longitude: 116.4 },
      engine: "google",
      warning: "使用默认坐标",
    });

    const result = await geocodeTool.execute("tc_1", { address: "某地址", city: "某市" });

    expect((result.content[0] as { text: string }).text).toContain("⚠️");
    expect((result.content[0] as { text: string }).text).toContain("使用默认坐标");
    expect(result.details.warning).toBe("使用默认坐标");
  });

  it("错误时应返回降级提示文本", async () => {
    mockedDualGeocode.mockRejectedValue(new Error("服务不可用"));

    const result = await geocodeTool.execute("tc_1", { address: "错误地址", city: "错误市" });

    expect((result.content[0] as { text: string }).text).toContain("地理编码失败");
    expect((result.content[0] as { text: string }).text).toContain("错误地址");
    expect((result.content[0] as { text: string }).text).toContain("服务不可用");
    expect(result.details.error).toBe("服务不可用");
  });

  it("details 应包含 address 和 city", async () => {
    mockedDualGeocode.mockResolvedValue({
      location: { latitude: 30, longitude: 120 },
      engine: "amap",
    });

    const result = await geocodeTool.execute("tc_1", { address: "西湖", city: "杭州" });

    expect(result.details.address).toBe("西湖");
    expect(result.details.city).toBe("杭州");
  });
});
