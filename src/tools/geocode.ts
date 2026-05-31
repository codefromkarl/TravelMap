/**
 * 地理编码 Agent Tool — 双地图引擎版
 */

import { Type } from "@earendil-works/pi-ai";
import { dualGeocode } from "../services/dual-map-service.js";
import { defineTool } from "./define-tool.js";

export const geocodeTool = defineTool({
  name: "geocode",
  costTier: "cheap",
  label: "地理编码",
  description:
    "将地址文本转换为经纬度坐标。国内用高德地图，国外用 Google Maps，自动降级。用于景点定位和路线规划。",
  parameters: Type.Object({
    address: Type.String({ description: "地址文本，如 '故宫博物院'" }),
    city: Type.String({ description: "所在城市，如 '北京'" }),
  }),
  execute: async (params) => {
    const { address, city } = params as { address: string; city: string };
    return dualGeocode(address, city);
  },
  format: (result, params) => {
    const { address, city } = params as { address: string; city: string };
    const { location, engine, warning } = result;
    if (warning) {
      return `⚠️ ${warning}\n\n${address} 坐标: (${location.latitude}, ${location.longitude}) [${engine}]`;
    }
    return `${address} (${city}) 坐标: (${location.latitude}, ${location.longitude}) [${engine}]`;
  },
  errorHint: (params) => {
    const { address } = params as { address: string };
    return `地理编码失败（${address}）`;
  },
});
