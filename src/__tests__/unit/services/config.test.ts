/**
 * config.ts — validateConfig / printConfigWarnings / getDataSource 测试
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearTestConfig,
  getConfig,
  getDataSource,
  printConfigWarnings,
  setTestConfig,
  validateConfig,
} from "../../../services/config.js";

describe("config — 环境变量验证", () => {
  afterEach(() => {
    clearTestConfig();
  });

  // ── getConfig / setTestConfig / clearTestConfig 不变性 ──

  it("getConfig 默认返回 env 读取的值", () => {
    const cfg = getConfig();
    // process.env 在测试环境中通常未设置这些 key
    expect(cfg.googleMapsApiKey).toBeUndefined();
    expect(cfg.openWeatherApiKey).toBeUndefined();
  });

  it("setTestConfig 可覆盖配置", () => {
    setTestConfig({ googleMapsApiKey: "test-key" });
    expect(getConfig().googleMapsApiKey).toBe("test-key");
  });

  it("clearTestConfig 恢复默认值", () => {
    setTestConfig({ googleMapsApiKey: "test-key" });
    clearTestConfig();
    expect(getConfig().googleMapsApiKey).toBeUndefined();
  });

  // ── validateConfig ──

  it("所有 key 未配置时 valid=false，warnings 包含 4 个条目", () => {
    clearTestConfig();
    const result = validateConfig();
    expect(result.valid).toBe(false);
    expect(result.warnings).toHaveLength(4);
    expect(result.warnings.map((w) => w.envVar)).toEqual([
      "GOOGLE_MAPS_API_KEY",
      "AMAP_WEB_KEY",
      "OPENWEATHER_API_KEY",
      "QWEATHER_API_KEY",
    ]);
  });

  it("每个 warning 包含 feature 和 services 字段", () => {
    const result = validateConfig();
    const gmap = result.warnings.find((w) => w.envVar === "GOOGLE_MAPS_API_KEY")!;
    expect(gmap.feature).toContain("Google Maps");
    expect(gmap.services.length).toBeGreaterThan(0);
  });

  it("部分 key 配置后 warnings 只包含未配置项", () => {
    setTestConfig({ googleMapsApiKey: "test-key" });
    const result = validateConfig();
    expect(result.valid).toBe(false);
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings.map((w) => w.envVar)).not.toContain("GOOGLE_MAPS_API_KEY");
  });

  it("所有关键 key 配置后 valid=true，warnings 为空", () => {
    setTestConfig({
      googleMapsApiKey: "g",
      amapWebKey: "a",
      openWeatherApiKey: "o",
      qweatherApiKey: "q",
    });
    const result = validateConfig();
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ── printConfigWarnings ──

  it("缺少 key 时 console.warn 打印降级提示", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    clearTestConfig();
    printConfigWarnings();
    expect(warnSpy).toHaveBeenCalled();
    const allArgs = warnSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(allArgs).toContain("GOOGLE_MAPS_API_KEY");
    expect(allArgs).toContain("mock");
    warnSpy.mockRestore();
  });

  it("所有 key 配置后 console.log 打印成功信息", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    setTestConfig({
      googleMapsApiKey: "g",
      amapWebKey: "a",
      openWeatherApiKey: "o",
      qweatherApiKey: "q",
    });
    printConfigWarnings();
    expect(logSpy).toHaveBeenCalled();
    const msg = logSpy.mock.calls.map((c) => c.join(" ")).join("");
    expect(msg).toContain("✅");
    logSpy.mockRestore();
  });

  // ── getDataSource ──

  it("key 未配置时返回 'mock'", () => {
    clearTestConfig();
    expect(getDataSource("googleMapsApiKey")).toBe("mock");
  });

  it("key 已配置时返回 'real'", () => {
    setTestConfig({ googleMapsApiKey: "test-key" });
    expect(getDataSource("googleMapsApiKey")).toBe("real");
  });
});
