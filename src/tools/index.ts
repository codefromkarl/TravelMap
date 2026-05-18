/**
 * Agent 工具集 — 占位定义
 *
 * 每个 Tool 使用 TypeBox schema 定义参数，确保类型安全
 * 后续逐步实现各工具的 execute 函数
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

/** 景点搜索工具 */
export const searchAttractionsTool: AgentTool = {
  name: "search_attractions",
  label: "景点搜索",
  description: "搜索指定城市的景点信息，返回景点名称、描述、游览时长、门票价格等",
  parameters: Type.Object({
    city: Type.String({ description: "城市名称" }),
    preferences: Type.Optional(Type.Array(Type.String(), { description: "兴趣偏好标签" })),
    keywords: Type.Optional(Type.String({ description: "额外搜索关键词" })),
  }),
  execute: async (_toolCallId, params) => {
    const { city } = params as { city: string };
    // TODO: 接入小红书/马蜂窝等数据源
    return {
      content: [{ type: "text" as const, text: `景点搜索功能尚未实现。城市: ${city}` }],
      details: { city },
    };
  },
};

/** 天气查询工具 */
export const searchWeatherTool: AgentTool = {
  name: "search_weather",
  label: "天气查询",
  description: "查询指定城市未来几天的天气预报",
  parameters: Type.Object({
    city: Type.String({ description: "城市名称" }),
    days: Type.Optional(Type.Number({ description: "查询天数", default: 7 })),
  }),
  execute: async (_toolCallId, params) => {
    const { city } = params as { city: string };
    // TODO: 接入天气 API
    return {
      content: [{ type: "text" as const, text: `天气查询功能尚未实现。城市: ${city}` }],
      details: { city },
    };
  },
};

/** 酒店搜索工具 */
export const searchHotelsTool: AgentTool = {
  name: "search_hotels",
  label: "酒店搜索",
  description: "搜索指定城市的酒店，根据预算和位置筛选",
  parameters: Type.Object({
    city: Type.String({ description: "城市名称" }),
    budget: Type.Optional(Type.String({ description: "预算范围，如 '300-500'" })),
    style: Type.Optional(Type.String({ description: "住宿风格，如 '经济型', '精品民宿'" })),
  }),
  execute: async (_toolCallId, params) => {
    const { city } = params as { city: string };
    // TODO: 接入酒店 API
    return {
      content: [{ type: "text" as const, text: `酒店搜索功能尚未实现。城市: ${city}` }],
      details: { city },
    };
  },
};

/** 地理编码工具 */
export const geocodeTool: AgentTool = {
  name: "geocode",
  label: "地理编码",
  description: "将地址文本转换为经纬度坐标",
  parameters: Type.Object({
    address: Type.String({ description: "地址文本" }),
    city: Type.String({ description: "所在城市" }),
  }),
  execute: async (_toolCallId, params) => {
    const { address, city } = params as { address: string; city: string };
    // TODO: 接入高德/Google Maps 地理编码 API
    return {
      content: [{ type: "text" as const, text: `地理编码功能尚未实现。地址: ${address}` }],
      details: { address, city },
    };
  },
};

/** 创建全部工具 */
export function createTools(): AgentTool[] {
  return [searchAttractionsTool, searchWeatherTool, searchHotelsTool, geocodeTool];
}
