import { describe, expect, it } from "vitest";
import { createMockTripRequest } from "../mocks/fixtures.js";

describe("diag", () => {
  it("cities override", () => {
    const r = createMockTripRequest({ cities: [{ city: "北京", days: 2 }, { city: "上海", days: 3 }] });
    console.log("cities:", JSON.stringify(r.cities));
    expect(r.cities).toHaveLength(2);
    expect(r.cities[1].city).toBe("上海");
  });
});
