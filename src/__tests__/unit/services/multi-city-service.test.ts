/**
 * 多城市行程编排服务测试
 */

import { describe, expect, it } from "vitest";
import {
  type AttractionWithLocation,
  planMultiCityRoute,
  sortByProximity,
} from "../../../services/multi-city-service.js";

describe("planMultiCityRoute", () => {
  it("单城市无移动日", () => {
    const plan = planMultiCityRoute([{ city: "北京", days: 3 }], "2025-06-01");
    expect(plan.totalDays).toBe(3);
    expect(plan.transfers).toHaveLength(0);
    expect(plan.totalTransportCost).toBe(0);
    expect(plan.dayOutline).toHaveLength(3);
    expect(plan.dayOutline.every((d) => !d.isTransferDay)).toBe(true);
  });

  it("两城市插入1个移动日", () => {
    const plan = planMultiCityRoute(
      [
        { city: "北京", days: 3 },
        { city: "西安", days: 2 },
      ],
      "2025-06-01",
    );
    expect(plan.totalDays).toBe(6); // 3 + 1(transfer) + 2
    expect(plan.transfers).toHaveLength(1);
    expect(plan.transfers[0].from).toBe("北京");
    expect(plan.transfers[0].to).toBe("西安");
    expect(plan.totalTransportCost).toBeGreaterThan(0);
  });

  it("三城市插入2个移动日", () => {
    const plan = planMultiCityRoute(
      [
        { city: "北京", days: 2 },
        { city: "上海", days: 2 },
        { city: "杭州", days: 1 },
      ],
      "2025-06-01",
    );
    expect(plan.totalDays).toBe(7); // 2 + 1(transfer) + 2 + 1(transfer) + 1
    expect(plan.transfers).toHaveLength(2);
    expect(plan.transfers[0].from).toBe("北京");
    expect(plan.transfers[0].to).toBe("上海");
    expect(plan.transfers[1].from).toBe("上海");
    expect(plan.transfers[1].to).toBe("杭州");
  });

  it("日期正确递增", () => {
    const plan = planMultiCityRoute(
      [
        { city: "北京", days: 1 },
        { city: "上海", days: 1 },
      ],
      "2025-06-01",
    );
    expect(plan.dayOutline[0].date).toBe("2025-06-01");
    expect(plan.dayOutline[1].date).toBe("2025-06-02"); // transfer
    expect(plan.dayOutline[2].date).toBe("2025-06-03"); // 上海
  });

  it("dayIndex 正确递增", () => {
    const plan = planMultiCityRoute(
      [
        { city: "北京", days: 2 },
        { city: "西安", days: 1 },
      ],
      "2025-06-01",
    );
    const indices = plan.dayOutline.map((d) => d.dayIndex);
    expect(indices).toEqual([0, 1, 2, 3]);
  });

  it("空数组返回空计划", () => {
    const plan = planMultiCityRoute([], "2025-06-01");
    expect(plan.totalDays).toBe(0);
    expect(plan.dayOutline).toHaveLength(0);
  });

  it("交通方式合理", () => {
    const plan = planMultiCityRoute(
      [
        { city: "北京", days: 1 },
        { city: "上海", days: 1 },
      ],
      "2025-06-01",
    );
    // 北京-上海距离 1200km，应选择飞机
    expect(plan.transfers[0].transport.mode).toBe("飞机");
  });

  it("短距离选择高铁", () => {
    const plan = planMultiCityRoute(
      [
        { city: "上海", days: 1 },
        { city: "杭州", days: 1 },
      ],
      "2025-06-01",
    );
    // 上海-杭州 180km，应选择高铁
    expect(plan.transfers[0].transport.mode).toBe("高铁");
  });
});

describe("sortByProximity", () => {
  const attractions: AttractionWithLocation[] = [
    { name: "A", latitude: 39.9, longitude: 116.4 }, // 北京
    { name: "C", latitude: 31.2, longitude: 121.5 }, // 上海
    { name: "B", latitude: 34.3, longitude: 108.9 }, // 西安
  ];

  it("按地理位置排序", () => {
    const sorted = sortByProximity(attractions);
    // A(北京) → B(西安) → C(上海) 北京到西安比到上海近
    expect(sorted[0].name).toBe("A");
    expect(sorted.map((a) => a.name)).not.toEqual(["A", "C", "B"]); // C不是最近
  });

  it("保持原序当少于3个", () => {
    const two = attractions.slice(0, 2);
    const sorted = sortByProximity(two);
    expect(sorted.map((a) => a.name)).toEqual(["A", "C"]);
  });

  it("无坐标时保持原序", () => {
    const noCoords = attractions.map(({ latitude, longitude, ...rest }) => rest);
    const sorted = sortByProximity(noCoords as AttractionWithLocation[]);
    expect(sorted.map((a) => a.name)).toEqual(["A", "C", "B"]);
  });
});
