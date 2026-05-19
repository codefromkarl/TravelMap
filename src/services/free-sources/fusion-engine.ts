/**
 * 融合引擎 — 多数据源景点去重与信息综合
 *
 * 核心算法：
 *   1. 名称相似度匹配（编辑距离 + 拼音/别名映射）
 *   2. 坐标距离匹配（500m 内视为同一景点）
 *   3. 多源数据合并策略：置信度优先 + 互补填充
 *
 * 合并规则：
 *   - 名称：取置信度最高的来源
 *   - 坐标：多源加权平均（高置信度权重更大）
 *   - 评分：多源加权平均
 *   - 价格：取可信来源（去哪儿 > OTM > Wikivoyage）
 *   - 描述：拼接多源描述，去重去冗余
 */

import type { Attraction } from "../../types/trip.js";
import type { Confidence, FreeSourceAttraction, FreeSourceName } from "./types.js";

// ─── 名称相似度 ──────────────────────────────────────────

/** 常见别名映射 */
const ALIAS_MAP: Record<string, string[]> = {
  故宫: ["故宫博物院", "紫禁城"],
  颐和园: ["夏宫", "清漪园"],
  天坛: ["天坛公园", "祈年殿"],
  外滩: ["上海外滩", "The Bund", "外滩风景区"],
  东方明珠: ["东方明珠塔", "东方明珠广播电视塔"],
  豫园: ["豫园商城", "城隍庙豫园"],
  长城: ["八达岭长城", "万里长城", "慕田峪长城", "司马台长城"],
  西湖: ["杭州西湖", "西湖风景区"],
  兵马俑: ["秦始皇兵马俑", "秦始皇陵兵马俑博物馆"],
};

/** 构建别名 → 标准名的反向映射 */
function buildReverseAliasMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(ALIAS_MAP)) {
    map.set(canonical, canonical);
    for (const alias of aliases) {
      map.set(alias, canonical);
      map.set(alias.toLowerCase(), canonical);
    }
  }
  return map;
}

const REVERSE_ALIAS = buildReverseAliasMap();

/**
 * 标准化景点名称：去除后缀、空格、特殊字符
 */
function normalizeName(name: string): string {
  return name
    .replace(/[（(].+?[）)]/g, "") // 去括号内容
    .replace(/(风景区|风景名胜区|旅游区|景区|公园|博物馆|纪念馆|名胜区)$/g, "") // 去通用后缀
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * 计算两个名称的相似度 (0-1)
 */
function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);

  // 完全匹配
  if (na === nb) return 1.0;

  // 包含关系
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // 别名匹配
  const aliasA = REVERSE_ALIAS.get(na) ?? REVERSE_ALIAS.get(a);
  const aliasB = REVERSE_ALIAS.get(nb) ?? REVERSE_ALIAS.get(b);
  if (aliasA && aliasB && aliasA === aliasB) return 0.95;

  // 编辑距离相似度
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  const dist = levenshteinDistance(na, nb);
  return 1 - dist / maxLen;
}

/** Levenshtein 编辑距离 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[m][n];
}

// ─── 坐标距离 ─────────────────────────────────────────────

/** Haversine 公式计算两点距离（米） */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000; // 地球半径（米）
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const a = sinDLat * sinDLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinDLon * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── 聚类 ─────────────────────────────────────────────────

interface Cluster {
  /** 聚类中心名称 */
  canonicalName: string;
  /** 聚类中所有景点 */
  items: FreeSourceAttraction[];
}

const NAME_SIMILARITY_THRESHOLD = 0.6;
const DISTANCE_THRESHOLD_METERS = 500;

/**
 * 将来自不同数据源的景点聚类（去重）
 */
