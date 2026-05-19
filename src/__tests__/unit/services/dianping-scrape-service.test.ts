/**
 * dianping-scrape-service.ts 单测 — 验证大众点评抓取框架
 */

import { describe, expect, it } from "vitest";
import {
  batchScrapeDianping,
  scrapeDianpingMerchant,
} from "../../../services/dianping-scrape-service.js";

// ─── scrapeDianpingMerchant ─────────────────────────────

describe("scrapeDianpingMerchant", () => {
  it("当前版本应返回 null（未实现）", async () => {
    const result = await scrapeDianpingMerchant("星巴克", "上海");
    expect(result).toBeNull();
  });

  it("应接受可选 config 参数", async () => {
    const result = await scrapeDianpingMerchant("星巴克", "上海", {
      timeout: 3000,
      requestIntervalMs: 1000,
    });
    expect(result).toBeNull();
  });
});

// ─── batchScrapeDianping ─────────────────────────────────

describe("batchScrapeDianping", () => {
  it("空列表应返回空 Map", async () => {
    const result = await batchScrapeDianping([]);
    expect(result.size).toBe(0);
  });

  it("单个商户应返回一条结果", async () => {
    const result = await batchScrapeDianping(
      [{ keyword: "瑞幸咖啡", city: "北京" }],
      { requestIntervalMs: 0 }, // 测试时无间隔
    );
    expect(result.size).toBe(1);
    expect(result.get("北京:瑞幸咖啡")).toBeNull();
  });

  it("多个商户应返回多条结果", async () => {
    const result = await batchScrapeDianping(
      [
        { keyword: "瑞幸咖啡", city: "北京" },
        { keyword: "麦当劳", city: "上海" },
      ],
      { requestIntervalMs: 0 },
    );
    expect(result.size).toBe(2);
    expect(result.has("北京:瑞幸咖啡")).toBe(true);
    expect(result.has("上海:麦当劳")).toBe(true);
  });

  it("key 格式应为 city:keyword", async () => {
    const result = await batchScrapeDianping(
      [{ keyword: "必胜客", city: "广州" }],
      { requestIntervalMs: 0 },
    );
    const keys = [...result.keys()];
    expect(keys[0]).toBe("广州:必胜客");
  });
});
