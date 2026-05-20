/**
 * 景点路线服务 — 为大型景区提供多条游玩路线选择
 *
 * 数据源分层：
 *   L1 官方路线  — 静态知识库，覆盖知名景区的经典路线
 *   L2 小红书    — 从真实游记中提取用户推荐路线
 *   L3 LLM 降级  — 以上均无数据时由 LLM 知识补全
 *
 * 融合策略：官方路线为基础，小红书路线做补充和交叉验证。
 */

import type {
  AttractionRoute,
  RiskFactor,
  RouteRiskAssessment,
  RouteSearchParams,
  RouteSearchResult,
} from "../types/route.js";
import { dualGeocode } from "./dual-map-service.js";
import { fillWaypointElevations } from "./elevation-service.js";
import { getLogger } from "./logger.js";
import type { UGCReview } from "./multi-source-service.js";
import { getMockRoutes, getOfficialRoutes } from "./route-official-data.js";
import { searchXhsNotes } from "./xhs-service.js";

// ─── 缓存 ─────────────────────────────────────────────────

interface CacheEntry {
  result: RouteSearchResult;
  timestamp: number;
}

const CACHE_TTL = 30 * 60 * 1000; // 30 分钟
const routeCache = new Map<string, CacheEntry>();

/** 清除路线缓存（测试用） */
export function clearRouteCache(): void {
  routeCache.clear();
}

function cacheKey(params: RouteSearchParams): string {
  return `${params.city}:${params.attractionName}:${params.preferences?.join(",") ?? ""}`;
}

// ─── L2: 小红书路线提取 ───────────────────────────────────

/**
 * 根据路线的途经点和已知信息，自动计算风险评估
 * 用于 UGC 路线和 mock 路线的风险降级
 */
export function calculateRouteRisk(route: AttractionRoute): RouteRiskAssessment {
  const waypoints = route.waypoints;
  let totalElevationGain = 0;
  let totalElevationLoss = 0;
  let maxElevation = 0;
  let minElevation = 0;
  const hasElevation = waypoints.some((wp) => wp.elevation !== undefined);

  if (hasElevation) {
    const elevations = waypoints.map((wp) => wp.elevation ?? 0);
    maxElevation = Math.max(...elevations);
    minElevation = Math.min(...elevations);
    for (let i = 1; i < elevations.length; i++) {
      const diff = elevations[i] - elevations[i - 1];
      if (diff > 0) totalElevationGain += diff;
      if (diff < 0) totalElevationLoss += Math.abs(diff);
    }
  }

  // 估算步行距离：粗略按每段 waypoint 间 500m-1km
  const estimatedDistanceKm = waypoints.length * 0.6;
  // 估算步数：每公里约 1300 步
  const estimatedSteps = Math.round(estimatedDistanceKm * 1300);
  // 估算卡路里：体重 65kg，平地约 50kcal/km，每 100m 爬升额外 +8kcal
  const elevationFactor = (totalElevationGain / 100) * 8;
  const estimatedCalories = Math.round(estimatedDistanceKm * 50 + elevationFactor);

  // 风险因子推断
  const riskFactors: RiskFactor[] = [];

  // 爬升风险
  if (totalElevationGain > 800) {
    riskFactors.push({
      type: "elevation",
      level: "high",
      description: `累计爬升约${totalElevationGain}米，对体力和心肺功能要求极高`,
    });
  } else if (totalElevationGain > 300) {
    riskFactors.push({
      type: "elevation",
      level: "medium",
      description: `累计爬升约${totalElevationGain}米，建议量力而行`,
    });
  }

  // 台阶/地形风险
  const hasStairs = waypoints.some((wp) => wp.terrainType === "stairs");
  if (hasStairs) {
    riskFactors.push({
      type: "terrain",
      level: "medium",
      description: "路线包含台阶路段，对膝关节有一定压力",
    });
  }

  // 距离风险
  if (route.duration > 360) {
    riskFactors.push({
      type: "distance",
      level: "medium",
      description: `路线总耗时约${Math.round(route.duration / 60)}小时，体力消耗较大`,
    });
  }

  // 难度映射到风险等级
  let riskLevel: 1 | 2 | 3 = route.difficulty;
  // 如果有高海拔爬升，风险等级至少为 2
  if (totalElevationGain > 500 && riskLevel < 2) riskLevel = 2;
  if (totalElevationGain > 1000 && riskLevel < 3) riskLevel = 3;

  // 特殊人群适宜性（基于风险等级推断）
  const suitability: import("../types/route.js").RouteSuitability = {
    seniors: riskLevel >= 3 ? "not_recommended" : riskLevel >= 2 ? "caution" : "suitable",
    children: riskLevel >= 3 ? "not_recommended" : riskLevel >= 2 ? "caution" : "suitable",
    pregnant: riskLevel >= 2 ? "not_recommended" : "suitable",
    mobilityImpaired: riskLevel >= 2 ? "not_recommended" : "suitable",
  };

  return {
    riskLevel,
    totalElevationGain: Math.round(totalElevationGain),
    totalElevationLoss: Math.round(totalElevationLoss),
    maxElevation: Math.round(maxElevation),
    minElevation: Math.round(minElevation),
    estimatedCalories: Math.max(estimatedCalories, 100),
    estimatedSteps: Math.max(estimatedSteps, 1000),
    riskFactors,
    suitability,
  };
}