function clusterAttractions(allAttractions: FreeSourceAttraction[]): Cluster[] {
  const clusters: Cluster[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < allAttractions.length; i++) {
    if (assigned.has(i)) continue;

    const seed = allAttractions[i]!;
    const cluster: Cluster = {
      canonicalName: seed.nameZh,
      items: [seed],
    };
    assigned.add(i);

    // 寻找相似项
    for (let j = i + 1; j < allAttractions.length; j++) {
      if (assigned.has(j)) continue;

      const candidate = allAttractions[j]!;
      const nameSim = nameSimilarity(seed.nameZh, candidate.nameZh);

      // 名称匹配
      if (nameSim >= NAME_SIMILARITY_THRESHOLD) {
        cluster.items.push(candidate);
        assigned.add(j);
        continue;
      }

      // 坐标匹配（两者都有坐标时才比较）
      if (seed.location && candidate.location) {
        const dist = haversineDistance(
          seed.location.latitude,
          seed.location.longitude,
          candidate.location.latitude,
          candidate.location.longitude,
        );
        // 坐标很近 + 名称有一定相似度（放宽到 0.4）
        if (dist < DISTANCE_THRESHOLD_METERS && nameSim >= 0.4) {
          cluster.items.push(candidate);
          assigned.add(j);
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

// ─── 合并策略 ─────────────────────────────────────────────

/** 各来源的置信度权重（用于加权平均） */
const SOURCE_WEIGHT: Record<FreeSourceName, number> = {
  opentripmap: 1.0,
  qunar: 1.2,
  wikivoyage: 0.9,
  wikipedia: 0.8,
};

const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.3,
};

/** 价格可信度优先级：去哪儿 > OTM > Wikivoyage > Wikipedia */
const PRICE_PRIORITY: FreeSourceName[] = ["qunar", "opentripmap", "wikivoyage", "wikipedia"];

/**
 * 将一个聚类合并为项目内部的 Attraction 类型
 */
function mergeCluster(cluster: Cluster): Attraction {
  const items = cluster.items;

  // 1. 名称：取置信度最高的来源
  const bestName = items.reduce((best, item) =>
    CONFIDENCE_WEIGHT[item.confidence] > CONFIDENCE_WEIGHT[best.confidence] ? item : best,
  );

  // 2. 英文名：优先取有英文名的来源
  const nameEn = items.find((i) => i.nameEn && i.nameEn.length > 0)?.nameEn ?? bestName.nameZh;

  // 3. 坐标：多源加权平均
  const locationsWithCoords = items.filter((i) => i.location);
  let location: { latitude: number; longitude: number };

  if (locationsWithCoords.length > 0) {
    const totalWeight = locationsWithCoords.reduce(
      (sum, i) => sum + (SOURCE_WEIGHT[i.source] ?? 1) * CONFIDENCE_WEIGHT[i.confidence],
      0,
    );
    const lat =
      locationsWithCoords.reduce(
        (sum, i) =>
          sum +
          i.location!.latitude * (SOURCE_WEIGHT[i.source] ?? 1) * CONFIDENCE_WEIGHT[i.confidence],
        0,
      ) / totalWeight;
    const lon =
      locationsWithCoords.reduce(
        (sum, i) =>
          sum +
          i.location!.longitude * (SOURCE_WEIGHT[i.source] ?? 1) * CONFIDENCE_WEIGHT[i.confidence],
        0,
      ) / totalWeight;
    location = {
      latitude: Math.round(lat * 10000) / 10000,
      longitude: Math.round(lon * 10000) / 10000,
    };
  } else {
    location = { latitude: 0, longitude: 0 };
  }

  // 4. 描述：拼接多源描述，去重
  const descriptions = items
    .map((i) => i.description)
    .filter((d): d is string => !!d && d.length > 5);
  const uniqueDescs = [...new Set(descriptions)];
  const description =
    uniqueDescs.length > 0
      ? uniqueDescs.slice(0, 2).join("；").slice(0, 300)
      : `${bestName.nameZh}是热门旅游景点`;

  // 5. 分类：取置信度最高的分类
  const category =
    items.find((i) => i.confidence === "high" && i.category)?.category ??
    items.find((i) => i.category)?.category ??
    "景点";

  // 6. 价格：按优先级取
  let ticketPrice = 0;
  for (const source of PRICE_PRIORITY) {
    const item = items.find((i) => i.source === source && i.ticketPrice !== undefined);
    if (item?.ticketPrice !== undefined) {
      ticketPrice = item.ticketPrice;
      break;
    }
  }

  // 7. 评分：多源加权平均
  const ratings = items.filter((i) => i.rating !== undefined);
  const _rating =
    ratings.length > 0
      ? ratings.reduce((sum, i) => {
          const w = (SOURCE_WEIGHT[i.source] ?? 1) * CONFIDENCE_WEIGHT[i.confidence];
          return sum + (i.rating ?? 0) * w;
        }, 0) /
        ratings.reduce(
          (sum, i) => sum + (SOURCE_WEIGHT[i.source] ?? 1) * CONFIDENCE_WEIGHT[i.confidence],
          0,
        )
      : undefined;

  // 8. 游览时长：取中位数（默认 120 分钟）
  const durations = items
    .map((i) => i.visitDuration)
    .filter((d): d is number => d !== undefined && d > 0);
  const visitDuration =
    durations.length > 0 ? durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)]! : 120;

  // 9. 预约信息
  const reservationRequired = items.some((i) => i.reservationRequired);
  const reservationTips = items.find((i) => i.reservationTips)?.reservationTips ?? "";

  // 10. 数据来源列表
  const _sources = [...new Set(items.map((i) => i.source))];

  return {
    name: bestName.nameZh,
    nameZh: bestName.nameZh,
    nameEn,
    address: items.find((i) => i.address)?.address ?? "",
    location,
    visitDuration,
    description,
    category,
    ticketPrice,
    reservationRequired,
    reservationTips,
  };
}

// ─── 公开 API ─────────────────────────────────────────────

/**
 * 融合多数据源的景点数据
 *
 * @param sourceData 各数据源返回的景点列表
 * @returns 去重融合后的 Attraction 列表
 */
export function fuseAttractions(
  sourceData: Map<FreeSourceName, FreeSourceAttraction[]>,
): Attraction[] {
  // 1. 汇总所有景点
  const allAttractions: FreeSourceAttraction[] = [];
  for (const items of sourceData.values()) {
    allAttractions.push(...items);
  }

  if (allAttractions.length === 0) return [];

  // 2. 聚类去重
  const clusters = clusterAttractions(allAttractions);

  // 3. 合并每个聚类
  const fused = clusters.map(mergeCluster);

  // 4. 按来源数量和置信度排序（多源覆盖的排前面）
  fused.sort((a, b) => {
    // 简单排序：有评分的优先
    const aScore = (a.ticketPrice > 0 ? 1 : 0) + (a.description.length > 20 ? 1 : 0);
    const bScore = (b.ticketPrice > 0 ? 1 : 0) + (b.description.length > 20 ? 1 : 0);
    return bScore - aScore;
  });

  return fused;
}

/**
 * 获取融合统计信息（调试用）
 */
export function getFusionStats(
  sourceData: Map<FreeSourceName, FreeSourceAttraction[]>,
  fusedCount: number,
): {
  totalRaw: number;
  fusedCount: number;
  dedupRatio: number;
  bySource: Record<string, number>;
} {
  let totalRaw = 0;
  const bySource: Record<string, number> = {};

  for (const [source, items] of sourceData) {
    totalRaw += items.length;
    bySource[source] = items.length;
  }

  return {
    totalRaw,
    fusedCount,
    dedupRatio: totalRaw > 0 ? Math.round((1 - fusedCount / totalRaw) * 100) : 0,
    bySource,
  };
}

// 导出工具函数供测试使用
export { clusterAttractions, haversineDistance, nameSimilarity, normalizeName };
