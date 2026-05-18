/**
 * 多城市行程编排服务 — 扩展测试
 *
 * 补充覆盖：
 *   - estimateTransport 未知路线默认估算
 *   - 未知城市对（不在 CITY_ROUTES 中）
 *   - sortByProximity 完整贪心排序
 *   - 单城市边界
 */

import { describe, expect, it } from "vitest";
import {
  type AttractionWithLocation,
  planMultiCityRoute,
  sortByProximity,
} from "../../../services/multi-city-service.js";

// ─── planMultiCityRoute — 未知城市对 ──────────────────────

describe("planMultiCityRoute — 未知城市对", () => {
  it("未知城市对应返回默认估算交通", () => {
    const plan = planMultiCityRoute(
      [
        { city: "拉萨", days: 2 },
        { city: "乌鲁木齐", days: 2 },
      ],
      "2025-06-01",
    );
    expect(plan.transfers).toHaveLength(1);
    // 不在 CITY_ROUTES 中，应使用默认估算 "高铁/飞机"
    expect(plan.transfers[0].transport.mode).toBe("高铁/飞机");
    expect(plan.transfers[0].transport.hours).toBe(4);
    expect(plan.transfers[0].transport.cost).toBe(500);
  });

  it("四城市行程应正确计算", () => {
    const plan = planMultiCityRoute(
      [
        { city: "北京", days: 2 },
        { city: "上海", days: 1 },
        { city: "杭州", days: 1 },
        { city: "广州", days: 2 },
      ],
      "2025-06-01",
    );
    // 2 + 1(transfer) + 1 + 1(transfer) + 1 + 1(transfer) + 2 = 9
    expect(plan.totalDays).toBe(9);
    expect(plan.transfers).toHaveLength(3);
    expect(plan.transfers[0].from).toBe("北京");
    expect(plan.transfers[0].to).toBe("上海");
    expect(plan.transfers[1].from).toBe("上海");
    expect(plan.transfers[1].to).toBe("杭州");
    expect(plan.transfers[2].from).toBe("杭州");
    expect(plan.transfers[2].to).toBe("广州");
  });

  it("单城市一天的行程", () => {
    const plan = planMultiCityRoute([{ city: "成都", days: 1 }], "2025-06-01");
    expect(plan.totalDays).toBe(1);
    expect(plan.transfers).toHaveLength(0);
    expect(plan.totalTransportCost).toBe(0);
    expect(plan.dayOutline).toHaveLength(1);
    expect(plan.dayOutline[0].isTransferDay).toBe(false);
  });
});

// ─── sortByProximity — 完整贪心排序 ──────────────────────

describe("sortByProximity — 贪心最近邻", () => {
  it("3 个景点按地理距离排序", () => {
    const attractions: AttractionWithLocation[] = [
      { name: "北京", latitude: 39.9, longitude: 116.4 },
      { name: "上海", latitude: 31.2, longitude: 121.5 },
      { name: "南京", latitude: 32.06, longitude: 118.8 },
    ];
    const sorted = sortByProximity(attractions);
    // 北京 → 南京（更近）→ 上海
    expect(sorted[0].name).toBe("北京");
    expect(sorted[1].name).toBe("南京");
    expect(sorted[2].name).toBe("上海");
  });

  it("4 个以上景点排序", () => {
    const attractions: AttractionWithLocation[] = [
      { name: "成都", latitude: 30.57, longitude: 104.07 },
      { name: "重庆", latitude: 29.56, longitude: 106.55 },
      { name: "西安", latitude: 34.34, longitude: 108.94 },
      { name: "北京", latitude: 39.9, longitude: 116.4 },
      { name: "上海", latitude: 31.23, longitude: 121.47 },
    ];
    const sorted = sortByProximity(attractions);
    expect(sorted).toHaveLength(5);
    expect(sorted[0].name).toBe("成都");
    // 成都 → 重庆 最近
    expect(sorted[1].name).toBe("重庆");
  });

  it("1 个景点保持原序", () => {
    const attractions: AttractionWithLocation[] = [{ name: "A", latitude: 30.0, longitude: 120.0 }];
    const sorted = sortByProximity(attractions);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].name).toBe("A");
  });

  it("坐标完全相同时保持原序", () => {
    const attractions: AttractionWithLocation[] = [
      { name: "A", latitude: 30.0, longitude: 120.0 },
      { name: "B", latitude: 30.0, longitude: 120.0 },
      { name: "C", latitude: 30.0, longitude: 120.0 },
    ];
    const sorted = sortByProximity(attractions);
    expect(sorted.map((a) => a.name)).toEqual(["A", "B", "C"]);
  });

  it("部分缺坐标时不排序（保持原序）", () => {
    const attractions: AttractionWithLocation[] = [
      { name: "A", latitude: 30.0, longitude: 120.0 },
      { name: "B" }, // 无坐标
      { name: "C", latitude: 31.0, longitude: 121.0 },
    ];
    const sorted = sortByProximity(attractions);
    expect(sorted.map((a) => a.name)).toEqual(["A", "B", "C"]);
  });

  it("不修改原数组", () => {
    const attractions: AttractionWithLocation[] = [
      { name: "A", latitude: 39.9, longitude: 116.4 },
      { name: "B", latitude: 31.2, longitude: 121.5 },
      { name: "C", latitude: 34.3, longitude: 108.9 },
    ];
    const original = [...attractions];
    sortByProximity(attractions);
    expect(attractions.map((a) => a.name)).toEqual(original.map((a) => a.name));
  });
});

