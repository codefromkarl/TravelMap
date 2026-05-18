/**
 * trvl CLI 服务单元测试
 *
 * trvl-service 使用 promisify(execFile)，mock 需要匹配 callback 签名。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetAvailabilityCache,
  cityToAllIATA,
  cityToIATA,
  isTrvlAvailable,
  searchFlights,
  searchHotels,
} from "../../../services/trvl-service.js";

// Mock child_process 的 execFile（callback 风格）
const mockExecFile = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
  _resetAvailabilityCache();
});

/** 设置 mock 返回成功结果 */
function mockSuccess(stdout: string): void {
  mockExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void,
    ) => {
      cb(null, { stdout, stderr: "" });
    },
  );
}

/** 设置 mock 返回错误 */
function mockError(error: Error): void {
  mockExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void,
    ) => {
      cb(error);
    },
  );
}

describe("trvl-service", () => {
  describe("cityToIATA", () => {
    it("映射已知城市到主要 IATA 代码", () => {
      expect(cityToIATA("北京")).toBe("PEK");
      expect(cityToIATA("上海")).toBe("PVG");
      expect(cityToIATA("成都")).toBe("CTU");
    });

    it("未知城市返回原城市名", () => {
      expect(cityToIATA("某小城")).toBe("某小城");
    });
  });

  describe("cityToAllIATA", () => {
    it("返回城市的所有 IATA 代码", () => {
      expect(cityToAllIATA("北京")).toEqual(["PEK", "PKX"]);
      expect(cityToAllIATA("上海")).toEqual(["PVG", "SHA"]);
    });

    it("未知城市返回单元素数组", () => {
      expect(cityToAllIATA("某小城")).toEqual(["某小城"]);
    });
  });

  describe("isTrvlAvailable", () => {
    it("trvl 已安装时返回 true", async () => {
      mockSuccess("trvl 1.2.3\n");

      const result = await isTrvlAvailable();

      expect(result).toBe(true);
      expect(mockExecFile).toHaveBeenCalled();
      const callArgs = mockExecFile.mock.calls[0];
      expect(callArgs[0]).toBe("trvl");
      expect(callArgs[1]).toEqual(["version"]);
    });

    it("trvl 未安装时返回 false", async () => {
      mockError(new Error("not found"));

      const result = await isTrvlAvailable();

      expect(result).toBe(false);
    });

    it("结果会被缓存", async () => {
      mockSuccess("trvl 1.2.3\n");

      await isTrvlAvailable();
      await isTrvlAvailable();

      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });

    it("强制刷新时重新检测", async () => {
      mockSuccess("trvl 1.2.3\n");

      await isTrvlAvailable();
      await isTrvlAvailable(true);

      expect(mockExecFile).toHaveBeenCalledTimes(2);
    });
  });

  describe("searchFlights", () => {
    it("成功搜索航班并返回解析后的数据", async () => {
      mockSuccess(
        JSON.stringify({
          success: true,
          count: 1,
          trip_type: "one_way",
          flights: [
            {
              price: 580,
              currency: "CNY",
              duration: 120,
              stops: 0,
              booking_url: "https://example.com/flight",
              legs: [],
            },
          ],
        }),
      );

      const result = await searchFlights("北京", "上海", "2026-07-01");

      expect(result.success).toBe(true);
      expect(result.flights).toHaveLength(1);
      expect(result.flights[0].price).toBe(580);

      // 验证调用参数
      const callArgs = mockExecFile.mock.calls[0];
      expect(callArgs[0]).toBe("trvl");
      expect(callArgs[1]).toContain("flights");
      expect(callArgs[1]).toContain("PEK");
      expect(callArgs[1]).toContain("PVG");
      expect(callArgs[1]).toContain("--format");
      expect(callArgs[1]).toContain("json");
    });

    it("搜索失败时抛出错误", async () => {
      mockSuccess(
        JSON.stringify({
          success: false,
          count: 0,
          trip_type: "one_way",
          flights: [],
          error: "no results",
        }),
      );

      await expect(searchFlights("北京", "上海", "2026-07-01")).rejects.toThrow(
        "trvl flights failed",
      );
    });

    it("CLI 执行失败时抛出错误", async () => {
      mockError(new Error("command not found"));

      await expect(searchFlights("北京", "上海", "2026-07-01")).rejects.toThrow(
        "command not found",
      );
    });

    it("支持往返航班搜索", async () => {
      mockSuccess(
        JSON.stringify({
          success: true,
          count: 1,
          trip_type: "round_trip",
          flights: [],
        }),
      );

      await searchFlights("北京", "上海", "2026-07-01", { returnDate: "2026-07-05" });

      const callArgs = mockExecFile.mock.calls[0];
      expect(callArgs[1]).toContain("--return");
      expect(callArgs[1]).toContain("2026-07-05");
    });
  });

  describe("searchHotels", () => {
    it("成功搜索酒店并返回解析后的数据", async () => {
      mockSuccess(
        JSON.stringify({
          success: true,
          count: 2,
          hotels: [
            {
              name: "测试酒店",
              hotel_id: "h1",
              rating: 4.5,
              stars: 4,
              price: 398,
              currency: "CNY",
              sources: [],
            },
          ],
        }),
      );

      const result = await searchHotels("北京", "2026-07-01", "2026-07-03");

      expect(result.success).toBe(true);
      expect(result.hotels).toHaveLength(1);
      expect(result.hotels[0].price).toBe(398);

      const callArgs = mockExecFile.mock.calls[0];
      expect(callArgs[0]).toBe("trvl");
      expect(callArgs[1]).toContain("hotels");
      expect(callArgs[1]).toContain("北京");
      expect(callArgs[1]).toContain("--checkin");
      expect(callArgs[1]).toContain("2026-07-01");
      expect(callArgs[1]).toContain("--checkout");
      expect(callArgs[1]).toContain("2026-07-03");
    });

    it("搜索失败时抛出错误", async () => {
      mockSuccess(
        JSON.stringify({
          success: false,
          count: 0,
          hotels: [],
          error: "location not found",
        }),
      );

      await expect(searchHotels("不存在城市", "2026-07-01", "2026-07-03")).rejects.toThrow(
        "trvl hotels failed",
      );
    });

    it("CLI 执行失败时抛出错误", async () => {
      mockError(new Error("timeout"));

      await expect(searchHotels("北京", "2026-07-01", "2026-07-03")).rejects.toThrow("timeout");
    });
  });
});
