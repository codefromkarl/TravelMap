/**
 * analytics.js 单元测试
 *
 * 覆盖：
 *   - EVENT 语义化事件常量
 *   - track 批量（上限 20 条）与 8 秒节流
 *   - 本地开发（localhost）静默不上报
 *   - 不可序列化 meta / 非法 type 容错丢弃
 *   - 生产环境 initAnalytics 上报 page_view
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let module;
let fetchMock;

// 每个用例重新加载模块，重置模块级 pending/enabled 状态
beforeEach(async () => {
  vi.resetModules();
  fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);
  module = await import("../infra/analytics.js");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 解析 fetch 调用中的请求体 */
function parseBodies() {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
}

describe("analytics.js", () => {
  describe("EVENT 常量", () => {
    it("导出语义化事件名", () => {
      expect(module.EVENT.SHARE_CLICK).toBe("share_click");
      expect(module.EVENT.SHARE_GENERATED).toBe("share_generated");
      expect(module.EVENT.THEME_TOGGLE).toBe("theme_toggle");
    });
  });

  describe("track 批量", () => {
    it("队列上限 20 条，超出的旧事件被丢弃", async () => {
      vi.useFakeTimers({ now: 0 });
      for (let i = 0; i < 25; i++) {
        module.track("evt-" + i, { n: i });
      }
      await vi.advanceTimersByTimeAsync(8000);

      expect(fetchMock).toHaveBeenCalledTimes(20);
      const bodies = parseBodies();
      // 只保留最近 20 条：evt-5 ~ evt-24
      expect(bodies[0].type).toBe("evt-5");
      expect(bodies[19].type).toBe("evt-24");
      expect(bodies[0].meta).toEqual({ n: 5 });
    });

    it("请求格式：POST /api/track，JSON body 含 type 与 meta", async () => {
      vi.useFakeTimers({ now: 0 });
      module.track(module.EVENT.SHARE_CLICK, { type: "image" });
      await vi.advanceTimersByTimeAsync(8000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/track");
      expect(init.method).toBe("POST");
      expect(init.credentials).toBe("same-origin");
      expect(init.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(init.body)).toEqual({
        type: "share_click",
        meta: { type: "image" },
      });
    });
  });

  describe("track 节流", () => {
    it("8 秒窗口内合并为一次冲刷，窗口结束后再次冲刷", async () => {
      vi.useFakeTimers({ now: 0 });
      module.track("a", {});
      module.track("b", {});
      await vi.advanceTimersByTimeAsync(7999);
      expect(fetchMock).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1); // t=8000 首次冲刷
      expect(fetchMock).toHaveBeenCalledTimes(2);

      module.track("c", {});
      await vi.advanceTimersByTimeAsync(7999);
      expect(fetchMock).toHaveBeenCalledTimes(2); // 仍被节流

      await vi.advanceTimersByTimeAsync(1); // t=16000 第二次冲刷
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(parseBodies().map((b) => b.type)).toEqual(["a", "b", "c"]);
    });
  });

  describe("本地静默", () => {
    it("localhost 下 initAnalytics 禁用全部上报", async () => {
      Object.defineProperty(window, "location", {
        value: { hostname: "localhost" },
        configurable: true,
      });
      vi.useFakeTimers({ now: 0 });

      module.initAnalytics();
      module.track(module.EVENT.SHARE_CLICK, { type: "image" });
      await vi.advanceTimersByTimeAsync(16000);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("容错丢弃", () => {
    it("不可序列化 meta（BigInt / 循环引用）不抛异常、不上报", async () => {
      vi.useFakeTimers({ now: 0 });
      expect(() => module.track("big", { big: BigInt(9007199254740991) })).not.toThrow();
      const circular = {};
      circular.self = circular;
      expect(() => module.track("circular", circular)).not.toThrow();
      await vi.advanceTimersByTimeAsync(16000);
      expect(fetchMock).not.toHaveBeenCalled();

      // 丢弃后队列保持干净，后续合法事件仍可正常上报
      module.track("valid", { ok: true });
      await vi.advanceTimersByTimeAsync(8000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).type).toBe("valid");
    });

    it("非法 type（null/对象/空串）静默丢弃", async () => {
      vi.useFakeTimers({ now: 0 });
      expect(() => module.track(null)).not.toThrow();
      expect(() => module.track({})).not.toThrow();
      expect(() => module.track("")).not.toThrow();
      expect(() => module.track("   ")).not.toThrow();
      expect(() => module.track(undefined)).not.toThrow();
      await vi.advanceTimersByTimeAsync(16000);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("number/boolean 类型的 type 归一化为字符串", async () => {
      vi.useFakeTimers({ now: 0 });
      module.track(123, {});
      module.track(true, {});
      await vi.advanceTimersByTimeAsync(8000);
      expect(parseBodies().map((b) => b.type)).toEqual(["123", "true"]);
    });

    it("非对象 meta（字符串/数组/null）不上报 meta 字段", async () => {
      vi.useFakeTimers({ now: 0 });
      module.track("evt", "plain string");
      module.track("evt", [1, 2, 3]);
      module.track("evt", null);
      await vi.advanceTimersByTimeAsync(8000);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      for (const body of parseBodies()) {
        expect(body).not.toHaveProperty("meta");
      }
    });
  });

  describe("生产环境初始化", () => {
    it("非 localhost 上报一次 page_view 并注册 pagehide 冲刷", async () => {
      Object.defineProperty(window, "location", {
        value: { hostname: "example.com" },
        configurable: true,
      });
      const listenerSpy = vi.spyOn(window, "addEventListener");
      vi.useFakeTimers({ now: 0 });

      module.initAnalytics();
      await vi.advanceTimersByTimeAsync(8000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe("page_view");
      expect(body.meta).toMatchObject({ language: "en-US" });
      expect(listenerSpy).toHaveBeenCalledWith("pagehide", expect.any(Function));
    });
  });
});
