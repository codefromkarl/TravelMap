/**
 * 餐厅推荐服务 — 单元测试
 */

import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearRestaurantCache,
  enrichDayMeals,
  searchNearbyRestaurants,
} from "../../../services/restaurant-service.js";
import { createEnvStub } from "../../helpers/env.js";
import { createMockDayPlan, createMockLocation } from "../../mocks/fixtures.js";
import { server } from "../../mocks/server.js";

const env = createEnvStub();

describe("restaurant-service", () => {
  afterEach(() => {
    clearRestaurantCache();
  });

  // ─── searchNearbyRestaurants ──────────────────────────────

  describe("searchNearbyRestaurants", () => {
    const testLocation = createMockLocation({ latitude: 30.275, longitude: 120.155 });

    // ─── Mock 降级路径 ──────────────────────────────

    describe("mock fallback (no API key)", () => {
      it("无高德 key 时应返回 mock 数据并标记 source", async () => {
        env.unset("AMAP_WEB_KEY");
        env.unset("GOOGLE_MAPS_API_KEY");

        const { restaurants, source, warning } = await searchNearbyRestaurants({
          location: testLocation,
          city: "杭州",
        });

        expect(source).toBe("mock");
        expect(warning).toBeDefined();
        expect(restaurants.length).toBeGreaterThan(0);
        restaurants.forEach((r) => {
          expect(r.source).toBe("mock");
          expect(r.name).toContain("杭州");
        });
      });

      it("mock 数据应包含完整字段", async () => {
        env.unset("AMAP_WEB_KEY");
        env.unset("GOOGLE_MAPS_API_KEY");

        const { restaurants } = await searchNearbyRestaurants({
          location: testLocation,
          city: "杭州",
          mealType: "lunch",
        });

        const r = restaurants[0]!;
        expect(r).toHaveProperty("name");
        expect(r).toHaveProperty("rating");
        expect(r).toHaveProperty("averageCost");
        expect(r).toHaveProperty("distance");
        expect(r).toHaveProperty("walkMinutes");
        expect(r).toHaveProperty("cuisine");
        expect(r).toHaveProperty("address");
        expect(r).toHaveProperty("location");
        expect(r).toHaveProperty("source");
        expect(typeof r.rating).toBe("number");
        expect(typeof r.averageCost).toBe("number");
        expect(typeof r.distance).toBe("number");
      });

      it("按 mealType 返回不同餐厅名", async () => {
        env.unset("AMAP_WEB_KEY");
        env.unset("GOOGLE_MAPS_API_KEY");

        const breakfast = await searchNearbyRestaurants({
          location: testLocation,
          city: "杭州",
          mealType: "breakfast",
        });
        const dinner = await searchNearbyRestaurants({
          location: testLocation,
          city: "杭州",
          mealType: "dinner",
        });

        expect(breakfast.restaurants[0]!.name).not.toBe(dinner.restaurants[0]!.name);
      });

      it("应遵守 limit 参数", async () => {
        env.unset("AMAP_WEB_KEY");
        env.unset("GOOGLE_MAPS_API_KEY");

        const { restaurants } = await searchNearbyRestaurants({
          location: testLocation,
          city: "杭州",
          limit: 2,
        });

        expect(restaurants.length).toBeLessThanOrEqual(2);
      });
    });

    // ─── 高德 API 路径 ──────────────────────────────

    describe("Amap API (国内城市)", () => {
      it("有高德 key 时应调用高德 API", async () => {
        env.set("AMAP_WEB_KEY", "test-amap-key");

        const { restaurants, source } = await searchNearbyRestaurants({
          location: testLocation,
          city: "杭州",
        });

        expect(source).toBe("amap");
        expect(restaurants.length).toBeGreaterThan(0);
        const r = restaurants[0]!;
        expect(r.source).toBe("amap");
        expect(r.name).toBe("外婆家(西湖店)");
        expect(r.rating).toBe(4.5);
        expect(r.averageCost).toBe(85);
        expect(r.distance).toBe(350);
        expect(r.walkMinutes).toBeGreaterThan(0);
        expect(r.cuisine).toBe("浙江菜");
        expect(r.businessHours).toBe("10:00-22:00");
      });

      it("高德 API 5xx 时应降级到 mock", async () => {
        env.set("AMAP_WEB_KEY", "test-amap-key");

        server.use(
          http.get("https://restapi.amap.com/v3/place/around", () => {
            return new HttpResponse(null, { status: 502 });
          }),
        );

        const { restaurants, source, warning } = await searchNearbyRestaurants({
          location: testLocation,
          city: "杭州",
        });

        expect(source).toBe("mock");
        expect(warning).toContain("API 调用失败");
        expect(restaurants.length).toBeGreaterThan(0);
        restaurants.forEach((r) => {
          expect(r.source).toBe("mock");
        });
      });

      it("高德 API 返回空结果时应降级到 mock", async () => {
        env.set("AMAP_WEB_KEY", "test-amap-key");

        server.use(
          http.get("https://restapi.amap.com/v3/place/around", () => {
            return HttpResponse.json({ status: "1", pois: [] });
          }),
        );

        const { restaurants, source, warning } = await searchNearbyRestaurants({
          location: testLocation,
          city: "杭州",
        });

        expect(source).toBe("mock");
        expect(warning).toContain("API 无结果");
        expect(restaurants.length).toBeGreaterThan(0);
      });

      it("高德 API 网络错误时应降级到 mock", async () => {
        env.set("AMAP_WEB_KEY", "test-amap-key");

        server.use(
          http.get("https://restapi.amap.com/v3/place/around", () => {
            return HttpResponse.error();
          }),
        );

        const { restaurants, source } = await searchNearbyRestaurants({
          location: testLocation,
          city: "杭州",
        });

        expect(source).toBe("mock");
        expect(restaurants.length).toBeGreaterThan(0);
      });

      it("高德 cuisine 参数应传递为 keywords", async () => {
        env.set("AMAP_WEB_KEY", "test-amap-key");

        const { restaurants } = await searchNearbyRestaurants({
          location: testLocation,
          city: "杭州",
          cuisine: "川菜",
        });

        // MSW mock handler 会将 keywords 反映在名称中
        expect(restaurants[0]!.name).toContain("川菜");
      });
    });

    // ─── Google API 路径 ──────────────────────────────

    describe("Google Places API (国外城市)", () => {
      it("国外城市且有 Google key 时应调用 Google API", async () => {
        env.set("GOOGLE_MAPS_API_KEY", "test-google-key");
        env.unset("AMAP_WEB_KEY");

        const { restaurants, source } = await searchNearbyRestaurants({
          location: { latitude: 35.681, longitude: 139.767 },
          city: "Tokyo",
        });

        expect(source).toBe("google");
        expect(restaurants.length).toBeGreaterThan(0);
        const r = restaurants[0]!;
        expect(r.source).toBe("google");
        expect(r.name).toBe("Tokyo Ramen Street");
        expect(r.rating).toBe(4.3);
        expect(r.walkMinutes).toBeGreaterThanOrEqual(0);
      });

      it("国外城市无 Google key 时应降级到 mock", async () => {
        env.unset("GOOGLE_MAPS_API_KEY");
        env.unset("AMAP_WEB_KEY");

        const { restaurants, source, warning } = await searchNearbyRestaurants({
          location: { latitude: 35.681, longitude: 139.767 },
          city: "Tokyo",
        });

        expect(source).toBe("mock");
        expect(warning).toBeDefined();
        expect(restaurants.length).toBeGreaterThan(0);
      });
    });

    // ─── 缓存 ──────────────────────────────

    describe("cache", () => {
      it("相同参数应命中缓存", async () => {
        env.set("AMAP_WEB_KEY", "test-amap-key");

        const r1 = await searchNearbyRestaurants({
          location: testLocation,
          city: "杭州",
          mealType: "lunch",
        });

        // 第二次应该命中缓存（mock handler 只调用一次）
        const r2 = await searchNearbyRestaurants({
          location: testLocation,
          city: "杭州",
          mealType: "lunch",
        });

        expect(r1.restaurants[0]!.name).toBe(r2.restaurants[0]!.name);
      });

      it("不同 mealType 不命中缓存", async () => {
        env.set("AMAP_WEB_KEY", "test-amap-key");

        await searchNearbyRestaurants({
          location: testLocation,
          city: "杭州",
          mealType: "lunch",
        });

        // 不同 mealType 应该是新的缓存 key
        const r2 = await searchNearbyRestaurants({
          location: testLocation,
          city: "杭州",
          mealType: "dinner",
        });

        expect(r2.restaurants.length).toBeGreaterThan(0);
      });
    });
  });

  // ─── enrichDayMeals ──────────────────────────────────────

  describe("enrichDayMeals", () => {
    it("应为三餐搜索对应位置的餐厅", async () => {
      env.set("AMAP_WEB_KEY", "test-amap-key");

      const dayPlan = createMockDayPlan({
        city: "杭州",
        attractions: [createMockLocation({ latitude: 30.25, longitude: 120.15 })].map(
          (loc, i) =>
            ({
              name: `景点${i + 1}`,
              nameZh: `景点${i + 1}`,
              nameEn: `Attraction ${i + 1}`,
              address: "杭州市",
              location: loc,
              visitDuration: 120,
              description: "测试",
              category: "景点",
              ticketPrice: 0,
              reservationRequired: false,
              reservationTips: "",
            }) satisfies import("../../../types/trip.js").Attraction,
        ),
        meals: [
          { type: "breakfast", name: "早餐", description: "简单早餐", estimatedCost: 20 },
          { type: "lunch", name: "午餐", description: "当地美食", estimatedCost: 60 },
          { type: "dinner", name: "晚餐", description: "特色晚餐", estimatedCost: 100 },
        ],
      });

      const result = await enrichDayMeals(dayPlan);

      expect(result.meals).toHaveLength(3);
      // 至少有一些 meal 带有 restaurant 字段
      const enriched = result.meals.filter((m) => m.restaurant);
      expect(enriched.length).toBeGreaterThan(0);

      // restaurant 应有完整字段
      const firstEnriched = enriched[0]!;
      expect(firstEnriched.restaurant!.name).toBeTruthy();
      expect(firstEnriched.restaurant!.source).toBe("amap");
      expect(typeof firstEnriched.restaurant!.rating).toBe("number");
    });

    it("无 meals 时应原样返回", async () => {
      const dayPlan = createMockDayPlan({ meals: [] });
      const result = await enrichDayMeals(dayPlan);
      expect(result.meals).toHaveLength(0);
    });

    it("API 失败时应保留原始 meal 数据", async () => {
      env.unset("AMAP_WEB_KEY");
      env.unset("GOOGLE_MAPS_API_KEY");

      const originalMeal = {
        type: "lunch" as const,
        name: "原始午餐",
        description: "原始描述",
        estimatedCost: 50,
      };

      const dayPlan = createMockDayPlan({
        city: "杭州",
        meals: [originalMeal],
      });

      const result = await enrichDayMeals(dayPlan);

      expect(result.meals).toHaveLength(1);
      expect(result.meals[0]!.name).toBe("原始午餐");
      expect(result.meals[0]!.estimatedCost).toBe(50);
    });

    it("早餐应使用酒店坐标（如可用）", async () => {
      env.set("AMAP_WEB_KEY", "test-amap-key");

      const hotelLocation = createMockLocation({ latitude: 30.26, longitude: 120.16 });
      const dayPlan = createMockDayPlan({
        city: "杭州",
        hotel: {
          name: "测试酒店",
          address: "杭州市",
          location: hotelLocation,
          priceRange: "300-500",
          rating: 4.5,
          estimatedCost: 400,
        },
        meals: [{ type: "breakfast", name: "早餐", description: "酒店早餐", estimatedCost: 30 }],
      });

      const result = await enrichDayMeals(dayPlan);

      // 早餐应搜索成功
      expect(result.meals[0]!.restaurant).toBeDefined();
    });
  });
});
