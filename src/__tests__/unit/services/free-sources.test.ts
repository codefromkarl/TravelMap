/**
 * 免费数据源集成测试 — 验证多源搜索 + 融合去重
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  fuseAttractions,
  haversineDistance,
  nameSimilarity,
  normalizeName,
} from "../../../services/free-sources/fusion-engine.js";
import {
  clearFreeSourceCache,
  getFreeSourcesHealth,
  searchFreeSources,
} from "../../../services/free-sources/index.js";
import type { FreeSourceAttraction, FreeSourceName } from "../../../services/free-sources/types.js";

// ─── 融合引擎单元测试 ───────────────────────────────────────

describe("融合引擎", () => {
  describe("normalizeName", () => {
    it("去除通用后缀", () => {
      expect(normalizeName("西湖风景区")).toBe("西湖");
      // 博物院不在后缀列表中，由别名匹配处理
      expect(nameSimilarity("故宫", "故宫博物院")).toBeGreaterThanOrEqual(0.8);
    });

    it("去除括号内容", () => {
      expect(normalizeName("颐和园（夏宫）")).toBe("颐和园");
    });

    it("转小写去空格", () => {
      expect(normalizeName("  长城  ")).toBe("长城");
    });
  });

  describe("nameSimilarity", () => {
    it("完全匹配返回 1.0", () => {
      expect(nameSimilarity("故宫", "故宫")).toBe(1.0);
    });

    it("包含关系返回高相似度", () => {
      expect(nameSimilarity("故宫", "故宫博物院")).toBeGreaterThanOrEqual(0.8);
    });

    it("别名匹配返回高相似度", () => {
      expect(nameSimilarity("故宫", "紫禁城")).toBeGreaterThanOrEqual(0.9);
    });

    it("完全不相关返回低相似度", () => {
      expect(nameSimilarity("故宫", "外滩")).toBeLessThan(0.5);
    });
  });

  describe("haversineDistance", () => {
    it("同一点距离为 0", () => {
      expect(haversineDistance(39.9, 116.4, 39.9, 116.4)).toBe(0);
    });

    it("约 1km 距离", () => {
      // 纬度差约 0.01 度 ≈ 1.1km
      const dist = haversineDistance(39.9, 116.4, 39.91, 116.4);
      expect(dist).toBeGreaterThan(800);
      expect(dist).toBeLessThan(1200);
    });
  });

  describe("fuseAttractions", () => {
    it("空输入返回空数组", () => {
      const sourceData = new Map();
      expect(fuseAttractions(sourceData)).toEqual([]);
    });

    it("单个数据源直接转换", () => {
      const sourceData = new Map<FreeSourceName, FreeSourceAttraction[]>();
      sourceData.set("wikivoyage", [
        {
          nameZh: "故宫",
          description: "明清皇家宫殿",
          source: "wikivoyage",
          confidence: "high",
        },
      ]);

      const result = fuseAttractions(sourceData);
      expect(result).toHaveLength(1);
      expect(result[0]!.nameZh).toBe("故宫");
      expect(result[0]!.description).toContain("明清皇家宫殿");
    });

    it("多数据源同名景点合并去重", () => {
      const sourceData = new Map<FreeSourceName, FreeSourceAttraction[]>();
      sourceData.set("wikivoyage", [
        {
          nameZh: "故宫博物院",
          description: "明清皇家宫殿",
          location: { latitude: 39.9163, longitude: 116.3972 },
          category: "博物馆",
          source: "wikivoyage",
          confidence: "high",
        },
      ]);
      sourceData.set("qunar", [
        {
          nameZh: "故宫",
          description: "世界文化遗产",
          ticketPrice: 60,
          rating: 4.9,
          location: { latitude: 39.9165, longitude: 116.397 },
          category: "博物馆",
          source: "qunar",
          confidence: "high",
        },
      ]);

      const result = fuseAttractions(sourceData);
      // 两个名称匹配，应合并为 1 个
      expect(result).toHaveLength(1);
      // 应该有价格（来自 qunar）
      expect(result[0]!.ticketPrice).toBe(60);
      // 描述应合并
      expect(result[0]!.description.length).toBeGreaterThan(5);
    });

    it("不同景点不合并", () => {
      const sourceData = new Map<FreeSourceName, FreeSourceAttraction[]>();
      sourceData.set("wikivoyage", [
        {
          nameZh: "故宫",
          description: "皇家宫殿",
          source: "wikivoyage",
          confidence: "high",
        },
        {
          nameZh: "天坛",
          description: "祭天场所",
          source: "wikivoyage",
          confidence: "high",
        },
      ]);

      const result = fuseAttractions(sourceData);
      expect(result).toHaveLength(2);
    });

    it("价格按优先级取（去哪儿 > OTM）", () => {
      const sourceData = new Map<FreeSourceName, FreeSourceAttraction[]>();
      sourceData.set("opentripmap", [
        {
          nameZh: "故宫",
          ticketPrice: 50,
          source: "opentripmap",
          confidence: "medium",
        },
      ]);
      sourceData.set("qunar", [
        {
          nameZh: "故宫博物院",
          ticketPrice: 60,
          source: "qunar",
          confidence: "high",
        },
      ]);

      const result = fuseAttractions(sourceData);
      expect(result).toHaveLength(1);
      expect(result[0]!.ticketPrice).toBe(60); // qunar 优先
    });

    it("坐标加权平均", () => {
      const sourceData = new Map<FreeSourceName, FreeSourceAttraction[]>();
      sourceData.set("wikivoyage", [
        {
          nameZh: "故宫",
          location: { latitude: 39.916, longitude: 116.397 },
          source: "wikivoyage",
          confidence: "high",
        },
      ]);
      sourceData.set("opentripmap", [
        {
          nameZh: "故宫博物院",
          location: { latitude: 39.917, longitude: 116.398 },
          source: "opentripmap",
          confidence: "high",
        },
      ]);

      const result = fuseAttractions(sourceData);
      expect(result).toHaveLength(1);
      // 应在两点之间
      expect(result[0]!.location.latitude).toBeGreaterThan(39.915);
      expect(result[0]!.location.latitude).toBeLessThan(39.918);
    });

    it("任一源标记 reservationRequired 则结果为 true", () => {
      const sourceData = new Map<FreeSourceName, FreeSourceAttraction[]>();
      sourceData.set("wikivoyage", [
        {
          nameZh: "故宫",
          source: "wikivoyage",
          confidence: "high",
          reservationRequired: false,
        },
      ]);
      sourceData.set("qunar", [
        {
          nameZh: "故宫博物院",
          source: "qunar",
          confidence: "high",
          reservationRequired: true,
          reservationTips: "需提前7天预约",
        },
      ]);

      const result = fuseAttractions(sourceData);
      expect(result).toHaveLength(1);
      expect(result[0]!.reservationRequired).toBe(true);
      expect(result[0]!.reservationTips).toBe("需提前7天预约");
    });

    it("bookingUrl 从有值的数据源提取", () => {
      const sourceData = new Map<FreeSourceName, FreeSourceAttraction[]>();
      sourceData.set("wikivoyage", [
        {
          nameZh: "故宫",
          source: "wikivoyage",
          confidence: "high",
          reservationRequired: true,
        },
      ]);
      sourceData.set("qunar", [
        {
          nameZh: "故宫博物院",
          source: "qunar",
          confidence: "high",
          reservationRequired: true,
          bookingUrl: "https://piao.qunar.com/ticket/detail/123.html",
        },
      ]);

      const result = fuseAttractions(sourceData);
      expect(result).toHaveLength(1);
      expect(result[0]!.bookingUrl).toBe("https://piao.qunar.com/ticket/detail/123.html");
    });

    it("全部源未标记预约则结果为 false", () => {
      const sourceData = new Map<FreeSourceName, FreeSourceAttraction[]>();
      sourceData.set("wikivoyage", [
        {
          nameZh: "西湖",
          source: "wikivoyage",
          confidence: "high",
        },
      ]);

      const result = fuseAttractions(sourceData);
      expect(result[0]!.reservationRequired).toBe(false);
      expect(result[0]!.reservationTips).toBe("");
    });
  });
});

// ─── 各 Adapter 连通性测试（需要网络，跳过 CI） ────────────────

const hasNetwork = !process.env.MSW_ENABLED;

// eslint-disable-next-line vitest/no-disabled-tests
const describeNetwork = hasNetwork ? describe : describe.skip;

describeNetwork("免费数据源连通性", () => {
  it("各数据源健康检查", async () => {
    const health = await getFreeSourcesHealth();

    // Wikivoyage 和 Wikipedia 应该始终可达（无 Key 要求）
    expect(health.wikivoyage?.healthy).toBe(true);
    expect(health.wikipedia?.healthy).toBe(true);

    // 去哪儿：公开页面，通常可达
    // 注意：可能在某些网络环境下不可达，不算错误
    if (health.qunar?.healthy === false) {
      console.warn("去哪儿暂不可达（可能网络原因）");
    }
  }, 30_000);
});

// ─── 端到端集成测试（需要网络） ─────────────────────────────────

describeNetwork("免费数据源端到端", () => {
  beforeAll(() => {
    clearFreeSourceCache();
  });

  it("搜索北京景点并融合", async () => {
    const result = await searchFreeSources("北京", ["历史", "文化"], {
      enabledSources: ["wikivoyage", "wikipedia"], // 只测试免费无 Key 的
    });

    // 应该有结果
    expect(result.attractions.length).toBeGreaterThan(0);

    // 应该有来源标记
    expect(result.sources.length).toBeGreaterThan(0);

    // 每个景点应有必要字段
    for (const a of result.attractions) {
      expect(a.nameZh.length).toBeGreaterThan(0);
      expect(a.location).toBeDefined();
    }

    // 统计信息应有值
    expect(result.stats.totalRaw).toBeGreaterThan(0);
    expect(result.stats.fusedCount).toBeGreaterThan(0);

    console.log(
      `北京景点搜索结果: ${result.stats.totalRaw} 条原始 → ${result.stats.fusedCount} 条融合`,
    );
    console.log(`来源: ${result.sources.join(", ")}`);
    console.log(`去重率: ${result.stats.dedupRatio}%`);
    for (const a of result.attractions.slice(0, 5)) {
      console.log(`  📍 ${a.nameZh} | ${a.category} | ¥${a.ticketPrice}`);
    }
  }, 30_000);

  it("缓存生效", async () => {
    // 第一次搜索
    const r1 = await searchFreeSources("上海", undefined, {
      enabledSources: ["wikivoyage", "wikipedia"],
    });

    // 第二次搜索应命中缓存
    const r2 = await searchFreeSources("上海", undefined, {
      enabledSources: ["wikivoyage", "wikipedia"],
    });

    expect(r2.fromCache).toBe(true);
    expect(r2.attractions).toEqual(r1.attractions);
  }, 30_000);
});
