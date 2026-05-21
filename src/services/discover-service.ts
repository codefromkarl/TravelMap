/**
 * Discover Service — 目的地推荐服务
 *
 * 根据用户位置和需求约束，推荐合适的旅行目的地。
 *
 * 设计路线：LLM 推理（MVP 阶段）
 *   - 将用户约束构建为 prompt
 *   - LLM 输出结构化 JSON 推荐结果
 *   - 后续可扩展为规则筛选 + LLM 推荐的混合模式
 *
 * 调用方式：
 *   const result = await discoverDestinations({
 *     currentLocation: { latitude: 31.23, longitude: 121.47, city: "上海" },
 *     constraints: { maxTravelHours: 3, themes: ["亲子"], activities: ["户外"] },
 *   });
 */

import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import type {
  DestinationRecommendation,
  DiscoverConstraints,
  DiscoverResult,
  UserLocation,
} from "../types/trip.js";
import { getLogger } from "./logger.js";

// ─── 推荐系统 Prompt ────────────────────────────────────────

const DISCOVER_SYSTEM_PROMPT = `你是「旅图」旅行推荐专家。用户不确定要去哪里，需要你根据需求推荐目的地。

## 你的知识范围
- 中国主要旅游城市及周边景点
- 各城市的特色、最佳季节、适合人群
- 城际交通方式和大致时间（高铁/自驾/大巴）
- 各城市的消费水平

## 输出要求
输出严格 JSON 格式，不要输出其他内容：

{
  "destinations": [
    {
      "city": "城市名",
      "reason": "推荐理由（一句话）",
      "matchScore": 85,
      "travelMethod": "高铁",
      "travelTime": "2小时",
      "estimatedBudget": 800,
      "highlights": ["亮点1", "亮点2"],
      "bestSeason": "春秋",
      "suitableFor": ["亲子", "情侣"]
    }
  ],
  "summary": "整体推荐摘要（2-3句话）"
}

## 推荐原则
1. 推荐 3-5 个目的地，按匹配度从高到低排序
2. matchScore 范围 0-100，基于需求匹配度、交通便利性、性价比综合评估
3. estimatedBudget 是人均预算（元），包含交通+住宿+餐饮+门票
4. highlights 是该目的地的核心亮点，3-5 个
5. bestSeason 说明最佳游玩季节
6. suitableFor 标注适合的人群类型
7. 考虑当前季节的适宜性`;

// ─── 类型定义 ──────────────────────────────────────────────

export interface DiscoverOptions {
  /** 用户当前位置 */
  location: UserLocation;
  /** 推荐约束条件 */
  constraints?: DiscoverConstraints;
  /** 出行人群（可选，影响推荐） */
  travelers?: import("../types/trip.js").TravelerProfile;
  /** 语言 */
  language?: string;
}

// ─── 主函数 ──────────────────────────────────────────────

/**
 * 推荐旅行目的地
 *
 * @param options 推荐选项
 * @returns 推荐结果
 */