// ─── planMultiCityRoute — 交通费用计算 ────────────────────

describe("planMultiCityRoute — 交通费用", () => {
  it("北京到上海的交通费用正确", () => {
    const plan = planMultiCityRoute(
      [
        { city: "北京", days: 1 },
        { city: "上海", days: 1 },
      ],
      "2025-06-01",
    );
    // 北京-上海 1200km → 飞机
    expect(plan.transfers[0].transport.mode).toBe("飞机");
    expect(plan.transfers[0].transport.cost).toBe(800);
    expect(plan.totalTransportCost).toBe(800);
  });

  it("上海到南京选择高铁（300km < 500km）", () => {
    const plan = planMultiCityRoute(
      [
        { city: "上海", days: 1 },
        { city: "南京", days: 1 },
      ],
      "2025-06-01",
    );
    expect(plan.transfers[0].transport.mode).toBe("高铁");
    expect(plan.transfers[0].transport.cost).toBe(135);
  });

  it("成都到重庆选择高铁（300km）", () => {
    const plan = planMultiCityRoute(
      [
        { city: "成都", days: 1 },
        { city: "重庆", days: 1 },
      ],
      "2025-06-01",
    );
    expect(plan.transfers[0].transport.mode).toBe("高铁");
  });

  it("广州到深圳选择高铁（140km）", () => {
    const plan = planMultiCityRoute(
      [
        { city: "广州", days: 1 },
        { city: "深圳", days: 1 },
      ],
      "2025-06-01",
    );
    expect(plan.transfers[0].transport.mode).toBe("高铁");
    expect(plan.transfers[0].transport.cost).toBe(75);
  });
});

// ─── planMultiCityRoute — dayOutline 详解 ────────────────

describe("planMultiCityRoute — dayOutline 结构", () => {
  it("移动日的 transferInfo 包含交通详情", () => {
    const plan = planMultiCityRoute(
      [
        { city: "北京", days: 1 },
        { city: "上海", days: 1 },
      ],
      "2025-06-01",
    );
    const transferDay = plan.dayOutline.find((d) => d.isTransferDay);
    expect(transferDay).toBeDefined();
    expect(transferDay!.transferInfo).toContain("北京");
    expect(transferDay!.transferInfo).toContain("上海");
    expect(transferDay!.transferInfo).toContain("飞机");
  });

  it("cityStays 保留在结果中", () => {
    const stays = [
      { city: "北京", days: 2 },
      { city: "上海", days: 3 },
    ];
    const plan = planMultiCityRoute(stays, "2025-06-01");
    expect(plan.cityStays).toEqual(stays);
  });

  it("日期正确跨月", () => {
    const plan = planMultiCityRoute(
      [
        { city: "北京", days: 2 },
        { city: "上海", days: 1 },
      ],
      "2025-06-30",
    );
    expect(plan.dayOutline[0].date).toBe("2025-06-30");
    expect(plan.dayOutline[1].date).toBe("2025-07-01");
    expect(plan.dayOutline[2].date).toBe("2025-07-02");
    expect(plan.dayOutline[3].date).toBe("2025-07-03");
  });
});
