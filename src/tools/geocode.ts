/**
 * 地理编码 Agent Tool — 双地图引擎版
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { dualGeocode } from "../services/dual-map-service.js";

export const geocodeTool: AgentTool & { costTier: "cheap" } = {
  name: "geocode",
  costTier: "cheap",
  label: "地理编码",
  description:
    "将地址文本转换为经纬度坐标。国内用高德地图，国外用 Google Maps，自动降级。用于景点定位和路线规划。",
  parameters: Type.Object({
    address: Type.String({ description: "地址文本，如 '故宫博物院'" }),
    city: Type.String({ description: "所在城市，如 '北京'" }),
  }),
  execute: async (_toolCallId, params) => {
    const { address, city } = params as { address: string; city: string };

    try {
      const { location, engine, warning } = await dualGeocode(address, city);

      const text = warning
        ? `⚠️ ${warning}\n\n${address} 坐标: (${location.latitude}, ${location.longitude}) [${engine}]`
        : `${address} (${city}) 坐标: (${location.latitude}, ${location.longitude}) [${engine}]`;

      return {
        content: [{ type: "text" as const, text }],
        details: { address, city, location, engine, warning },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: `地理编码失败（${address}）：${msg}`,
          },
        ],
        details: { address, city, error: msg },
      };
    }
  },
};