export async function discoverDestinations(options: DiscoverOptions): Promise<DiscoverResult> {
  const logger = getLogger().child({ component: "discover-service" });
  const start = Date.now();

  logger.info("开始目的地推荐", {
    city: options.location.city,
    hasConstraints: !!options.constraints,
  });

  // 构建用户 prompt
  const userPrompt = buildDiscoverPrompt(options);

  // 调用 LLM
  const agent = new Agent({
    initialState: {
      systemPrompt: DISCOVER_SYSTEM_PROMPT,
      model: getModel("openai", "gpt-4o-mini"),
      thinkingLevel: "off",
      tools: [],
      messages: [],
    },
  });

  try {
    await agent.prompt(userPrompt);
    await agent.waitForIdle();

    // 解析 LLM 输出
    const messages = agent.state.messages as Array<{ role: string; content: unknown }>;
    const result = parseDiscoverResult(messages, options.location);

    if (result) {
      logger.info("目的地推荐完成", {
        duration: Date.now() - start,
        destinationCount: result.destinations.length,
      });
      return result;
    }

    // 解析失败时返回空结果
    logger.warn("LLM 输出解析失败，返回空结果");
    return {
      userLocation: options.location,
      destinations: [],
      summary: "抱歉，暂时无法生成推荐，请稍后重试。",
    };
  } catch (err) {
    logger.error("目的地推荐失败", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ─── Prompt 构建 ──────────────────────────────────────────

function buildDiscoverPrompt(options: DiscoverOptions): string {
  const lines: string[] = ["请根据我的需求推荐旅行目的地：", ""];

  // 位置信息
  const loc = options.location;
  if (loc.city) {
    lines.push(
      `**我的位置**: ${loc.city}（坐标: ${loc.latitude.toFixed(2)}, ${loc.longitude.toFixed(2)}）`,
    );
  } else {
    lines.push(`**我的位置**: 坐标 ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`);
  }

  // 约束条件
  const c = options.constraints;
  if (c) {
    lines.push("");
    if (c.maxTravelHours) {
      lines.push(`**最大交通时间**: ${c.maxTravelHours}小时以内`);
    }
    if (c.maxBudget) {
      lines.push(`**预算上限**: ${c.maxBudget}元/人`);
    }
    if (c.duration) {
      const durationMap: Record<string, string> = {
        "day-trip": "一日游",
        weekend: "周末2天",
        "3-5days": "3-5天小长假",
        flexible: "时间灵活",
      };
      lines.push(`**行程时长**: ${durationMap[c.duration] ?? c.duration}`);
    }
    if (c.themes && c.themes.length > 0) {
      lines.push(`**主题偏好**: ${c.themes.join("、")}`);
    }
    if (c.activities && c.activities.length > 0) {
      lines.push(`**活动类型**: ${c.activities.join("、")}`);
    }
  }

  // 出行人群
  if (options.travelers) {
    lines.push("");
    const t = options.travelers;
    const parts: string[] = [];
    if (t.adults > 0) parts.push(`${t.adults}位成人`);
    if (t.seniors > 0) parts.push(`${t.seniors}位老人`);
    if (t.children > 0) parts.push(`${t.children}位儿童`);
    if (t.infants > 0) parts.push(`${t.infants}位婴幼儿`);
    if (t.pregnant) parts.push("有孕妇");
    if (t.mobilityImpaired) parts.push("有行动不便者");
    lines.push(`**出行人群**: ${parts.join("、")}`);
  }

  // 额外要求
  if (options.constraints?.themes?.includes("亲子")) {
    lines.push(
      "",
      "**特别要求**: 请推荐适合带孩子游玩的目的地，优先考虑有儿童友好设施、安全性高、趣味性强的景点。",
    );
  }

  return lines.join("\n");
}

// ─── 结果解析 ──────────────────────────────────────────────

function parseDiscoverResult(
  messages: Array<{ role: string; content: unknown }>,
  userLocation: UserLocation,
): DiscoverResult | null {
  // 从最后一条 assistant 消息中提取 JSON
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role !== "assistant") continue;

    const text = extractText(msg);
    if (!text) continue;

    try {
      // 提取 JSON
      const jsonMatch =
        text.match(/```(?:json)?\s*\n?([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]!);
        if (Array.isArray(parsed.destinations)) {
          return {
            userLocation,
            destinations: parsed.destinations as DestinationRecommendation[],
            summary: parsed.summary ?? "",
          };
        }
      }
    } catch {
      // 继续尝试
    }
  }
  return null;
}

/** 从 pi-agent 消息中提取文本 */
function extractText(msg: { role: string; content: unknown }): string | null {
  if (!msg.content) return null;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((c: unknown) => (c as Record<string, unknown>).type === "text")
      .map((c: unknown) => (c as Record<string, unknown>).text as string)
      .join("\n");
  }
  if (typeof msg.content === "string") return msg.content;
  return null;
}
