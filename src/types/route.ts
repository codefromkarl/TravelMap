/** 景点内部游玩路线类型 */

// ─── 路线途经点 ──────────────────────────────────────────

import type { Location } from "./trip.js";

/** 补给点类型 */
export type SupplyPointType = "restaurant" | "cafe" | "shop" | "water" | "rest_area" | "toilet";

/** 坐标精度等级 */
export type LocationAccuracy = "exact" | "approximate" | "unknown";

/** 价格可信度来源 */
export type PriceConfidence = "api" | "scraped" | "estimate" | "user_report";

/** 景点/路线上的补给点（餐厅、商店、休息区、饮水点等） */
export interface SupplyPoint {
  /** 补给点名称 */
  name: string;
  /** 经纬度 */
  location?: Location;
  /** 坐标精度 */
  locationAccuracy?: LocationAccuracy;
  /** 补给类型 */
  type: SupplyPointType;
  /** 简要说明（如"有热食"、"仅饮料"、"景区内唯一补给"） */
  description: string;
  /** 人均消费估算（元，0 表示免费） */
  estimatedCost: number;
  /** 价格可信度 */
  priceConfidence?: PriceConfidence;
  /** 数据最后更新时间（ISO 日期） */
  lastUpdated?: string;
  /** 数据来源说明 */
  dataSource?: string;
  /** 是否推荐作为休息点 */
  isRecommended: boolean;
}

/** 路线补给策略 — 基于全路线分析生成的补给建议 */
export interface RouteSupplyStrategy {
  /** 路线上的饮水点数量 */
  waterStations: number;
  /** 路线上的休息区/座椅数量 */
  restAreas: number;
  /** 推荐的休息节点（在哪一个 waypoint 后休息多久） */
  recommendedBreaks: Array<{
    /** 在第几个途经点之后（0-based） */
    afterWaypointIndex: number;
    /** 建议休息时长（分钟） */
    duration: number;
    /** 休息点名称/位置描述 */
    location: string;
    /** 附近可用的补给 */
    availableSupply: string;
  }>;
  /** 补给警告（如"此段约40分钟无补给，建议自带水"） */
  warnings: string[];
}

/** 路线中的一个途经点（子景点/打卡点） */
export interface Waypoint {
  /** 途经点名称 */
  name: string;
  /** 经纬度 */
  location: Location;
  /** 建议停留时间（分钟） */
  visitDuration: number;
  /** 是否可选（用户可跳过） */
  isOptional: boolean;
  /** 简短描述 */
  description?: string;
  /** 该途经点附近的补给点 */
  supplyPoints?: SupplyPoint[];
}

// ─── 景点内游玩路线 ──────────────────────────────────────

/** 路线数据来源 */
export type RouteSource = "official" | "xiaohongshu" | "llm_knowledge" | "user_custom";

/** 景点内的一条游玩路线 */
export interface AttractionRoute {
  /** 路线唯一标识 */
  id: string;
  /** 路线名称，如 "西湖西线深度游" */
  name: string;
  /** 路线描述 */
  description: string;
  /** 预计总耗时（分钟） */
  duration: number;
  /** 路线途经点 */
  waypoints: Waypoint[];
  /** 路线标签（用于筛选） */
  tags: string[];
  /** 数据来源 */
  source: RouteSource;
  /** 来源元数据（如小红书笔记 ID、官方链接等） */
  sourceMeta?: {
    noteId?: string;
    author?: string;
    likes?: number;
    url?: string;
  };
  /** 路线难度：1=轻松 2=适中 3=高强度 */
  difficulty: 1 | 2 | 3;
  /** 路线补给策略 */
  supplyStrategy?: RouteSupplyStrategy;
}

// ─── 路线搜索参数 ────────────────────────────────────────

/** 路线搜索请求 */
export interface RouteSearchParams {
  /** 景点名称（如 "西湖"） */
  attractionName: string;
  /** 所在城市 */
  city: string;
  /** 用户偏好关键词（可选） */
  preferences?: string[];
}

/** 路线搜索结果 */
export interface RouteSearchResult {
  /** 景点名称 */
  attractionName: string;
  /** 候选路线列表 */
  routes: AttractionRoute[];
  /** 数据来源标识 */
  sources: string[];
}

// ─── 路线解析请求 ────────────────────────────────────────

/** 从自然语言中解析路线修改意图 */
export interface RouteEditIntent {
  /** 目标景点名称 */
  attractionName: string;
  /** 修改类型 */
  editType: "select_route" | "modify_route" | "add_stop" | "remove_stop";
  /** 用户选择的路线 ID（select_route 时） */
  selectedRouteId?: string;
  /** 偏好标签（用于筛选路线） */
  preferenceTags?: string[];
}
