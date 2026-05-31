/**
 * geo-utils 单元测试
 */

import { describe, expect, it } from "vitest";
import { haversineMeters, WALK_SPEED_MPM } from "../../../services/geo-utils.js";

describe("geo-utils", () => {
  describe("WALK_SPEED_MPM", () => {
    it("步行速度约为 83.33 米/分钟（5km/h）", () => {
      expect(WALK_SPEED_MPM).toBeCloseTo(83.33, 1);
    });
  });

  describe("haversineMeters", () => {
    it("同一点距离为 0", () => {
      const dist = haversineMeters(39.9087, 116.4214, 39.9087, 116.4214);
      expect(dist).toBe(0);
    });

    it("计算北京天安门到上海外滩的距离", () => {
      // 北京天安门: 39.9087, 116.4214
      // 上海外滩: 31.2345, 121.4879
      const dist = haversineMeters(39.9087, 116.4214, 31.2345, 121.4879);
      // 实际距离约 1068 公里
      expect(dist).toBeGreaterThan(1_000_000);
      expect(dist).toBeLessThan(1_200_000);
    });

    it("计算短距离（同一城市内）", () => {
      // 北京天安门到故宫: 约 1 公里
      const dist = haversineMeters(39.9087, 116.4214, 39.9163, 116.3972);
      expect(dist).toBeGreaterThan(500);
      expect(dist).toBeLessThan(3000);
    });

    it("距离对称（A→B = B→A）", () => {
      const distAB = haversineMeters(39.9087, 116.4214, 31.2345, 121.4879);
      const distBA = haversineMeters(31.2345, 121.4879, 39.9087, 116.4214);
      expect(distAB).toBeCloseTo(distBA, 0);
    });

    it("处理赤道上的点", () => {
      // 赤道上经度差 1 度 ≈ 111 公里
      const dist = haversineMeters(0, 0, 0, 1);
      expect(dist).toBeGreaterThan(110_000);
      expect(dist).toBeLessThan(112_000);
    });

    it("处理极地附近的点", () => {
      // 北极附近
      const dist = haversineMeters(89.9, 0, 89.9, 180);
      // 经度差 180 度但在高纬度距离约 22 公里
      expect(dist).toBeGreaterThan(20_000);
      expect(dist).toBeLessThan(25_000);
    });
  });
});
