/**
 * 地理编码 Provider 接口
 *
 * 所有地理编码后端（高德、Google、Nominatim）实现此接口。
 * 统一输入输出，便于测试和扩展。
 */

import type { Location } from "../../types/trip.js";

/** 地理编码结果 */
export interface GeocodeResult {
  /** 坐标（GCJ-02 格式） */
  location: Location;
  /** 引擎名称 */
  engine: string;
  /** 原始坐标（转换前，可选） */
  rawLocation?: Location;
}

/** 地理编码 Provider 接口 */
export interface GeocodeProvider {
  /** 引擎名称（如 "amap", "google", "nominatim"） */
  name: string;

  /** 是否可用（检查 API Key 等配置） */
  isAvailable(): boolean;

  /** 执行地理编码 */
  geocode(address: string, city: string): Promise<GeocodeResult>;
}
