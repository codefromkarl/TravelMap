/**
 * 免费数据源统一类型定义
 *
 * 所有免费数据源 adapter 的输出统一为 FreeSourceAttraction，
 * 再由 fusion-engine 去重融合为项目内部 Attraction 类型。
 */

/** 免费数据源名称 */
export type FreeSourceName = "wikivoyage" | "opentripmap" | "qunar" | "wikipedia";

/** 数据源置信度 — 用于融合时的优先级排序 */
export type Confidence = "high" | "medium" | "low";

/** 统一的免费数据源景点结构 */
export interface FreeSourceAttraction {
  /** 景点名称（中文） */
  nameZh: string;
  /** 景点名称（英文/拼音，可选） */
  nameEn?: string;
  /** 地址 */
  address?: string;
  /** 坐标 */
  location?: { latitude: number; longitude: number };
  /** 简介/描述 */
  description?: string;
  /** 分类（如：博物馆、公园、历史遗迹） */
  category?: string;
  /** 门票价格（元），0 表示免费 */
  ticketPrice?: number;
  /** 建议游览时长（分钟） */
  visitDuration?: number;
  /** 评分（1-5） */
  rating?: number;
  /** 是否需要预约 */
  reservationRequired?: boolean;
  /** 预约提示 */
  reservationTips?: string;
  /** 购票/预约链接（来自数据源） */
  bookingUrl?: string;
  /** 图片 URL */
  imageUrl?: string;
  /** 数据来源 */
  source: FreeSourceName;
  /** 置信度 */
  confidence: Confidence;
  /** 原始数据（保留用于 debug） */
  raw?: unknown;
}

/** 数据源 adapter 的通用接口 */
export interface FreeSourceAdapter {
  /** 数据源名称 */
  name: FreeSourceName;
  /** 搜索景点 */
  search(params: FreeSourceSearchParams): Promise<FreeSourceAttraction[]>;
  /** 健康检查 */
  healthCheck(): Promise<boolean>;
}

/** 搜索参数 */
export interface FreeSourceSearchParams {
  city: string;
  /** 城市坐标（某些数据源需要） */
  cityLocation?: { latitude: number; longitude: number };
  preferences?: string[];
  keywords?: string;
}

/** 融合后的景点（包含多源数据） */
export interface FusedAttraction {
  /** 景点名称（取最可信来源的名称） */
  nameZh: string;
  /** 英文名 */
  nameEn: string;
  /** 地址 */
  address: string;
  /** 坐标（多源平均或取最可信） */
  location: { latitude: number; longitude: number };
  /** 简介（多源合并） */
  description: string;
  /** 分类 */
  category: string;
  /** 门票价格（取最可信来源） */
  ticketPrice: number;
  /** 游览时长（取中位数） */
  visitDuration: number;
  /** 评分（多源加权平均） */
  rating?: number;
  /** 是否需预约 */
  reservationRequired: boolean;
  /** 预约提示 */
  reservationTips: string;
  /** 购票/预约链接（来自数据源） */
  bookingUrl?: string;
  /** 数据来源列表 */
  sources: FreeSourceName[];
  /** 各来源的原始数据 */
  sourceData: Map<FreeSourceName, FreeSourceAttraction>;
  /** 综合置信度 */
  confidence: Confidence;
}