/** 从小红书笔记中提取路线信息 */
function extractRoutesFromUGC(attractionName: string, reviews: UGCReview[]): AttractionRoute[] {
  const routes: AttractionRoute[] = [];

  for (const review of reviews) {
    const text = `${review.summary} ${review.tips}`;
    // 检测是否包含路线关键词
    const routeKeywords = [
      "路线",
      "线路",
      "线路推荐",
      "打卡路线",
      "不走回头路",
      "一日游",
      "半日游",
    ];
    const isRouteNote = routeKeywords.some((kw) => text.includes(kw));
    if (!isRouteNote) continue;

    // 提取途经点：匹配"→"/"👉"/"→"/箭头分隔的景点序列
    const waypointPatterns = [
      /(?:从|起点)[：:]?\s*(\S+?)\s*(?:→|👉|->|➡️|到|前往)\s*/g,
      /(?:→|👉|->|➡️)\s*(\S+?)(?:\s*(?:→|👉|->|➡️)|$)/g,
    ];

    const waypoints: string[] = [];
    for (const pattern of waypointPatterns) {
      let match: RegExpExecArray | null = pattern.exec(text);
      while (match !== null) {
        const name = match[1]
          ?.replace(/[，。、！？\s]/g, "")
          .replace(/[【】《》「」""'']/g, "")
          .trim();
        if (name && name.length >= 2 && name.length <= 15) {
          waypoints.push(name);
        }
        match = pattern.exec(text);
      }
    }

    // 也尝试提取 "第X站"/"第X个" 模式
    const stationPattern =
      /(?:第[一二三四五六七八九十\d]+(?:站|个|处|步|站景点))[：:是为]?\s*([^\s，。！？]{2,15})/g;
    let stationMatch: RegExpExecArray | null = stationPattern.exec(text);
    while (stationMatch !== null) {
      const name = stationMatch[1]?.trim();
      if (name && !waypoints.includes(name)) {
        waypoints.push(name);
      }
      stationMatch = stationPattern.exec(text);
    }

    if (waypoints.length < 2) continue;

    // 从 UGC 文本中提取补给相关信息
    const supplyWarnings: string[] = [];
    if (/自带水|没有水|无水|缺水/.test(text)) {
      supplyWarnings.push("游记提醒此路线需自带饮水");
    }
    if (/没有餐厅|无餐饮|吃饭困难/.test(text)) {
      supplyWarnings.push("此路线附近餐饮较少，建议自备干粮");
    }

    // 生成路线
    const baseRoute: AttractionRoute = {
      id: `xhs_${(review.meta as Record<string, unknown>)?.noteId ?? Date.now()}`,
      name: `${attractionName}小红书推荐路线`,
      description: review.summary.slice(0, 200),
      duration: waypoints.length * 60, // 粗略估算
      waypoints: waypoints.map((wp) => ({
        name: wp,
        location: { latitude: 0, longitude: 0 }, // 需要后续地理编码填充
        visitDuration: 40,
        isOptional: false,
        description: undefined,
        supplyPoints: undefined,
      })),
      tags: extractRouteTags(text),
      source: "xiaohongshu",
      sourceMeta: {
        noteId: (review.meta as Record<string, unknown>)?.noteId as string | undefined,
        author: (review.meta as Record<string, unknown>)?.author as string | undefined,
        likes: (review.meta as Record<string, unknown>)?.likes as number | undefined,
      },
      difficulty: waypoints.length > 6 ? 3 : waypoints.length > 4 ? 2 : 1,
      supplyStrategy: {
        waterStations: /水|饮料|便利店/.test(text) ? 1 : 0,
        restAreas: /休息|坐下|长椅|茶室/.test(text) ? 1 : 0,
        recommendedBreaks:
          waypoints.length > 4
            ? [
                {
                  afterWaypointIndex: Math.floor(waypoints.length / 2),
                  duration: 15,
                  location: waypoints[Math.floor(waypoints.length / 2)] ?? "中途",
                  availableSupply: "附近可能有便利店",
                },
              ]
            : [],
        warnings:
          supplyWarnings.length > 0
            ? supplyWarnings
            : ["小红书路线补给信息有限，建议自备饮水和零食"],
      },
    };

    // 根据内容推断更精确的名称
    if (text.includes("北线") || text.includes("北线")) baseRoute.name = `${attractionName}北线`;
    else if (text.includes("西线") || text.includes("西线"))
      baseRoute.name = `${attractionName}西线`;
    else if (text.includes("南线") || text.includes("南线"))
      baseRoute.name = `${attractionName}南线`;
    else if (text.includes("环湖") || text.includes("绕湖"))
      baseRoute.name = `${attractionName}环湖线`;
    else if (text.includes("深度") || text.includes("小众"))
      baseRoute.name = `${attractionName}深度游`;
    else if (text.includes("亲子") || text.includes("带娃"))
      baseRoute.name = `${attractionName}亲子路线`;
    else if (text.includes("精华") || text.includes("经典"))
      baseRoute.name = `${attractionName}经典路线`;

    // 自动生成风险评估
    baseRoute.riskAssessment = calculateRouteRisk(baseRoute);

    routes.push(baseRoute);
  }

  return routes;
}

