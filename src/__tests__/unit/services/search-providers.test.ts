/**
 * Search Orchestrator — 集成冒烟测试
 */

import { describe, expect, it } from "vitest";
import { runParallelSearch } from "../../../services/search-orchestrator.js";
import type { TripRequest } from "../../../types/trip.js";

const mockRequest: TripRequest = {
  city: "北京",
  cities: [{ city: "北京", days: 3 }],
  travelDays: 3,
  preferences: ["博物馆"],
  startDate: "2025-06-01",
  endDate: "2025-06-03",
  transportation: "步行",
  accommodation: "酒店",
};

describe("Search Orchestrator 冒烟测试", () => {
  it("runParallelSearch 返回正确的结构", async () => {
    const result = await runParallelSearch(mockRequest, { enableGeocode: false });

    expect(result).toHaveProperty("attractions");
    expect(result).toHaveProperty("weather");
    expect(result).toHaveProperty("sources");
    expect(result).toHaveProperty("cityCoords");

    expect(Array.isArray(result.attractions)).toBe(true);
    expect(Array.isArray(result.weather)).toBe(true);
    expect(Array.isArray(result.sources)).toBe(true);
    expect(result.cityCoords).toBeInstanceOf(Map);
  });

  it("enableGeocode=false 时不返回坐标数据", async () => {
    const result = await runParallelSearch(mockRequest, { enableGeocode: false });

    expect(result.cityCoords.size).toBe(0);
  });
});
