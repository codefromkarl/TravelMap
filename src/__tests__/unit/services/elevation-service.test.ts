/**
 * elevation-service 单元测试
 *
 * 覆盖：
 * - 批量海拔查询（含缓存）
 * - fillWaypointElevations 填充逻辑
 */

import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearElevationCache,
  fillWaypointElevations,
  queryElevations,
} from "../../../services/elevation-service.js";
import { server } from "../../mocks/server.js";

let fetchSpy: ReturnType<typeof vi.fn>;

describe("queryElevations", () => {
  beforeEach(() => {
    clearElevationCache();
    fetchSpy = vi.fn();

    // 包装 MSW handler，记录调用次数的同时返回正常响应
    server.use(
      http.get("https://api.opentopodata.org/v1/srtm90m", async ({ request }) => {
        fetchSpy(request.url);
        return HttpResponse.json({
          results: [
            { location: { lat: 30.25, lng: 120.15 }, elevation: 15 },
            { location: { lat: 30.14, lng: 118.17 }, elevation: 1860 },
          ],
        });
      }),
    );
  });

  it("调用 API 并返回正确海拔", async () => {
    const result = await queryElevations([
      { latitude: 30.25, longitude: 120.15 },
      { latitude: 30.14, longitude: 118.17 },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].elevation).toBe(15);
    expect(result[1].elevation).toBe(1860);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("缓存命中时不再调用 API", async () => {
    // 第一次查询
    await queryElevations([{ latitude: 30.25, longitude: 120.15 }]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 第二次查询相同坐标
    const result = await queryElevations([{ latitude: 30.25, longitude: 120.15 }]);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // 不再调用
    expect(result[0].elevation).toBe(15);
  });

  it("API 失败时返回 0 海拔", async () => {
    server.use(
      http.get("https://api.opentopodata.org/v1/srtm90m", () => {
        fetchSpy("error");
        return new HttpResponse(null, { status: 429 });
      }),
    );

    const result = await queryElevations([{ latitude: 30.25, longitude: 120.15 }]);
    expect(result[0].elevation).toBe(0);
  });

  it("空坐标列表直接返回空数组", async () => {
    const result = await queryElevations([]);
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("fillWaypointElevations", () => {
  beforeEach(() => {
    clearElevationCache();
    fetchSpy = vi.fn();

    server.use(
      http.get("https://api.opentopodata.org/v1/srtm90m", async ({ request }) => {
        fetchSpy(request.url);
        return HttpResponse.json({
          results: [{ location: { lat: 30.25, lng: 120.15 }, elevation: 15 }],
        });
      }),
    );
  });

  it("为无海拔的 waypoint 填充海拔", async () => {
    const waypoints = [
      { name: "A", location: { latitude: 30.25, longitude: 120.15 } },
      { name: "B", location: { latitude: 30.14, longitude: 118.17 }, elevation: 100 },
    ];

    const result = await fillWaypointElevations(waypoints);
    expect(result[0].elevation).toBe(15);
    expect(result[1].elevation).toBe(100); // 已有海拔，保持不变
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("所有 waypoint 已有海拔时不调用 API", async () => {
    const waypoints = [
      { name: "A", location: { latitude: 30.25, longitude: 120.15 }, elevation: 10 },
      { name: "B", location: { latitude: 30.14, longitude: 118.17 }, elevation: 100 },
    ];

    const result = await fillWaypointElevations(waypoints);
    expect(result[0].elevation).toBe(10);
    expect(result[1].elevation).toBe(100);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
