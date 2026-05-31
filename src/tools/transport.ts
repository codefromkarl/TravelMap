/**
 * 城际交通查询 Agent Tool
 */

import { Type } from "@earendil-works/pi-ai";
import { formatTransportPrice, searchIntercityTransport } from "../services/transport-service.js";
import { defineTool } from "./define-tool.js";

export const searchIntercityTransportTool = defineTool({
  name: "search_intercity_transport",
  costTier: "cheap",
  label: "城际交通查询",
  description: "查询两个城市之间的交通方案（高铁/火车/航班），返回班次、时间、价格等详细信息",
  parameters: Type.Object({
    originCity: Type.String({ description: "出发城市名称" }),
    destCity: Type.String({ description: "目的城市名称" }),
    date: Type.String({ description: "出发日期，格式 YYYY-MM-DD" }),
    transportType: Type.Optional(
      Type.Union([Type.Literal("train"), Type.Literal("flight"), Type.Literal("all")], {
        description: "交通类型：train=火车, flight=航班, all=全部，默认 all",
      }),
    ),
  }),
  execute: async (params) => {
    const { originCity, destCity, date, transportType } = params as {
      originCity: string;
      destCity: string;
      date: string;
      transportType?: "train" | "flight" | "all";
    };
    return searchIntercityTransport({
      originCity,
      destCity,
      date,
      transportType: transportType ?? "all",
    });
  },
  format: (options, params) => {
    const { originCity, destCity, date } = params as {
      originCity: string;
      destCity: string;
      date: string;
    };

    if (options.length === 0) {
      return `未找到 ${originCity} → ${destCity}（${date}）的交通方案。`;
    }

    const summary = options
      .map((opt) => {
        const icon = opt.type === "train" ? "🚄" : opt.type === "flight" ? "✈️" : "🚌";
        const durationStr =
          opt.durationMinutes >= 60
            ? `${Math.floor(opt.durationMinutes / 60)}小时${opt.durationMinutes % 60}分`
            : `${opt.durationMinutes}分钟`;
        return `${icon} ${opt.code} | ${opt.departureTime}→${opt.arrivalTime}（${durationStr}）| ${formatTransportPrice(opt.price, opt.source)} | ${opt.departureStation}→${opt.arrivalStation}${opt.seatType ? ` | ${opt.seatType}` : ""} | 来源:${opt.source}`;
      })
      .join("\n");

    return `## ${originCity} → ${destCity} 交通方案（${date}）\n\n${summary}`;
  },
  details: (options, params) => {
    const { originCity, destCity, date } = params as {
      originCity: string;
      destCity: string;
      date: string;
    };
    return { originCity, destCity, date, options };
  },
  errorHint: (params) => {
    const { originCity, destCity } = params as { originCity: string; destCity: string };
    return `城际交通查询失败（${originCity} → ${destCity}）`;
  },
});
