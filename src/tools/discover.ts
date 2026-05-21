/**
 * 目的地推荐 Agent Tool
 *
 * 根据用户位置和需求约束，推荐合适的旅行目的地。
 * 调用 discover-service 获取推荐结果。
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { discoverDestinations } from "../services/discover-service.js";
import type { DiscoverConstraints, UserLocation } from "../types/trip.js";

export const discoverDestinationsTool: AgentTool = {
  name: "discover_destinations",
  label: "目的地推荐",
  description:
    "当用户不确定去哪里时，根据用户位置、时间、预算和偏好推荐合适的旅行目的地。适用于「不知道去哪玩」「推荐周边游」「周末去哪好」等场景。",
  parameters: Type.Object({
    location: Type.Object(
      {
        latitude: Type.Number({ description: "用户当前纬度" }),
        longitude: Type.Number({ description: "用户当前经度" }),
        city: Type.Optional(Type.String({ description: "用户当前城市名（可选）" })),
      },
      { description: "用户当前位置" },
    ),
    constraints: Type.Optional(
      Type.Object(
        {
          maxTravelHours: Type.Optional(
            Type.Number({ description: "最大交通时间（小时），如 2 表示 2 小时内能到达" }),
          ),
          maxBudget: Type.Optional(Type.Number({ description: "人均预算上限（元）" })),
          duration: Type.Optional(
            Type.Union(
              [
                Type.Literal("day-trip"),
                Type.Literal("weekend"),
                Type.Literal("3-5days"),
                Type.Literal("flexible"),
              ],
              { description: "行程时长类型" },
            ),
          ),
          themes: Type.Optional(
            Type.Array(Type.String(), {
              description: "主题标签，如：亲子、情侣、独行、团建、老年",
            }),
          ),
          activities: Type.Optional(
            Type.Array(Type.String(), {
              description: "活动类型，如：户外、文化、美食、购物、休闲",
            }),
          ),
        },
        { description: "推荐约束条件" },
      ),
    ),
    travelers: Type.Optional(
      Type.Object(
        {
          adults: Type.Number({ description: "成人数" }),
          seniors: Type.Optional(Type.Number({ description: "老人数" })),
          children: Type.Optional(Type.Number({ description: "儿童数" })),
          infants: Type.Optional(Type.Number({ description: "婴幼儿数" })),
          pregnant: Type.Optional(Type.Boolean({ description: "是否有孕妇" })),
          mobilityImpaired: Type.Optional(Type.Boolean({ description: "是否有行动不便者" })),
        },
        { description: "出行人群画像（可选）" },
      ),
    ),
  }),
  execute: async (_toolCallId, params) => {
    const { location, constraints, travelers } = params as {
      location: UserLocation;
      constraints?: DiscoverConstraints;
      travelers?: import("../types/trip.js").TravelerProfile;
    };

    try {
      const result = await discoverDestinations({
        location,
        constraints,
        travelers,
      });

      if (result.destinations.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "抱歉，暂时没有找到符合条件的目的地推荐。请尝试放宽条件后重试。",
            },
          ],
          details: result,
        };
      }

      // 格式化为可读输出
      const lines = ["## 🗺️ 目的地推荐", "", result.summary, ""];

      for (let i = 0; i < result.destinations.length; i++) {
        const d = result.destinations[i]!;
        lines.push(
          `### ${i + 1}. ${d.city}（匹配度 ${d.matchScore}%）`,
          "",
          `**推荐理由**: ${d.reason}`,
          `**交通**: ${d.travelMethod} ${d.travelTime}`,
          `**预算**: ¥${d.estimatedBudget}/人`,
          `**最佳季节**: ${d.bestSeason}`,
          `**适合人群**: ${d.suitableFor.join("、")}`,
          `**亮点**: ${d.highlights.join("、")}`,
          "",
        );
      }

      lines.push("---", "💡 **想了解哪个城市的详细行程？告诉我城市名即可。**");

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        details: result,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: `目的地推荐失败: ${errorMessage}`,
          },
        ],
        details: { error: errorMessage },
      };
    }
  },
};
