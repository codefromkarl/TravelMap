/**
 * 行动链接服务 — 为行程生成景点预约、酒店比价、机票比价链接
 *
 * 当前使用 URL 模版生成搜索/预约链接，后续可接入 affiliate API。
 */

import type { ActionLink, Attraction, Hotel, TripPlan } from "../types/trip.js";

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

/** 为景点生成预约/信息链接 */
function _generateAttractionLinks(attraction: Attraction): ActionLink[] {
  const links: ActionLink[] = [];

  if (attraction.reservationRequired) {
    const officialUrl = RESERVATION_URLS[attraction.nameZh];
    if (officialUrl) {
      links.push({
        platform: "官方预约",
        url: officialUrl,
        label: `预约 ${attraction.nameZh}`,
      });
    } else {
      // 通用预约搜索
      const query = encodeURIComponent(`${attraction.nameZh} 预约 门票`);
      links.push({
        platform: "搜索",
        url: `https://www.google.com/search?q=${query}`,
        label: `查询 ${attraction.nameZh} 预约方式`,
      });
    }
  } else {
    links.push({
      platform: "信息查询",
      url: getInfoUrl(attraction),
      label: `查看 ${attraction.nameZh} 开放信息`,
    });
  }

  // 大众点评/美团链接（中国景区）
  const dianpingQuery = encodeURIComponent(attraction.nameZh);
  links.push({
    platform: "大众点评",
    url: `https://www.dianping.com/search/keyword/${dianpingQuery}`,
    label: `${attraction.nameZh} 评价`,
  });

  return links;
}

// ─── 酒店比价链接 ──────────────────────────────────────────

/** 为酒店生成比价链接 */
function generateHotelLinks(hotel: Hotel, city: string): ActionLink[] {
  const hotelName = encodeURIComponent(hotel.name);
  const cityName = encodeURIComponent(city);

  return [
    {
      platform: "Booking.com",
      url: `https://www.booking.com/searchresults.html?ss=${cityName}&q=${hotelName}`,
      label: `Booking.com 查看 ${hotel.name}`,
    },
    {
      platform: "飞猪",
      url: `https://www.fliggy.com/search.htm?keyword=${cityName}${hotelName}`,
      label: `飞猪 查看 ${hotel.name}`,
    },
    {
      platform: "去哪儿",
      url: `https://hotel.qunar.com/city/${cityName}/?q=${hotelName}`,
      label: `去哪儿 查看 ${hotel.name}`,
    },
  ];
}

// ─── 机票比价链接 ──────────────────────────────────────────

/** 为跨城市行程生成机票/火车票搜索链接 */
function generateFlightLinks(trip: TripPlan): ActionLink[] {
  if (trip.cities.length < 2) return [];

  const links: ActionLink[] = [];

  for (let i = 0; i < trip.cities.length - 1; i++) {
    const fromCity = trip.cities[i];
    const toCity = trip.cities[i + 1];

    // 查找对应的移动日日期
    const transferDay = trip.days.find((d) => d.isTransferDay && d.city === toCity);
    const date = transferDay?.date ?? trip.startDate;

    const from = encodeURIComponent(fromCity);
    const to = encodeURIComponent(toCity);

    links.push({
      platform: "Skyscanner",
      url: `https://www.skyscanner.net/transport/flights/${from}/${to}/${date}/`,
      label: `${fromCity} → ${toCity} 机票搜索`,
    });
    links.push({
      platform: "携程",
      url: `https://flights.ctrip.com/online/search?departure=${from}&destination=${to}&date=${date}`,
      label: `${fromCity} → ${toCity} 携程查票`,
    });
    links.push({
      platform: "12306",
      url: `https://kyfw.12306.cn/otn/leftTicket/init?linktypeid=dc&fs=${from}&ts=${to}&date=${date}`,
      label: `${fromCity} → ${toCity} 火车票查询`,
    });
  }

  return links;
}

// ─── 主入口 ───────────────────────────────────────────────

/**
 * 为完整行程注入行动链接
 * - 需预约景点 → 预约链接
 * - 酒店 → 比价链接（Booking/飞猪/去哪儿）
 * - 跨城市 → 交通搜索链接（Skyscanner/携程/12306）
 */
export function enrichTripWithLinks(trip: TripPlan): TripPlan {
  const enriched: TripPlan = { ...trip, days: [...trip.days] };

  // 1. 酒店比价链接
  for (const day of enriched.days) {
    if (day.hotel) {
      day.hotel = {
        ...day.hotel,
        comparisonLinks: generateHotelLinks(day.hotel, day.city),
      };
    }

    // 2. 景点预约/信息链接
    day.attractions = day.attractions.map((a) => ({
      ...a,
      bookingUrl: a.reservationRequired ? (RESERVATION_URLS[a.nameZh] ?? getInfoUrl(a)) : undefined,
    }));
  }

  // 3. 城际交通链接
  const flightLinks = generateFlightLinks(trip);
  if (flightLinks.length > 0) {
    enriched.flightLinks = flightLinks;
  }

  return enriched;
}
