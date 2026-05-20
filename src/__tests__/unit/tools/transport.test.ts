/**
 * transport tool 单元测试
 */

import { describe, expect, it, vi } from "vitest";

import { searchIntercityTransportTool } from "../../../tools/transport.js";
import { createMockTransportOption } from "../../mocks/fixtures.js";

// Mock transport-service
vi.mock("../../../services/transport-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../services/transport-service.js")>();
  return {
    searchIntercityTransport: vi.fn(),
    clearTransportCache: vi.fn(),
    formatTransportPrice: actual.formatTransportPrice,
  };
});

import { searchIntercityTransport } from "../../../services/transport-service.js";

const mockedSearch = vi.mocked(searchIntercityTransport);

describe("searchIntercityTransportTool", () => {
  it("应返回格式化的交通方案", async () => {
    mockedSearch.mockResolvedValue([
      createMockTransportOption({
        type: "train" as const,
        code: "G7590",
        departureTime: "08:30",
        arrivalTime: "09:30",
        durationMinutes: 60,
        price: 73.5,
        departureStation: "杭州东站",
        arrivalStation: "上海虹桥站",
        seatType: "二等座",
        source: "amap",
      }),
    ]);

    const result = await searchIntercityTransportTool.execute("tc-1", {
      originCity: "杭州",
      destCity: "上海",
      date: "2026-05-20",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("杭州 → 上海");
    expect(text).toContain("G7590");
    expect(text).toContain("73.5");

    const details = result.details as { originCity: string; destCity: string; options: unknown[] };
    expect(details.originCity).toBe("杭州");
    expect(details.destCity).toBe("上海");
    expect(details.options.length).toBe(1);
  });

  it("无结果时应返回提示信息", async () => {
    mockedSearch.mockResolvedValue([]);

    const result = await searchIntercityTransportTool.execute("tc-2", {
      originCity: "空城市",
      destCity: "上海",
      date: "2026-05-20",
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("未找到");
    const details = result.details as { options: unknown[] };
    expect(details.options).toHaveLength(0);
  });

  it("transportType 默认应为 all", async () => {
    mockedSearch.mockResolvedValue([]);

    await searchIntercityTransportTool.execute("tc-3", {
      originCity: "杭州",
      destCity: "上海",
      date: "2026-05-20",
    });

    expect(mockedSearch).toHaveBeenCalledWith(expect.objectContaining({ transportType: "all" }));
  });

  it("应传递 transportType 参数", async () => {
    mockedSearch.mockResolvedValue([]);

    await searchIntercityTransportTool.execute("tc-4", {
      originCity: "杭州",
      destCity: "上海",
      date: "2026-05-20",
      transportType: "train",
    });

    expect(mockedSearch).toHaveBeenCalledWith(expect.objectContaining({ transportType: "train" }));
  });

  it("搜索异常时应返回错误信息", async () => {
    mockedSearch.mockRejectedValueOnce(new Error("API 不可用"));

    const result = await searchIntercityTransportTool.execute("tc-5", {
      originCity: "杭州",
      destCity: "上海",
      date: "2026-05-20",
    });

    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("查询失败");
    expect(text).toContain("API 不可用");
  });

  it("应具有正确的元数据", () => {
    expect(searchIntercityTransportTool.name).toBe("search_intercity_transport");
    expect(searchIntercityTransportTool.costTier).toBe("cheap");
    expect(searchIntercityTransportTool.label).toBe("城际交通查询");
  });
});
