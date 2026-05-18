/**
 * 行动链接服务 — 为行程生成景点预约、酒店比价、机票比价链接
 *
 * 双层策略：
 *   1. trvl 可用时：获取实时价格 + 预订链接
 *   2. fallback：URL 模板生成搜索链接
 */

import type { ActionLink, Attraction, Hotel, TripPlan } from "../types/trip.js";
import { isTrvlAvailable, searchFlights, searchHotels } from "./trvl-service.js";

// ─── 景点预约链接 ──────────────────────────────────────────

/** 需要预约的景点官方预约链接数据库（景点名 → 官方预约 URL） */
const RESERVATION_URLS: Record<string, string> = {
  故宫博物院: "https://www.dpm.org.cn/visit/ticket.html",
  八达岭长城: "https://www.badaling.cn/",
  国家博物馆: "https://www.chnmuseum.cn/",
  秦始皇兵马俑: "https://www.bmy.com.cn/",
  上海博物馆: "https://www.shanghaimuseum.net/",
  上海迪士尼乐园: "https://www.shanghaidisneyresort.com/",
  布达拉宫: "https://www.potalapalace.cn/",
  中国国家图书馆: "https://www.nlc.cn/",
};

/** 为非预约景点生成「查询开放时间」链接 */
function getInfoUrl(attraction: Attraction): string {
  const query = encodeURIComponent(`${attraction.nameZh} ${attraction.address}`);
  return `https://www.google.com/search?q=${query}`;
}

// ─── 酒店比价链接（URL 模板 fallback）──────────────────────

function generateTemplateHotelLinks(hotel: Hotel, city: string): ActionLink[] {
  const hotelName = encodeURIComponent(hotel.name);
  const cityName = encodeURIComponent(city);

  return [
    {
      platform: "Booking.com",
      url: `https://www.booking.com/searchresults.html?ss=${cityName}&q=${hotelName}`,
      label: `Booking.com 查看 ${hotel.name}`,
      source: "template",
    },
    {
      platform: "飞猪",
      url: `https://www.fliggy.com/search.htm?keyword=${cityName}${hotelName}`,
      label: `飞猪 查看 ${hotel.name}`,
      source: "template",
    },
    {
      platform: "去哪儿",
      url: `https://hotel.qunar.com/city/${cityName}/?q=${hotelName}`,
      label: `去哪儿 查看 ${hotel.name}`,
      source: "template",
    },
  ];
}

/** 通过 trvl 获取酒店实时比价链接 */
async function generateTrvlHotelLinks(
  hotel: Hotel,
  city: string,
  checkin: string,
  checkout: string,
): Promise<ActionLink[]> {
  const result = await searchHotels(city, checkin, checkout);
  const links: ActionLink[] = [];

  // 找到与酒店名匹配的结果
  const matched = result.hotels.find(
    (h) => h.name.includes(hotel.name) || hotel.name.includes(h.name),
  );

  if (matched && matched.sources.length > 0) {
    // 使用 trvl 多平台比价数据
    for (const src of matched.sources) {
      if (src.booking_url) {
        links.push({
          platform: src.provider,
          url: src.booking_url,
          label: `${src.provider} ${hotel.name} ¥${src.price}`,
          price: src.price,
          currency: src.currency,
          source: "trvl",
        });
      }
    }
  } else if (result.hotels.length > 0) {
    // 没精确匹配，取前 3 个最便宜酒店的预订链接
    for (const h of result.hotels.slice(0, 3)) {
      if (h.booking_url) {
        links.push({
          platform: "Google Hotels",
          url: h.booking_url,
          label: `${h.name} ¥${h.price}/晚`,
          price: h.price,
          currency: h.currency,
          source: "trvl",
        });
      }
    }
  }

  return links;
}

// ─── 航班比价链接（URL 模板 fallback）──────────────────────

function generateTemplateFlightLinks(trip: TripPlan): ActionLink[] {
  if (trip.cities.length < 2) return [];

  const links: ActionLink[] = [];

  for (let i = 0; i < trip.cities.length - 1; i++) {
    const fromCity = trip.cities[i];
    const toCity = trip.cities[i + 1];
    const transferDay = trip.days.find((d) => d.isTransferDay && d.city === toCity);
    const date = transferDay?.date ?? trip.startDate;

    const from = encodeURIComponent(fromCity);
    const to = encodeURIComponent(toCity);

    links.push({
      platform: "Skyscanner",
      url: `https://www.skyscanner.net/transport/flights/${from}/${to}/${date}/`,
      label: `${fromCity} → ${toCity} 机票搜索`,
      source: "template",
    });
    links.push({
      platform: "携程",
      url: `https://flights.ctrip.com/online/search?departure=${from}&destination=${to}&date=${date}`,
      label: `${fromCity} → ${toCity} 携程查票`,
      source: "template",
    });
    links.push({
      platform: "12306",
      url: `https://kyfw.12306.cn/otn/leftTicket/init?linktypeid=dc&fs=${from}&ts=${to}&date=${date}`,
      label: `${fromCity} → ${toCity} 火车票查询`,
      source: "template",
    });
  }

  return links;
}

