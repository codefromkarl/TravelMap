/**
 * Discover Service 单元测试
 *
 * 测试策略：
 *   - Mock Agent 类，避免调用真实 LLM
 *   - 测试 prompt 构建逻辑
 *   - 测试结果解析逻辑
 *   - 测试边界情况
 */

import { describe, expect, it, vi } from "vitest";
import { discoverDestinations } from "../../../services/discover-service.js";
import type { DiscoverResult } from "../../../types/trip.js";

// Mock pi-agent-core
vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: vi.fn().mockImplementation(() => ({
    prompt: vi.fn().mockResolvedValue(undefined),
    waitForIdle: vi.fn().mockResolvedValue(undefined),
    state: {
      messages: [],
    },
  })),
}));

// Mock pi-ai
vi.mock("@earendil-works/pi-ai", () => ({
  getModel: vi.fn().mockReturnValue("mock-model"),
}));

// Mock logger
vi.mock("../../../services/logger.js", () => ({
  getLogger: vi.fn().mockReturnValue({
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("discover-service", () => {
  describe("discoverDestinations", () => {
    it("should return empty result when LLM output is invalid", async () => {
      // Mock Agent to return invalid JSON
      const { Agent } = await import("@earendil-works/pi-agent-core");
      vi.mocked(Agent).mockImplementation(
        () =>
          ({
            prompt: vi.fn().mockResolvedValue(undefined),
            waitForIdle: vi.fn().mockResolvedValue(undefined),
            state: {
              messages: [
                {
                  role: "assistant",
                  content: "Invalid JSON response",
                },
              ],
            },
          }) as unknown as InstanceType<typeof Agent>,
      );

      const result = await discoverDestinations({
        location: { latitude: 31.23, longitude: 121.47, city: "上海" },
      });

      expect(result.destinations).toHaveLength(0);
      expect(result.summary).toContain("抱歉");
    });

    it("should parse valid LLM output correctly", async () => {
      const mockResponse: DiscoverResult = {
        userLocation: { latitude: 31.23, longitude: 121.47, city: "上海" },
        destinations: [
          {
            city: "杭州",
            reason: "西湖风景优美",
            matchScore: 90,
            travelMethod: "高铁",
            travelTime: "1小时",
            estimatedBudget: 800,
            highlights: ["西湖", "灵隐寺"],
            bestSeason: "春秋",
            suitableFor: ["情侣", "亲子"],
          },
        ],
        summary: "为您推荐以下目的地",
      };

      // Mock Agent to return valid JSON
      const { Agent } = await import("@earendil-works/pi-agent-core");
      vi.mocked(Agent).mockImplementation(
        () =>
          ({
            prompt: vi.fn().mockResolvedValue(undefined),
            waitForIdle: vi.fn().mockResolvedValue(undefined),
            state: {
              messages: [
                {
                  role: "assistant",
                  content: JSON.stringify(mockResponse),
                },
              ],
            },
          }) as unknown as InstanceType<typeof Agent>,
      );

      const result = await discoverDestinations({
        location: { latitude: 31.23, longitude: 121.47, city: "上海" },
        constraints: {
          maxTravelHours: 2,
          themes: ["亲子"],
          activities: ["户外"],
        },
      });

      expect(result.destinations).toHaveLength(1);
      expect(result.destinations[0]!.city).toBe("杭州");
      expect(result.destinations[0]!.matchScore).toBe(90);
      expect(result.summary).toBe("为您推荐以下目的地");
    });

    it("should handle JSON in code block", async () => {
      const mockResponse = {
        destinations: [
          {
            city: "苏州",
            reason: "园林文化",
            matchScore: 85,
            travelMethod: "高铁",
            travelTime: "30分钟",
            estimatedBudget: 600,
            highlights: ["拙政园"],
            bestSeason: "春秋",
            suitableFor: ["文化爱好者"],
          },
        ],
        summary: "推荐苏州",
      };

      const { Agent } = await import("@earendil-works/pi-agent-core");
      vi.mocked(Agent).mockImplementation(
        () =>
          ({
            prompt: vi.fn().mockResolvedValue(undefined),
            waitForIdle: vi.fn().mockResolvedValue(undefined),
            state: {
              messages: [
                {
                  role: "assistant",
                  content: "```json\n" + JSON.stringify(mockResponse) + "\n```",
                },
              ],
            },
          }) as unknown as InstanceType<typeof Agent>,
      );

      const result = await discoverDestinations({
        location: { latitude: 31.23, longitude: 121.47, city: "上海" },
      });

      expect(result.destinations).toHaveLength(1);
      expect(result.destinations[0]!.city).toBe("苏州");
    });

    it("should pass constraints to prompt correctly", async () => {
      const { Agent } = await import("@earendil-works/pi-agent-core");
      const promptSpy = vi.fn().mockResolvedValue(undefined);

      vi.mocked(Agent).mockImplementation(
        () =>
          ({
            prompt: promptSpy,
            waitForIdle: vi.fn().mockResolvedValue(undefined),
            state: {
              messages: [
                {
                  role: "assistant",
                  content: JSON.stringify({ destinations: [], summary: "无推荐" }),
                },
              ],
            },
          }) as unknown as InstanceType<typeof Agent>,
      );

      await discoverDestinations({
        location: { latitude: 39.9, longitude: 116.4, city: "北京" },
        constraints: {
          maxTravelHours: 3,
          maxBudget: 1000,
          duration: "weekend",
          themes: ["情侣"],
          activities: ["美食", "购物"],
        },
        travelers: {
          adults: 2,
          seniors: 0,
          children: 0,
          infants: 0,
          pregnant: false,
          mobilityImpaired: false,
        },
      });

      // Verify prompt was called with correct content
      expect(promptSpy).toHaveBeenCalledOnce();
      const prompt = promptSpy.mock.calls[0]![0] as string;
      expect(prompt).toContain("北京");
      expect(prompt).toContain("3小时以内");
      expect(prompt).toContain("1000元/人");
      expect(prompt).toContain("周末2天");
      expect(prompt).toContain("情侣");
      expect(prompt).toContain("美食、购物");
      expect(prompt).toContain("2位成人");
    });
  });
});
