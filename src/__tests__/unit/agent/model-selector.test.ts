/**
 * model-selector 单元测试
 */

import { describe, expect, it } from "vitest";
import { selectModelTier } from "../../../agent/model-selector.js";
import type { TripRequest } from "../../../types/trip.js";

// TripRequest.cities 已改为 CityStay[]
const cs = (city: string, days: number) => ({ city, days });

const baseTravelers = {
  adults: 2,
  children: 0,
  seniors: 0,
  infants: 0,
  pregnant: false,
  mobilityImpaired: false,
};

describe("selectModelTier", () => {
  const baseRequest: TripRequest = {
    city: "杭州",
    cities: [cs("杭州", 2)],
    travelDays: 2,
    startDate: "2026-05-20",
    endDate: "2026-05-21",
    transportation: "公共交通",
    accommodation: "经济型酒店",
    preferences: [],
    travelers: baseTravelers,
    freeTextInput: "",
  };

  describe("L1 轻量模型", () => {
    it("单城市短途应选择 L1", () => {
      expect(selectModelTier(baseRequest)).toBe("L1");
    });

    it("单城市 3 天应选择 L1", () => {
      const request = { ...baseRequest, travelDays: 3 };
      expect(selectModelTier(request)).toBe("L1");
    });

    it("简单偏好应选择 L1", () => {
      const request = { ...baseRequest, preferences: ["美食"] };
      expect(selectModelTier(request)).toBe("L1");
    });

    it("短输入应选择 L1", () => {
      const request = { ...baseRequest, freeTextInput: "想去西湖" };
      expect(selectModelTier(request)).toBe("L1");
    });
  });

  describe("L2 强推理模型", () => {
    it("多城市应选择 L2", () => {
      const request = { ...baseRequest, cities: [cs("杭州", 1), cs("上海", 1)] };
      expect(selectModelTier(request)).toBe("L2");
    });

    it("超过 3 天应选择 L2", () => {
      const request = { ...baseRequest, travelDays: 4 };
      expect(selectModelTier(request)).toBe("L2");
    });

    it("复杂偏好应选择 L2", () => {
      const request = { ...baseRequest, preferences: ["美食", "历史", "亲子"] };
      expect(selectModelTier(request)).toBe("L2");
    });

    it("长文本输入应选择 L2", () => {
      const request = {
        ...baseRequest,
        freeTextInput: "我想带家人去杭州玩，有两个老人和一个5岁的小朋友，希望行程不要太累",
      };
      expect(selectModelTier(request)).toBe("L2");
    });

    it("多城市+长行程应选择 L2", () => {
      const request = {
        ...baseRequest,
        cities: [cs("北京", 2), cs("西安", 2), cs("成都", 3)],
        travelDays: 7,
        preferences: ["历史", "美食", "亲子"],
        freeTextInput: "带孩子和老人一起，希望了解历史文化，品尝当地美食",
      };
      expect(selectModelTier(request)).toBe("L2");
    });
  });

  describe("边界条件", () => {
    it("空偏好列表应选择 L1", () => {
      const request = { ...baseRequest, preferences: [] };
      expect(selectModelTier(request)).toBe("L1");
    });

    it("刚好 20 字的输入应选择 L1", () => {
      const request = { ...baseRequest, freeTextInput: "一二三四五六七八九十一二三四五六七八九十" };
      expect(selectModelTier(request)).toBe("L1");
    });

    it("21 字的输入应选择 L2", () => {
      const request = {
        ...baseRequest,
        freeTextInput: "一二三四五六七八九十一二三四五六七八九十一",
      };
      expect(selectModelTier(request)).toBe("L2");
    });

    it("刚好 2 个偏好应选择 L1", () => {
      const request = { ...baseRequest, preferences: ["美食", "历史"] };
      expect(selectModelTier(request)).toBe("L1");
    });

    it("3 个偏好应选择 L2", () => {
      const request = { ...baseRequest, preferences: ["美食", "历史", "亲子"] };
      expect(selectModelTier(request)).toBe("L2");
    });
  });
});