/** 从文本中提取路线标签 */
function extractRouteTags(text: string): string[] {
  const tagMap: Record<string, string> = {
    轻松: "轻松",
    不累: "轻松",
    休闲: "轻松",
    省力: "轻松",
    小众: "小众",
    冷门: "小众",
    经典: "经典",
    精华: "经典",
    深度: "深度",
    全程: "全景",
    环湖: "环湖",
    绕湖: "环湖",
    亲子: "亲子",
    带娃: "亲子",
    拍照: "拍照",
    出片: "拍照",
    打卡: "打卡",
    步行: "步行",
    骑行: "骑行",
    游船: "游船",
    免费: "免费",
  };

  const tags: string[] = [];
  for (const [keyword, tag] of Object.entries(tagMap)) {
    if (text.includes(keyword) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags.length > 0 ? tags : ["经典"];
}

// ─── 路线去重 ─────────────────────────────────────────────

/** 去除内容高度重复的路线（waypoint 重合度 > 70%） */
function deduplicateRoutes(routes: AttractionRoute[]): AttractionRoute[] {
  const result: AttractionRoute[] = [];

  for (const route of routes) {
    const wpNames = route.waypoints.map((w) => w.name);
    const isDuplicate = result.some((existing) => {
      const existingNames = existing.waypoints.map((w) => w.name);
      const overlap = wpNames.filter((n) => existingNames.includes(n));
      return overlap.length / Math.max(wpNames.length, 1) > 0.7;
    });
    if (!isDuplicate) {
      result.push(route);
    }
  }

  return result;
}

// ─── 主入口 ───────────────────────────────────────────────

/**
 * 搜索景点游玩路线
 *
 * 策略：
 * 1. 先查官方路线（静态知识库）
 * 2. 再查小红书 UGC 路线
 * 3. 合并去重后返回
 * 4. 以上均无数据时，返回 mock 路线
 */
export async function searchAttractionRoutes(
  params: RouteSearchParams,
): Promise<RouteSearchResult> {
  // 检查缓存
  const key = cacheKey(params);
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { ...cached.result };
  }

  const sources: string[] = [];
  const allRoutes: AttractionRoute[] = [];

  // ── L1: 官方路线 ──
  const officialRoutes = getOfficialRoutes(params.attractionName, params.city);
  if (officialRoutes.length > 0) {
    allRoutes.push(...officialRoutes);
    sources.push("official");
  }

  // ── L2: 小红书路线 ──
  try {
    const keyword = `${params.city} ${params.attractionName} 游玩路线`;
    const reviews = await searchXhsNotes({ keyword, city: params.city });

    if (reviews.length > 0) {
      const xhsRoutes = extractRoutesFromUGC(params.attractionName, reviews);
      if (xhsRoutes.length > 0) {
        allRoutes.push(...xhsRoutes);
        sources.push("xiaohongshu");
      }
    }
  } catch (err) {
    getLogger()
      .child({ component: "route-service" })
      .warn("小红书路线搜索失败", { error: err instanceof Error ? err.message : err });
  }

  // ── L3: Mock 降级 ──
  if (allRoutes.length === 0) {
    const mockRoutes = getMockRoutes(params.attractionName, params.city);
    if (mockRoutes.length > 0) {
      allRoutes.push(...mockRoutes);
      sources.push("mock");
    }
  }

  // 去重
  const routes = deduplicateRoutes(allRoutes);

  // 按偏好筛选（如果有偏好关键词）
  let filteredRoutes = routes;
  if (params.preferences?.length) {
    const prefLower = params.preferences.map((p) => p.toLowerCase());
    const matched = routes.filter((r) =>
      prefLower.some(
        (pref) =>
          r.tags.some((t) => t.toLowerCase().includes(pref)) ||
          r.name.toLowerCase().includes(pref) ||
          r.description.toLowerCase().includes(pref),
      ),
    );
    // 如果筛选后有结果则用筛选后的，否则保留全部
    if (matched.length > 0) {
      filteredRoutes = matched;
    }
  }

  // 根据人群画像过滤（在最后一步应用，确保不破坏偏好筛选结果）
  if (params.travelers) {
    filteredRoutes = filterRoutesByTravelers(filteredRoutes, params.travelers);
  }

  const result: RouteSearchResult = {
    attractionName: params.attractionName,
    routes: filteredRoutes,
    sources: [...new Set(sources)],
  };

  // 写入缓存
  routeCache.set(key, { result, timestamp: Date.now() });

  return result;
}

// ─── 路线意图解析 ────────────────────────────────────────

/** 检查一个景点是否为大型景区（可能有多条路线） */
const COMPLEX_ATTRACTIONS = new Set([
  "西湖",
  "西湖风景名胜区",
  "杭州西湖",
  "故宫",
  "故宫博物院",
  "颐和园",
  "圆明园",
  "圆明园遗址公园",
  "黄山",
  "黄山风景区",
  "张家界",
  "张家界国家森林公园",
  "九寨沟",
  "九寨沟风景区",
  "鼓浪屿",
  "泰山",
  "泰山风景区",
  "武夷山",
  "千岛湖",
  "峨眉山",
  "青城山",
  "都江堰",
]);

/** 判断景点是否为大型景区 */
export function isComplexAttraction(name: string): boolean {
  // 精确匹配
  if (COMPLEX_ATTRACTIONS.has(name)) return true;
  // 模糊匹配：名称包含大型景区关键词
  const fuzzyKeywords = ["风景区", "风景名胜区", "国家森林公园", "地质公园"];
  return fuzzyKeywords.some((kw) => name.includes(kw));
}

/**
 * 从用户指令中解析路线修改意图
 *
 * 支持的表达式：
 *   "西湖换成西线"
 *   "西湖走小众路线"
 *   "西湖不要雷峰塔，换成太子湾"
 */
export function parseRouteEditIntent(
  instruction: string,
  attractionNames: string[],
): { attractionName: string; preferenceTags: string[] } | null {
  // 匹配景点名 + 路线修改关键词
  for (const name of attractionNames) {
    if (!instruction.includes(name)) continue;

    // 提取路线偏好标签
    const tags: string[] = [];
    const tagHints: Record<string, string> = {
      西线: "小众",
      北线: "经典",
      南线: "轻松",
      环湖: "环湖",
      深度: "深度",
      小众: "小众",
      经典: "经典",
      轻松: "轻松",
      不累: "轻松",
      精华: "经典",
      亲子: "亲子",
      带娃: "亲子",
      拍照: "拍照",
      出片: "拍照",
      步行: "步行",
      骑行: "骑行",
      游船: "游船",
    };

    for (const [keyword, tag] of Object.entries(tagHints)) {
      if (instruction.includes(keyword) && !tags.includes(tag)) {
        tags.push(tag);
      }
    }

    if (tags.length > 0 || isComplexAttraction(name)) {
      return { attractionName: name, preferenceTags: tags };
    }
  }

  return null;
}

// ─── 路线修改 ─────────────────────────────────────────────

import type { Attraction, TravelerProfile } from "../types/trip.js";

/**
 * 根据出行人群画像，检查路线是否适合
 *
 * 返回 { suitable: boolean, reasons: string[] }
 * - suitable: 是否适合当前人群
 * - reasons: 不适合的原因（如不适合则返回具体原因）
 */
export function checkRouteSuitability(
  route: AttractionRoute,
  travelers?: TravelerProfile,
): { suitable: boolean; reasons: string[] } {
  if (!travelers || !route.riskAssessment) {
    return { suitable: true, reasons: [] };
  }

  const suit = route.riskAssessment.suitability;
  const reasons: string[] = [];

  if (travelers.seniors > 0 && suit.seniors === "not_recommended") {
    reasons.push("老人不适宜");
  }
  if (travelers.children > 0 && suit.children === "not_recommended") {
    reasons.push("儿童不适宜");
  }
  if (travelers.pregnant && suit.pregnant === "not_recommended") {
    reasons.push("孕妇不适宜");
  }
  if (travelers.mobilityImpaired && suit.mobilityImpaired === "not_recommended") {
    reasons.push("行动不便者不适宜");
  }

  // 若带婴幼儿，自动排除高风险路线（riskLevel === 3）
  if (travelers.infants > 0 && route.riskAssessment.riskLevel === 3) {
    reasons.push("婴幼儿不适宜高风险路线");
  }

  return { suitable: reasons.length === 0, reasons };
}

/**
 * 根据人群画像过滤路线列表
 *
 * 返回过滤后的路线列表。如果所有路线都被过滤掉，则返回原列表（避免无数据）。
 */
export function filterRoutesByTravelers(
  routes: AttractionRoute[],
  travelers?: TravelerProfile,
): AttractionRoute[] {
  if (!travelers) return routes;

  const filtered = routes.filter((r) => checkRouteSuitability(r, travelers).suitable);
  // 如果全部过滤掉，保留低风险路线作为兜底
  return filtered.length > 0
    ? filtered
    : routes.filter((r) => (r.riskAssessment?.riskLevel ?? 1) <= 2);
}

/**
 * 为景点附加路线数据
 *
 * 对大型景区（如西湖）自动搜索候选路线并附加到 Attraction 上。
 * 对非大型景区直接返回原景点。
 *
 * @param travelers 可选的出行人群画像，用于自动过滤不适合的路线
 */
export async function enrichAttractionWithRoutes(
  attraction: Attraction,
  city: string,
  travelers?: TravelerProfile,
): Promise<Attraction> {
  if (!isComplexAttraction(attraction.nameZh) && !isComplexAttraction(attraction.name)) {
    return attraction;
  }

  const name = attraction.nameZh || attraction.name;
  try {
    const result = await searchAttractionRoutes({
      attractionName: name,
      city,
    });

    if (result.routes.length > 0) {
      const enrichedRoutes = await Promise.all(
        result.routes.map(async (route) => {
          let waypoints = [...route.waypoints];

          // 1. 非官方路线：坐标填充
          if (route.source !== "official") {
            await Promise.all(
              waypoints.map(async (wp, i) => {
                if (wp.location.latitude !== 0 || wp.location.longitude !== 0) return;
                try {
                  const { location } = await dualGeocode(wp.name, city, { timeout: 3000 });
                  waypoints[i] = { ...wp, location };
                } catch {
                  // 地理编码失败时保持默认坐标
                }
              }),
            );
          }

          // 2. 所有路线：批量查询海拔（优先填充无海拔数据的 waypoint）
          waypoints = await fillWaypointElevations(waypoints);

          // 3. 补充/重新计算风险评估（有真实海拔后更精确）
          const enrichedRoute = { ...route, waypoints };
          enrichedRoute.riskAssessment = calculateRouteRisk(enrichedRoute);

          return enrichedRoute;
        }),
      );

      // 根据人群画像过滤不适合的路线
      const suitableRoutes = travelers
        ? filterRoutesByTravelers(enrichedRoutes, travelers)
        : enrichedRoutes;

      // 确保选中的路线在过滤后的列表中
      const selectedRouteId = suitableRoutes.some((r) => r.id === enrichedRoutes[0].id)
        ? enrichedRoutes[0].id
        : suitableRoutes[0]?.id;

      return {
        ...attraction,
        routes: suitableRoutes,
        selectedRouteId,
      };
    }
  } catch (err) {
    getLogger()
      .child({ component: "route-service" })
      .warn("景点路线搜索失败", { name, error: err instanceof Error ? err.message : err });
  }

  return attraction;
}

/**
 * 切换景点的选中路线
 *
 * 返回更新后的 Attraction。如果路线 ID 不存在则返回原景点。
 */
export function switchAttractionRoute(attraction: Attraction, routeId: string): Attraction {
  if (!attraction.routes?.some((r) => r.id === routeId)) {
    return attraction;
  }

  const selectedRoute = attraction.routes.find((r) => r.id === routeId)!;

  return {
    ...attraction,
    selectedRouteId: routeId,
    // 用路线数据更新景点耗时和描述
    visitDuration: selectedRoute.duration,
    description: selectedRoute.description,
  };
}
