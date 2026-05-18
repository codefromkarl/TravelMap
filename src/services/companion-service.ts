/**
 * 伴游问答服务 — 基于行程数据回答用户追问
 *
 * 提供结构化查询能力：门票价格、开放时间、适合人群等。
 * Agent 可在多轮对话中调用此服务精确回答追问。
 */

import type { Attraction, TripPlan } from "../types/trip.js";

export interface TripQueryParams {
  /** 用户的问题 */
  question: string;
  /** 行程数据 */
  tripPlan: TripPlan;
}

export interface TripQueryResult {
  /** 回答 */
  answer: string;
  /** 引用的数据来源 */
  sources: string[];
  /** 是否找到相关数据 */
  found: boolean;
}

// ─── 查询关键词映射 ─────────────────────────────────────────

interface QueryIntent {
  type:
    | "ticket_price"
    | "duration"
    | "reservation"
    | "crowd"
    | "hotel_price"
    | "hotel_rating"
    | "budget"
    | "weather"
    | "transfer"
    | "general";
  keywords: string[];
}

const INTENTS: QueryIntent[] = [
  { type: "hotel_price", keywords: ["住宿", "酒店价格", "房费", "住一晚"] },
  { type: "hotel_rating", keywords: ["评分", "评价", "星级", "rating"] },
  { type: "ticket_price", keywords: ["门票", "票价", "多少钱", "费用", "价格", "ticket", "price"] },
  { type: "duration", keywords: ["多久", "多长时间", "几个小时", "游览时间", "duration"] },
  { type: "reservation", keywords: ["预约", "预订", "提前", "买票", "reservation", "book"] },
  { type: "crowd", keywords: ["带孩子", "小孩", "老人", "适合", "亲子", "family", "kid"] },
  { type: "budget", keywords: ["预算", "总花费", "总费用", "预算多少"] },
  { type: "weather", keywords: ["天气", "下雨", "温度", "穿什么", "冷不冷"] },
  { type: "transfer", keywords: ["交通", "怎么去", "怎么走", "地铁", "公交"] },
];

function detectIntent(question: string): QueryIntent["type"] {
  const lower = question.toLowerCase();
  for (const intent of INTENTS) {
    if (intent.keywords.some((kw) => lower.includes(kw))) {
      return intent.type;
    }
  }
  return "general";
}

/** 从问题中提取可能的景点名（支持部分匹配） */
function extractAttractionNames(question: string, trip: TripPlan): Attraction[] {
  const allAttractions = trip.days.flatMap((d) => d.attractions);
  return allAttractions.filter((a) => {
    // 精确匹配
    if (question.includes(a.nameZh) || question.includes(a.nameEn) || question.includes(a.name))
      return true;
    // 部分匹配：问题中包含景点名核心部分（去掉常见后缀）
    const coreZh = a.nameZh.replace(
      /(博物院|博物馆|公园|风景区|景区|乐园|寺院|庙|塔|宫|园|亭|台|楼)$/,
      "",
    );
    if (coreZh.length >= 2 && question.includes(coreZh)) return true;
    return false;
  });
}

// ─── 各类查询处理器 ──────────────────────────────────────────

function queryTicketPrice(attractions: Attraction[]): string {
  if (attractions.length === 0) return "请告诉我你想查询哪个景点的门票价格？";
  return attractions
    .map((a) => `${a.nameZh}: ¥${a.ticketPrice}${a.reservationRequired ? "（需预约）" : ""}`)
    .join("\n");
}

function queryDuration(attractions: Attraction[]): string {
  if (attractions.length === 0) return "请告诉我你想查询哪个景点的游览时间？";
  return attractions
    .map(
      (a) =>
        `${a.nameZh}: 建议游览 ${a.visitDuration} 分钟（约 ${Math.ceil(a.visitDuration / 60)} 小时）`,
    )
    .join("\n");
}

function queryReservation(attractions: Attraction[]): string {
  const withReservation = attractions.filter((a) => a.reservationRequired);
  if (withReservation.length === 0) {
    if (attractions.length > 0) {
      return attractions.map((a) => `${a.nameZh}: 无需预约，可直接前往`).join("\n");
    }
    return "请告诉我你想查询哪个景点是否需要预约？";
  }
  return withReservation
    .map(
      (a) =>
        `⚠️ ${a.nameZh}: 需要预约\n   💡 ${a.reservationTips}${a.bookingUrl ? `\n   🔗 ${a.bookingUrl}` : ""}`,
    )
    .join("\n\n");
}

function queryCrowdInfo(attractions: Attraction[]): string {
  if (attractions.length === 0) {
    return "请告诉我你关心哪个景点是否适合特定人群？";
  }
  return attractions
    .map((a) => {
      const tips: string[] = [];
      // 基于景点类别给出建议
      if (a.category === "博物馆") tips.push("适合喜欢文化的游客，儿童可能需要更多互动项目");
      if (a.category === "公园" || a.category === "自然风光") tips.push("老少皆宜，注意防晒和补水");
      if (a.category === "历史遗迹") tips.push("建议提前了解历史背景，体验更好");
      if (a.category === "主题乐园") tips.push("非常适合带孩子，注意身高限制");
      if (a.visitDuration > 180)
        tips.push(`游览时间较长（${Math.ceil(a.visitDuration / 60)}小时），注意老人和小孩的体力`);
      if (a.reservationRequired) tips.push("需要提前预约，注意抢票时间");

      return `${a.nameZh}: ${tips.length > 0 ? tips.join("；") : "适合大多数游客"}`;
    })
    .join("\n");
}

