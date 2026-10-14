import { describe, expect, it } from "vitest";
import { type TripPlan, validateTripPlan } from "../../../types/trip.js";
import {
  createMockAttraction,
  createMockDayPlan,
  createMockTripPlan,
} from "../../mocks/fixtures.js";

describe("validated trip boundary", () => {
  it("accepts valid equatorial coordinates and keeps the input plan", () => {
    const plan = createMockTripPlan({
      days: [
        createMockDayPlan({
          attractions: [createMockAttraction({ location: { latitude: 0, longitude: 30 } })],
        }),
      ],
    });
    expect(validateTripPlan(plan)).toBe(plan);
    expect(validateTripPlan(plan).days[0]?.attractions[0]?.location.latitude).toBe(0);
  });

  it.each(["invalid", "2025-02-30", "2025-13-01"])("rejects invalid date %s", (date) => {
    const plan = createMockTripPlan({ days: [createMockDayPlan({ date })] });
    expect(() => validateTripPlan(plan)).toThrow("第 1 天日期无效");
  });

  it.each([
    { latitude: Number.NaN, longitude: 30 },
    { latitude: 30, longitude: Number.POSITIVE_INFINITY },
    { latitude: 91, longitude: 30 },
    { latitude: 30, longitude: 181 },
    { latitude: 0, longitude: 0 },
  ])("rejects invalid coordinates $latitude, $longitude", (location) => {
    const plan = createMockTripPlan({
      days: [createMockDayPlan({ attractions: [createMockAttraction({ location })] })],
    });
    expect(() => validateTripPlan(plan)).toThrow("缺少有效坐标");
  });

  it("rejects incomplete runtime data with a validation error", () => {
    const plan = { city: "杭州", days: [{ date: "2025-06-01" }] } as TripPlan;
    expect(() => validateTripPlan(plan)).toThrow("第 1 天缺少景点数组");
  });

  it("rejects duplicate dates while permitting chronological transfer gaps", () => {
    const first = createMockDayPlan({ date: "2025-06-01" });
    const duplicate = createMockTripPlan({ days: [first, createMockDayPlan()] });
    expect(() => validateTripPlan(duplicate)).toThrow("第 2 天日期不晚于前一天");
    const plan = createMockTripPlan({
      days: [first, createMockDayPlan({ date: "2025-06-03", dayIndex: 2 })],
    });
    expect(validateTripPlan(plan).days[1]?.date).toBe("2025-06-03");
  });
});
