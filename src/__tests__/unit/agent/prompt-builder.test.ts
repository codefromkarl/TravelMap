/**
 * Prompt Builder + Model Selector — 单元测试
 */

import { describe, expect, it } from "vitest";
import { selectModelTier } from "../../../agent/model-selector.js";
import {
  buildUserPrompt,
  formatTravelers,
  shouldDigPreferences,
} from "../../../agent/prompt-builder.js";
import type { TripRequest } from "../../../types/trip.js";

// ─── Model Selector ────────────────────────────────────

describe("selectModelTier", () => {
  const baseRequest: TripRequest = {
    city: "杭州",
    cities: [],
    startDate: "2025-06-01",
    endDate: "2025-06-03",
    travelDays: 3,
    transportation: "公共交通",
    accommodation: "舒适型",
    preferences: [],
  };

  it("单城市 ≤3天 简单偏好 → L1", () => {
    expect(selectModelTier(baseRequest)).toBe("L1");
  });

  it("多城市 → L2", () => {
    const req = {
      ...baseRequest,
      cities: [
        { city: "杭州", days: 2 },
        { city: "上海", days: 2 },
      ],
    };
    expect(selectModelTier(req)).toBe("L2");
  });

  it(">3天 → L2", () => {
    const req = { ...baseRequest, travelDays: 5, endDate: "2025-06-05" };
    expect(selectModelTier(req)).toBe("L2");
  });

  it("偏好 >2 个 → L2", () => {
    const req = { ...baseRequest, preferences: ["文化", "美食", "购物"] };
    expect(selectModelTier(req)).toBe("L2");
  });

  it("长文本输入 >20 字符 → L2", () => {
    const req = { ...baseRequest, freeTextInput: "我想带父母和小孩去杭州玩需要轻松的行程安排" };
    expect(selectModelTier(req)).toBe("L2");
  });

  it("短文本输入 ≤20 字符 → L1", () => {
    const req = { ...baseRequest, freeTextInput: "轻松休闲" };
    expect(selectModelTier(req)).toBe("L1");
  });
});

// ─── Prompt Builder ────────────────────────────────────

describe("buildUserPrompt", () => {
  const baseRequest: TripRequest = {
    city: "杭州",
    cities: [],
    startDate: "2025-06-01",
    endDate: "2025-06-03",
    travelDays: 3,
    transportation: "公共交通",
    accommodation: "舒适型",
    preferences: ["文化"],
  };

  it("应包含基本信息字段", () => {
    const prompt = buildUserPrompt(baseRequest);
    expect(prompt).toContain("杭州(3天)");
    expect(prompt).toContain("2025-06-01");
    expect(prompt).toContain("公共交通");
    expect(prompt).toContain("文化");
  });

  it("多城市应显示为箭头连接", () => {
    const req = {
      ...baseRequest,
      cities: [
        { city: "杭州", days: 2 },
        { city: "上海", days: 3 },
      ],
    };
    const prompt = buildUserPrompt(req);
    expect(prompt).toContain("杭州(2天) → 上海(3天)");
  });

  it("应包含额外要求", () => {
    const req = { ...baseRequest, freeTextInput: "希望有亲子活动" };
    const prompt = buildUserPrompt(req);
    expect(prompt).toContain("希望有亲子活动");
  });

  it("无偏好时应显示无特殊偏好", () => {
    const req = { ...baseRequest, preferences: [] };
    const prompt = buildUserPrompt(req);
    expect(prompt).toContain("无特殊偏好");
  });
});

// ─── formatTravelers ───────────────────────────────────

describe("formatTravelers", () => {
  it("无人群画像返回空字符串", () => {
    expect(formatTravelers(undefined)).toBe("");
  });

  it("仅成人", () => {
    const text = formatTravelers({
      adults: 2,
      seniors: 0,
      children: 0,
      infants: 0,
      pregnant: false,
      mobilityImpaired: false,
    });
    expect(text).toContain("2成人");
    expect(text).not.toContain("· 1老人");
  });

  it("包含老人和儿童", () => {
    const text = formatTravelers({
      adults: 2,
      seniors: 1,
      children: 1,
      infants: 0,
      pregnant: false,
      mobilityImpaired: false,
    });
    expect(text).toContain("1老人");
    expect(text).toContain("1儿童");
  });

  it("包含孕妇和行动不便者", () => {
    const text = formatTravelers({
      adults: 2,
      seniors: 0,
      children: 0,
      infants: 0,
      pregnant: true,
      mobilityImpaired: true,
    });
    expect(text).toContain("有孕妇");
    expect(text).toContain("有行动不便者");
  });
});

// ─── shouldDigPreferences ──────────────────────────────

describe("shouldDigPreferences", () => {
  const baseRequest: TripRequest = {
    city: "杭州",
    cities: [],
    startDate: "2025-06-01",
    endDate: "2025-06-03",
    travelDays: 3,
    transportation: "公共交通",
    accommodation: "舒适型",
    preferences: [],
  };

  it("无偏好、无自由文本、无人群 → 需要挖掘", () => {
    expect(shouldDigPreferences(baseRequest)).toBe(true);
  });

  it("有偏好 → 不需要挖掘", () => {
    const req = { ...baseRequest, preferences: ["文化"] };
    expect(shouldDigPreferences(req)).toBe(false);
  });

  it("有自由文本 → 不需要挖掘", () => {
    const req = { ...baseRequest, freeTextInput: "轻松行程" };
    expect(shouldDigPreferences(req)).toBe(false);
  });

  it("有人群画像 → 不需要挖掘", () => {
    const req = {
      ...baseRequest,
      travelers: {
        adults: 2,
        seniors: 0,
        children: 0,
        infants: 0,
        pregnant: false,
        mobilityImpaired: false,
      },
    };
    expect(shouldDigPreferences(req)).toBe(false);
  });
});