function queryHotels(trip: TripPlan, intentType: string): string {
  const hotels = trip.days
    .filter((d) => d.hotel)
    .map((d) => ({ hotel: d.hotel!, city: d.city, date: d.date }));

  if (hotels.length === 0) return "行程中暂无酒店信息。";

  if (intentType === "hotel_price") {
    return hotels
      .map(
        (h) =>
          `${h.date} ${h.city} — ${h.hotel.name}: ¥${h.hotel.estimatedCost}/晚（${h.hotel.priceRange}）`,
      )
      .join("\n");
  }
  return hotels
    .map(
      (h) =>
        `${h.date} ${h.city} — ${h.hotel.name}: ⭐${h.hotel.rating}（¥${h.hotel.estimatedCost}/晚）`,
    )
    .join("\n");
}

function queryBudget(trip: TripPlan): string {
  const budget = trip.budget;
  if (!budget) return "行程中暂无预算信息。";
  return [
    `🎫 门票: ¥${budget.totalAttractions}`,
    `🏨 住宿: ¥${budget.totalHotels}`,
    `🍜 餐饮: ¥${budget.totalMeals}`,
    `🚌 市内交通: ¥${budget.totalTransportation}`,
    `🚄 城际交通: ¥${budget.totalInterCityTransport}`,
    `💰 **总计: ¥${budget.total}**`,
  ].join("\n");
}

function queryWeather(trip: TripPlan): string {
  if (trip.weatherInfo.length === 0) return "暂无天气信息。";
  return trip.weatherInfo
    .map(
      (w) =>
        `${w.date} ${w.city}: ${w.dayWeather} ${w.dayTemp}°C / ${w.nightWeather} ${w.nightTemp}°C（${w.windDirection}${w.windPower}）`,
    )
    .join("\n");
}

function queryTransfer(trip: TripPlan): string {
  const transferDays = trip.days.filter((d) => d.isTransferDay);
  if (transferDays.length === 0) {
    const day = trip.days[0];
    return day ? `${day.city}市内交通: ${day.transportation}` : "暂无交通信息。";
  }
  return transferDays
    .map((d) => `${d.date} ${d.transferInfo || `${d.city}城际移动`}: ${d.transportation}`)
    .join("\n");
}

// ─── 主入口 ───────────────────────────────────────────────

/**
 * 查询行程数据，返回基于事实的回答
 */
export function queryTripData(params: TripQueryParams): TripQueryResult {
  const { question, tripPlan } = params;
  const intent = detectIntent(question);
  const matchedAttractions = extractAttractionNames(question, tripPlan);
  const sources: string[] = [];

  let answer = "";

  switch (intent) {
    case "ticket_price":
      answer = queryTicketPrice(matchedAttractions);
      sources.push(...matchedAttractions.map((a) => a.nameZh));
      break;
    case "duration":
      answer = queryDuration(matchedAttractions);
      sources.push(...matchedAttractions.map((a) => a.nameZh));
      break;
    case "reservation":
      answer = queryReservation(matchedAttractions);
      sources.push(...matchedAttractions.map((a) => a.nameZh));
      break;
    case "crowd":
      answer = queryCrowdInfo(matchedAttractions);
      sources.push(...matchedAttractions.map((a) => a.nameZh));
      break;
    case "hotel_price":
    case "hotel_rating":
      answer = queryHotels(tripPlan, intent);
      sources.push("hotel_data");
      break;
    case "budget":
      answer = queryBudget(tripPlan);
      sources.push("budget_data");
      break;
    case "weather":
      answer = queryWeather(tripPlan);
      sources.push("weather_data");
      break;
    case "transfer":
      answer = queryTransfer(tripPlan);
      sources.push("transportation_data");
      break;
    default:
      // 通用查询：汇总匹配到的景点信息
      if (matchedAttractions.length > 0) {
        answer = matchedAttractions
          .map(
            (a) =>
              `${a.nameZh}（${a.nameEn}）\n📍 ${a.address}\n🎫 ¥${a.ticketPrice} | ⏱ ${a.visitDuration}分钟\n${a.description}${a.reservationRequired ? `\n⚠️ 需预约: ${a.reservationTips}` : ""}`,
          )
          .join("\n\n");
        sources.push(...matchedAttractions.map((a) => a.nameZh));
      } else {
        answer = "请更具体地描述你想了解的行程细节，例如：故宫门票多少钱？酒店评分如何？";
      }
      break;
  }

  return {
    answer,
    sources: [...new Set(sources)],
    found: sources.length > 0 || matchedAttractions.length > 0,
  };
}
