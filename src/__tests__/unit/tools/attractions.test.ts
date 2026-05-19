/**
 * search_attractions Tool 单元测试
 */

import { describe, expect, it, vi } from "vitest";
import { searchAttractionsTool } from "../../../tools/attractions.js";

vi.mock("../../../services/multi-source-service.js", () => ({
  searchAttractionsMultiSource: vi.fn(),
}));

import { searchAttractionsMultiSource } from "../../../services/multi-source-service.js";

const mockedSearch = vi.mocked(searchAttractionsMultiSource);

describe("search_attractions tool", () => {
  it("应定义正确的 name 和 label", () => {
    expect(searchAttractionsTool.name).toBe("search_attractions");
    expect(searchAttractionsTool.label).toBe("景点搜索");
  });

  it("costTier 应为 cheap", () => {
    expect(searchAttractionsTool.costTier).toBe("cheap");
  });

  it("正常执行应返回景点列表", async () => {
    mockedSearch.mockResolvedValue({
      attractions: [
        {
          nameZh: "西湖",
          nameEn: "West Lake",
          name: "西湖",
          address: "杭州市西湖区",
          ticketPrice: 0,
          visitDuration: 180,
          description: "杭州著名景点",
          reservationRequired: false,
          reservationTips: "",
          ugcReviews: [],
          sources: ["mock"],
          category: "attraction",
          location: { latitude: 30.25, longitude: 120.15 },
        },
      ],
      sources: ["mock"],
      fromCache: false,
    });

    const result = await searchAttractionsTool.execute("tc_1", { city: "杭州" });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("杭州景点搜索结果");
    expect(text).toContain("西湖");
    expect(text).toContain("West Lake");
    expect(text).toContain("杭州市西湖区");
    expect(result.details.city).toBe("杭州");
    expect(result.details.attractions.length).toBe(1);
  });

  it("缓存数据应标注缓存标记", async () => {
    mockedSearch.mockResolvedValue({
      attractions: [
        {
          nameZh: "故宫",
          nameEn: "Forbidden City",
          name: "故宫",
          address: "北京市东城区",
          ticketPrice: 60,
          visitDuration: 240,
          description: "明清皇宫",
          reservationRequired: false,
          reservationTips: "",
          ugcReviews: [],
          sources: ["mock"],
          category: "attraction",
          location: { latitude: 39.9, longitude: 116.4 },
        },
      ],
      sources: ["mock"],
      fromCache: true,
    });

    const result = await searchAttractionsTool.execute("tc_1", { city: "北京" });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("📦(缓存)");
    expect(result.details.fromCache).toBe(true);
  });

  it("需预约景点应显示预约提示", async () => {
    mockedSearch.mockResolvedValue({
      attractions: [
        {
          nameZh: "兵马俑",
          nameEn: "Terracotta Army",
          name: "兵马俑",
          address: "西安市临潼区",
          ticketPrice: 120,
          visitDuration: 180,
          description: "世界第八大奇迹",
          reservationRequired: true,
          reservationTips: "提前3天在官方小程序预约",
          ugcReviews: [],
          sources: ["mock"],
          category: "attraction",
          location: { latitude: 34.4, longitude: 109.3 },
        },
      ],
      sources: ["mock"],
      fromCache: false,
    });

    const result = await searchAttractionsTool.execute("tc_1", { city: "西安" });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("需预约");
    expect(text).toContain("提前3天在官方小程序预约");
  });

  it("有 UGC 评价时应显示评价内容", async () => {
    mockedSearch.mockResolvedValue({
      attractions: [
        {
          nameZh: "长城",
          nameEn: "Great Wall",
          name: "长城",
          address: "北京市延庆区",
          ticketPrice: 40,
          visitDuration: 300,
          description: "万里长城",
          reservationRequired: false,
          reservationTips: "",
          ugcReviews: [
            {
              source: "xhs",
              summary: "非常壮观，建议早上去",
              rating: 5,
              tips: "避开节假日人流",
            },
          ],
          sources: ["mock", "xhs"],
          category: "attraction",
          location: { latitude: 40.4, longitude: 116.6 },
        },
      ],
      sources: ["mock", "xhs"],
      fromCache: false,
    });

    const result = await searchAttractionsTool.execute("tc_1", { city: "北京" });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("xhs");
    expect(text).toContain("非常壮观，建议早上去");
    expect(text).toContain("避开节假日人流");
  });

  it("错误时应返回降级提示", async () => {
    mockedSearch.mockRejectedValue(new Error("服务异常"));

    const result = await searchAttractionsTool.execute("tc_1", { city: "未知城市" });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("景点搜索遇到问题");
    expect(text).toContain("服务异常");
    expect(result.details.error).toBe("服务异常");
  });

  it("应传递 preferences 和 keywords 参数", async () => {
    mockedSearch.mockResolvedValue({
      attractions: [],
      sources: ["mock"],
      fromCache: false,
    });

    await searchAttractionsTool.execute("tc_1", {
      city: "杭州",
      preferences: ["历史文化", "美食"],
      keywords: "西湖",
    });

    expect(mockedSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        city: "杭州",
        preferences: ["历史文化", "美食"],
        keywords: "西湖",
      }),
    );
  });
});
