/**
 * supply-cache-service 单元测试
 *
 * 覆盖：
 * - 缓存写入/读取
 * - TTL 过期自动清除
 * - 批量写入
 * - 缓存统计
 * - 不同数据质量的 TTL
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSupplyCache,
  getCachedSupplyPoint,
  getCacheStats,
  getCacheTtl,
  makeCacheKey,
  recordCacheHit,
  recordCacheMiss,
  resetCacheMetrics,
  setCachedSupplyPoint,
  setCachedSupplyPoints,
} from "../../../services/supply-cache-service.js";
import type { ValidatedSupplyPoint } from "../../../services/supply-validation-service.js";

describe("makeCacheKey", () => {
  it("应生成 city:name 格式的 key", () => {
    expect(makeCacheKey("杭州", "星巴克")).toBe("杭州:星巴克");
  });
});

describe("getCacheTtl", () => {
  it("exact + api 应为 180 天", () => {
    const ttl = getCacheTtl({
      name: "A",
      type: "cafe",
      description: "",
      estimatedCost: 30,
      isRecommended: false,
      locationAccuracy: "exact",
      priceConfidence: "api",
    } as ValidatedSupplyPoint);
    expect(ttl).toBe(180 * 24 * 60 * 60 * 1000);
  });

  it("exact + estimate 应为 90 天", () => {
    const ttl = getCacheTtl({
      name: "A",
      type: "cafe",
      description: "",
      estimatedCost: 30,
      isRecommended: false,
      locationAccuracy: "exact",
      priceConfidence: "estimate",
    } as ValidatedSupplyPoint);
    expect(ttl).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it("approximate 应为 60 天", () => {
    const ttl = getCacheTtl({
      name: "A",
      type: "cafe",
      description: "",
      estimatedCost: 30,
      isRecommended: false,
      locationAccuracy: "approximate",
    } as ValidatedSupplyPoint);
    expect(ttl).toBe(60 * 24 * 60 * 60 * 1000);
  });

  it("unknown 应为 30 天", () => {
    const ttl = getCacheTtl({
      name: "A",
      type: "cafe",
      description: "",
      estimatedCost: 30,
      isRecommended: false,
    } as ValidatedSupplyPoint);
    expect(ttl).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("getCachedSupplyPoint / setCachedSupplyPoint", () => {
  beforeEach(() => {
    clearSupplyCache();
    resetCacheMetrics();
  });

  it("应能写入和读取缓存", () => {
    const point: ValidatedSupplyPoint = {
      name: "星巴克",
      type: "cafe",
      description: "",
      estimatedCost: 40,
      isRecommended: false,
      locationAccuracy: "exact",
      priceConfidence: "api",
      lastUpdated: "2026-05-18",
    };

    setCachedSupplyPoint("杭州", "星巴克", point);
    const cached = getCachedSupplyPoint("杭州", "星巴克");
    expect(cached).not.toBeNull();
    expect(cached!.estimatedCost).toBe(40);
    expect(cached!.locationAccuracy).toBe("exact");
  });

  it("缓存过期后应返回 null", () => {
    const point: ValidatedSupplyPoint = {
      name: "A",
      type: "shop",
      description: "",
      estimatedCost: 10,
      isRecommended: false,
      locationAccuracy: "unknown",
    };

    setCachedSupplyPoint("杭州", "A", point);
    // 模拟时间推移 31 天（unknown 的 TTL 是 30 天）
    const future = Date.now() + 31 * 24 * 60 * 60 * 1000;
    const originalNow = Date.now;
    Date.now = () => future;

    try {
      const cached = getCachedSupplyPoint("杭州", "A");
      expect(cached).toBeNull();
    } finally {
      Date.now = originalNow;
    }
  });

  it("不同城市的同名补给点应隔离", () => {
    const p1: ValidatedSupplyPoint = {
      name: "星巴克",
      type: "cafe",
      description: "",
      estimatedCost: 35,
      isRecommended: false,
    };
    const p2: ValidatedSupplyPoint = {
      name: "星巴克",
      type: "cafe",
      description: "",
      estimatedCost: 45,
      isRecommended: false,
    };

    setCachedSupplyPoint("杭州", "星巴克", p1);
    setCachedSupplyPoint("上海", "星巴克", p2);

    expect(getCachedSupplyPoint("杭州", "星巴克")!.estimatedCost).toBe(35);
    expect(getCachedSupplyPoint("上海", "星巴克")!.estimatedCost).toBe(45);
  });
});

describe("setCachedSupplyPoints", () => {
  beforeEach(() => {
    clearSupplyCache();
  });

  it("应批量写入", () => {
    const points: ValidatedSupplyPoint[] = [
      { name: "A", type: "shop", description: "", estimatedCost: 10, isRecommended: false },
      { name: "B", type: "cafe", description: "", estimatedCost: 20, isRecommended: false },
    ];

    setCachedSupplyPoints("杭州", points);
    expect(getCachedSupplyPoint("杭州", "A")!.estimatedCost).toBe(10);
    expect(getCachedSupplyPoint("杭州", "B")!.estimatedCost).toBe(20);
  });
});

describe("getCacheStats", () => {
  beforeEach(() => {
    clearSupplyCache();
    resetCacheMetrics();
  });

  it("应正确统计命中率和请求数", () => {
    recordCacheHit();
    recordCacheHit();
    recordCacheMiss();

    const stats = getCacheStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
    expect(stats.size).toBe(0); // size 是缓存条目数，不是请求数
  });
});
