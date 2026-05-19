import { describe, expect, it } from "vitest";
import type { EnrichedAttraction } from "../../../services/multi-source-service.js";
import { inferVisitDuration } from "../../../services/multi-source-service.js";

/** 构造最小 EnrichedAttraction */
function makeAttraction(
  overrides: Partial<EnrichedAttraction> & { nameZh: string; category: string },
): EnrichedAttraction {
  const { nameZh, category, ...rest } = overrides;
  return {
    name: nameZh,
    nameEn: nameZh,
    address: "测试地址",
    location: { latitude: 0, longitude: 0 },
    visitDuration: 0,
    description: "",
    category,
    ticketPrice: 0,
    reservationRequired: false,
    reservationTips: "",
    ugcReviews: [],
    sources: [],
    ...rest,
    nameZh,
  };
}

describe("inferVisitDuration", () => {
  it("博物馆 → 180min", () => {
    const a = makeAttraction({ nameZh: "故宫博物院", category: "博物馆" });
    expect(inferVisitDuration(a)).toBe(180);
  });

  it("公园 → 90min", () => {
    const a = makeAttraction({ nameZh: "颐和园", category: "公园" });
    expect(inferVisitDuration(a)).toBe(90);
  });

  it("名含'景区'的公园 → 150min(90+60)", () => {
    const a = makeAttraction({ nameZh: "西湖景区", category: "公园" });
    expect(inferVisitDuration(a)).toBe(150);
  });

  it("已有 visitDuration=200 → 保持200", () => {
    const a = makeAttraction({ nameZh: "故宫", category: "博物馆", visitDuration: 200 });
    expect(inferVisitDuration(a)).toBe(200);
  });

  it("未知类别 → 120min（默认）", () => {
    const a = makeAttraction({ nameZh: "某个地方", category: "未知类别" });
    expect(inferVisitDuration(a)).toBe(120);
  });

  it("主题乐园 → 360min（含'乐园'关键词加时为420）", () => {
    const a = makeAttraction({ nameZh: "上海迪士尼乐园", category: "主题乐园" });
    expect(inferVisitDuration(a)).toBe(420);
  });

  it("主题乐园无关键词 → 360min", () => {
    const a = makeAttraction({ nameZh: "欢乐谷", category: "主题乐园" });
    expect(inferVisitDuration(a)).toBe(360);
  });

  it("宗教场所 → 60min", () => {
    const a = makeAttraction({ nameZh: "灵隐寺", category: "宗教场所" });
    expect(inferVisitDuration(a)).toBe(60);
  });

  it("名含'5A'的景点 → 180min(120+60)", () => {
    const a = makeAttraction({ nameZh: "黄山5A景区", category: "景点" });
    expect(inferVisitDuration(a)).toBe(180);
  });

  it("已有 visitDuration>0 时忽略名称关键词加时", () => {
    const a = makeAttraction({ nameZh: "大型景区", category: "公园", visitDuration: 50 });
    expect(inferVisitDuration(a)).toBe(50);
  });

  it("艺术画廊 → 150min", () => {
    const a = makeAttraction({ nameZh: "中国美术馆", category: "艺术画廊" });
    expect(inferVisitDuration(a)).toBe(150);
  });

  it("购物 → 90min", () => {
    const a = makeAttraction({ nameZh: "南京路步行街", category: "购物" });
    expect(inferVisitDuration(a)).toBe(90);
  });

  it("自然风光 → 120min", () => {
    const a = makeAttraction({ nameZh: "九寨沟", category: "自然风光" });
    expect(inferVisitDuration(a)).toBe(120);
  });

  it("名含'国家公园'的自然风光 → 180min(120+60)", () => {
    const a = makeAttraction({ nameZh: "张家界国家公园", category: "自然风光" });
    expect(inferVisitDuration(a)).toBe(180);
  });
});
