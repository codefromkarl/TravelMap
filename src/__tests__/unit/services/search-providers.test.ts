/**
 * Search Providers — 集成冒烟测试
 */

import { describe, expect, it } from "vitest";
import { AttractionSearchProvider } from "../../../services/search/providers/attraction-provider.js";
import { GeocodeSearchProvider } from "../../../services/search/providers/geocode-provider.js";
import { WeatherSearchProvider } from "../../../services/search/providers/weather-provider.js";
import type { SearchProvider } from "../../../services/search/types.js";

const providers: SearchProvider[] = [
  new AttractionSearchProvider(),
  new WeatherSearchProvider(),
  new GeocodeSearchProvider(),
];

describe("Search Providers 冒烟测试", () => {
  it("所有 provider 都有唯一的名称和 resultKey", () => {
    const names = providers.map((p) => p.name);
    const keys = providers.map((p) => p.resultKey);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("每个 provider 都有 search 方法", () => {
    for (const provider of providers) {
      expect(typeof provider.search).toBe("function");
    }
  });

  it("默认 provider 列表包含 3 个", async () => {
    const { createDefaultProviders } = await import("../../../services/search/providers/index.js");
    const defaults = createDefaultProviders();
    expect(defaults).toHaveLength(3);
  });
});
