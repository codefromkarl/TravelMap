/**
 * route-service 单元测试
 *
 * 覆盖：
 * - 官方路线查询
 * - 小红书路线提取
 * - 路线去重
 * - 路线意图解析
 * - 大型景区识别
 * - 景点路线附加 / 切换
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAvailableAttractionNames,
  getMockRoutes,
  getOfficialRoutes,
} from "../../../services/route-official-data.js";
import {
  clearRouteCache,
  enrichAttractionWithRoutes,
  isComplexAttraction,
  parseRouteEditIntent,
  searchAttractionRoutes,
  switchAttractionRoute,
} from "../../../services/route-service.js";
import type { Attraction } from "../../../types/trip.js";

// Mock dual-map-service 避免真实网络请求
vi.mock("../../../services/dual-map-service.js", () => ({
  dualGeocode: vi.fn(),
  isDomesticCity: vi.fn(() => true),
  resetEngineState: vi.fn(),
}));

import { dualGeocode } from "../../../services/dual-map-service.js";

const mockedDualGeocode = vi.mocked(dualGeocode);

// ─── 官方路线数据 ────────────────────────────────────────

describe("route-official-data", () => {
  it("西湖能匹配多个别名", () => {
    const routes1 = getOfficialRoutes("西湖", "杭州");
    const routes2 = getOfficialRoutes("西湖风景名胜区", "杭州");
    const routes3 = getOfficialRoutes("杭州西湖", "杭州");
    expect(routes1.length).toBeGreaterThan(0);
    expect(routes2.length).toEqual(routes1.length);
    expect(routes3.length).toEqual(routes1.length);
  });

  it("西湖至少有4条官方路线", () => {
    const routes = getOfficialRoutes("西湖", "杭州");
    expect(routes.length).toBeGreaterThanOrEqual(4);
    // 验证路线结构完整
    for (const route of routes) {
      expect(route.id).toBeTruthy();
      expect(route.name).toContain("西湖");
      expect(route.waypoints.length).toBeGreaterThanOrEqual(4);
      expect(route.duration).toBeGreaterThan(0);
      expect(route.source).toBe("official");
    }
  });

  it("故宫有官方路线", () => {
    const routes = getOfficialRoutes("故宫", "北京");
    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes[0].waypoints[0].name).toBe("午门");
  });

  it("故宫博物院也能匹配", () => {
    const routes = getOfficialRoutes("故宫博物院", "北京");
    expect(routes.length).toBeGreaterThanOrEqual(1);
  });

  it("不存在的景区返回空", () => {
    const routes = getOfficialRoutes("不存在的景区", "火星");
    expect(routes).toEqual([]);
  });

  it("可用景区列表包含西湖和故宫", () => {
    const names = getAvailableAttractionNames();
    expect(names).toContain("西湖");
    expect(names).toContain("故宫");
  });

  it("mock 路线为大型景区生成降级数据", () => {
    const routes = getMockRoutes("某某山景区", "某市");
    expect(routes.length).toBe(1);
    expect(routes[0].source).toBe("llm_knowledge");
    expect(routes[0].name).toContain("经典路线");
  });

  it("mock 路线对短名称不生成", () => {
    const routes = getMockRoutes("角", "某市");
    expect(routes).toEqual([]);
  });
});

// ─── 路线搜索（含 mock 降级） ──────────────────────────────

describe("searchAttractionRoutes", () => {
  beforeEach(() => {
    clearRouteCache();
  });

  it("西湖返回官方路线（不依赖外部 API）", async () => {
    const result = await searchAttractionRoutes({
      attractionName: "西湖",
      city: "杭州",
    });
    expect(result.attractionName).toBe("西湖");
    expect(result.routes.length).toBeGreaterThanOrEqual(4);
    expect(result.sources).toContain("official");
    // 验证每条路线都有途经点
    for (const route of result.routes) {
      expect(route.waypoints.length).toBeGreaterThanOrEqual(4);
      expect(route.tags.length).toBeGreaterThan(0);
    }
  });

  it("带偏好筛选返回匹配路线", async () => {
    const result = await searchAttractionRoutes({
      attractionName: "西湖",
      city: "杭州",
      preferences: ["小众"],
    });
    // 应该有匹配"小众"标签的路线
    expect(result.routes.length).toBeGreaterThan(0);
    // 西线深度游应该在小众筛选中
    const hasWestRoute = result.routes.some(
      (r) => r.name.includes("西线") || r.tags.includes("小众"),
    );
    expect(hasWestRoute).toBe(true);
  });

  it("不存在的景区返回 mock 降级", async () => {
    const result = await searchAttractionRoutes({
      attractionName: "某大景区",
      city: "某市",
    });
    expect(result.routes.length).toBe(1);
    expect(result.sources).toContain("mock");
  });

  it("结果会被缓存", async () => {
    const r1 = await searchAttractionRoutes({ attractionName: "西湖", city: "杭州" });
    const r2 = await searchAttractionRoutes({ attractionName: "西湖", city: "杭州" });
    expect(r2.routes).toEqual(r1.routes);
  });
});

// ─── 大型景区识别 ─────────────────────────────────────────

describe("isComplexAttraction", () => {
  it("识别西湖", () => {
    expect(isComplexAttraction("西湖")).toBe(true);
    expect(isComplexAttraction("西湖风景名胜区")).toBe(true);
    expect(isComplexAttraction("杭州西湖")).toBe(true);
  });

  it("识别故宫", () => {
    expect(isComplexAttraction("故宫")).toBe(true);
    expect(isComplexAttraction("故宫博物院")).toBe(true);
  });

  it("识别黄山", () => {
    expect(isComplexAttraction("黄山")).toBe(true);
    expect(isComplexAttraction("黄山风景区")).toBe(true);
  });

  it("普通景点不被识别", () => {
    expect(isComplexAttraction("天安门广场")).toBe(false);
    expect(isComplexAttraction("外滩")).toBe(false);
    expect(isComplexAttraction("某小店")).toBe(false);
  });

  it("名称含'风景区'后缀自动识别", () => {
    expect(isComplexAttraction("某某风景区")).toBe(true);
    expect(isComplexAttraction("某某国家森林公园")).toBe(true);
  });
});

// ─── 路线意图解析 ─────────────────────────────────────────

describe("parseRouteEditIntent", () => {
  it('解析"西湖换成西线"', () => {
    const intent = parseRouteEditIntent("西湖换成西线", ["西湖", "雷峰塔"]);
    expect(intent).not.toBeNull();
    expect(intent!.attractionName).toBe("西湖");
    expect(intent!.preferenceTags).toContain("小众");
  });

  it('解析"西湖走小众路线"', () => {
    const intent = parseRouteEditIntent("西湖走小众路线", ["西湖"]);
    expect(intent).not.toBeNull();
    expect(intent!.preferenceTags).toContain("小众");
  });

  it('解析"西湖亲子游"', () => {
    const intent = parseRouteEditIntent("西湖亲子游", ["西湖"]);
    expect(intent).not.toBeNull();
    expect(intent!.preferenceTags).toContain("亲子");
  });

  it("不匹配不在列表中的景点", () => {
    const intent = parseRouteEditIntent("外滩夜景", ["西湖", "灵隐寺"]);
    expect(intent).toBeNull();
  });

  it("普通景点（非大型景区）且无偏好标签时返回 null", () => {
    const intent = parseRouteEditIntent("天安门广场看一下", ["天安门广场"]);
    expect(intent).toBeNull();
  });
});

// ─── 景点路线附加 ────────────────────────────────────────

describe("enrichAttractionWithRoutes", () => {
  beforeEach(() => {
    clearRouteCache();
  });

  it("大型景区会附加路线", async () => {
    const attraction: Attraction = {
      name: "西湖",
      nameZh: "西湖",
      nameEn: "West Lake",
      address: "杭州市西湖区",
      location: { latitude: 30.24, longitude: 120.15 },
      visitDuration: 120,
      description: "西湖",
      category: "湖泊",
      ticketPrice: 0,
      reservationRequired: false,
      reservationTips: "",
    };

    const enriched = await enrichAttractionWithRoutes(attraction, "杭州");
    expect(enriched.routes).toBeDefined();
    expect(enriched.routes!.length).toBeGreaterThanOrEqual(4);
    expect(enriched.selectedRouteId).toBeTruthy();
  });

  it("非大型景区不附加路线", async () => {
    const attraction: Attraction = {
      name: "外滩",
      nameZh: "外滩",
      nameEn: "The Bund",
      address: "上海市黄浦区",
      location: { latitude: 31.24, longitude: 121.49 },
      visitDuration: 90,
      description: "外滩",
      category: "地标",
      ticketPrice: 0,
      reservationRequired: false,
      reservationTips: "",
    };

    const result = await enrichAttractionWithRoutes(attraction, "上海");
    expect(result.routes).toBeUndefined();
  });

  it("mock 路线的 waypoints 会被地理编码填充", async () => {
    mockedDualGeocode.mockResolvedValue({
      location: { latitude: 30.5555, longitude: 120.5555 },
      engine: "mock",
    });

    // 使用"风景区"后缀确保 isComplexAttraction 返回 true，
    // 同时不在官方路线库中，会降级到 mock 路线
    const attraction: Attraction = {
      name: "某某风景区",
      nameZh: "某某风景区",
      nameEn: "Some Scenic Area",
      address: "某市某区",
      location: { latitude: 30.0, longitude: 120.0 },
      visitDuration: 120,
      description: "某某风景区",
      category: "风景区",
      ticketPrice: 0,
      reservationRequired: false,
      reservationTips: "",
    };

    const enriched = await enrichAttractionWithRoutes(attraction, "某市");
    expect(enriched.routes).toBeDefined();
    expect(enriched.routes!.length).toBeGreaterThan(0);
    expect(mockedDualGeocode).toHaveBeenCalled();

    const route = enriched.routes![0];
    expect(route.waypoints.length).toBeGreaterThan(0);
    for (const wp of route.waypoints) {
      expect(wp.location.latitude).not.toBe(0);
      expect(wp.location.longitude).not.toBe(0);
    }
  });

  it("官方路线不会触发额外的地理编码", async () => {
    mockedDualGeocode.mockClear();

    const attraction: Attraction = {
      name: "西湖",
      nameZh: "西湖",
      nameEn: "West Lake",
      address: "杭州市西湖区",
      location: { latitude: 30.24, longitude: 120.15 },
      visitDuration: 120,
      description: "西湖",
      category: "湖泊",
      ticketPrice: 0,
      reservationRequired: false,
      reservationTips: "",
    };

    const enriched = await enrichAttractionWithRoutes(attraction, "杭州");
    expect(enriched.routes).toBeDefined();
    // 官方路线已有坐标，不应调用 dualGeocode
    expect(mockedDualGeocode).not.toHaveBeenCalled();
  });
});

// ─── 路线切换 ─────────────────────────────────────────────

describe("switchAttractionRoute", () => {
  const attraction: Attraction = {
    name: "西湖",
    nameZh: "西湖",
    nameEn: "West Lake",
    address: "杭州市西湖区",
    location: { latitude: 30.24, longitude: 120.15 },
    visitDuration: 120,
    description: "西湖",
    category: "湖泊",
    ticketPrice: 0,
    reservationRequired: false,
    reservationTips: "",
    routes: [
      {
        id: "route_a",
        name: "路线A",
        description: "经典路线",
        duration: 180,
        waypoints: [],
        tags: ["经典"],
        source: "official",
        difficulty: 1,
      },
      {
        id: "route_b",
        name: "路线B",
        description: "深度游路线",
        duration: 300,
        waypoints: [],
        tags: ["深度"],
        source: "official",
        difficulty: 3,
      },
    ],
    selectedRouteId: "route_a",
  };

  it("切换到存在的路线", () => {
    const updated = switchAttractionRoute(attraction, "route_b");
    expect(updated.selectedRouteId).toBe("route_b");
    expect(updated.visitDuration).toBe(300);
    expect(updated.description).toBe("深度游路线");
  });

  it("切换到不存在的路线返回原景点", () => {
    const updated = switchAttractionRoute(attraction, "non_existent");
    expect(updated).toEqual(attraction);
  });

  it("切换后门票价格不变", () => {
    const updated = switchAttractionRoute(attraction, "route_b");
    expect(updated.ticketPrice).toBe(0);
  });
});

// ─── 西湖路线途经点坐标验证 ──────────────────────────────

describe("西湖路线数据质量", () => {
  it("所有途经点坐标在杭州范围内", async () => {
    const result = await searchAttractionRoutes({ attractionName: "西湖", city: "杭州" });
    for (const route of result.routes) {
      for (const wp of route.waypoints) {
        // 杭州经纬度范围大致：纬度 30.1~30.5，经度 119.9~120.5
        expect(wp.location.latitude).toBeGreaterThan(30.1);
        expect(wp.location.latitude).toBeLessThan(30.5);
        expect(wp.location.longitude).toBeGreaterThan(119.9);
        expect(wp.location.longitude).toBeLessThan(120.5);
      }
    }
  });

  it("不同路线的途经点不完全相同", async () => {
    const result = await searchAttractionRoutes({ attractionName: "西湖", city: "杭州" });
    const namesPerRoute = result.routes.map((r) => r.waypoints.map((w) => w.name).join(","));
    // 至少有两条路线的途经点列表不同
    const unique = new Set(namesPerRoute);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });
});