/** 通过 trvl 获取航班实时比价链接 */
async function generateTrvlFlightLinks(trip: TripPlan): Promise<ActionLink[]> {
  if (trip.cities.length < 2) return [];

  const links: ActionLink[] = [];

  for (let i = 0; i < trip.cities.length - 1; i++) {
    const fromCity = trip.cities[i];
    const toCity = trip.cities[i + 1];
    const transferDay = trip.days.find((d) => d.isTransferDay && d.city === toCity);
    const date = transferDay?.date ?? trip.startDate;

    try {
      const result = await searchFlights(fromCity, toCity, date);

      // 取最便宜的航班
      if (result.flights.length > 0) {
        const cheapest = result.flights[0];
        if (cheapest.booking_url) {
          links.push({
            platform: "实时航班",
            url: cheapest.booking_url,
            label: `${fromCity} → ${toCity} ¥${cheapest.price}`,
            price: cheapest.price,
            currency: cheapest.currency,
            source: "trvl",
          });
        }
      }
    } catch {
      // 单段失败不阻塞其他段，fallback 在外层处理
    }
  }

  return links;
}

// ─── 主入口 ───────────────────────────────────────────────

/**
 * 为完整行程注入行动链接（同步版本，仅使用 URL 模板）
 * 保留用于不需要异步的场景和向后兼容
 */
export function enrichTripWithLinks(trip: TripPlan): TripPlan {
  const enriched: TripPlan = { ...trip, days: [...trip.days] };

  for (const day of enriched.days) {
    if (day.hotel) {
      day.hotel = {
        ...day.hotel,
        comparisonLinks: generateTemplateHotelLinks(day.hotel, day.city),
      };
    }

    day.attractions = day.attractions.map((a) => ({
      ...a,
      bookingUrl: a.reservationRequired ? (RESERVATION_URLS[a.nameZh] ?? getInfoUrl(a)) : undefined,
    }));
  }

  const flightLinks = generateTemplateFlightLinks(trip);
  if (flightLinks.length > 0) {
    enriched.flightLinks = flightLinks;
  }

  return enriched;
}

/**
 * 为完整行程注入行动链接（增强版，优先使用 trvl 实时数据）
 *
 * 双层策略：
 *   1. trvl 可用 → 获取实时价格 + 预订链接
 *   2. trvl 不可用/失败 → fallback 到 URL 模板
 */
export async function enrichTripWithLiveLinks(trip: TripPlan): Promise<TripPlan> {
  const enriched: TripPlan = { ...trip, days: [...trip.days] };

  // 景点预约（不依赖 trvl，始终使用本地数据）
  for (const day of enriched.days) {
    day.attractions = day.attractions.map((a) => ({
      ...a,
      bookingUrl: a.reservationRequired ? (RESERVATION_URLS[a.nameZh] ?? getInfoUrl(a)) : undefined,
    }));
  }

  // 检测 trvl 是否可用
  const trvlAvailable = await isTrvlAvailable();

  // 酒店比价链接
  for (const day of enriched.days) {
    if (day.hotel) {
      let links: ActionLink[];

      if (trvlAvailable) {
        try {
          // 计算入住/退房日期
          const checkin = day.date;
          const nextDay = enriched.days.find((d) => d.dayIndex === day.dayIndex + 1);
          const checkout = nextDay?.date ?? day.date;

          links = await generateTrvlHotelLinks(day.hotel, day.city, checkin, checkout);
          // trvl 没返回有效链接时 fallback
          if (links.length === 0) {
            links = generateTemplateHotelLinks(day.hotel, day.city);
          }
        } catch {
          links = generateTemplateHotelLinks(day.hotel, day.city);
        }
      } else {
        links = generateTemplateHotelLinks(day.hotel, day.city);
      }

      day.hotel = { ...day.hotel, comparisonLinks: links };
    }
  }

  // 城际交通链接
  if (trip.cities.length >= 2) {
    let flightLinks: ActionLink[];

    if (trvlAvailable) {
      try {
        const liveLinks = await generateTrvlFlightLinks(trip);
        flightLinks = liveLinks.length > 0 ? liveLinks : generateTemplateFlightLinks(trip);
      } catch {
        flightLinks = generateTemplateFlightLinks(trip);
      }
    } else {
      flightLinks = generateTemplateFlightLinks(trip);
    }

    enriched.flightLinks = flightLinks;
  }

  return enriched;
}
