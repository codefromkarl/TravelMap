import { Type } from "@earendil-works/pi-ai";
import { getAmapGeoKey, CITY_CENTERS } from '../context.js?v=4';

const WALK_SPEED_MPM = 5000 / 60;

// ─── Haversine 距离计算 ──────────────────────────────────
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── 解析高德 POI ────────────────────────────────────────
function amapPoiToHotel(poi, centerLat, centerLng) {
  const distance = parseFloat(poi.distance ?? "0");
  const rating = parseFloat(poi.biz_ext?.rating ?? poi.rating ?? "0");
  const price = parseFloat(poi.biz_ext?.cost ?? "0");

  let lat = 0, lng = 0;
  if (poi.location) {
    const [lngStr, latStr] = poi.location.split(",");
    lat = parseFloat(latStr);
    lng = parseFloat(lngStr);
  }

  const tags = poi.tag
    ? poi.tag.split(";").map(t => t.trim()).filter(Boolean)
    : [];

  return {
    name: poi.name,
    rating: isNaN(rating) ? 0 : rating,
    price: isNaN(price) ? 0 : price,
    priceRange: isNaN(price) || price <= 0 ? "暂无报价" : `¥${price}`,
    address: poi.address ?? "",
    location: { latitude: lat, longitude: lng },
    distance,
    walkMinutes: Math.ceil(distance / WALK_SPEED_MPM),
    transitAccessible: distance < 8000,
    tags,
  };
}

// ─── 预算解析 ────────────────────────────────────────────
function parseBudget(budget) {
  if (!budget) return { min: null, max: null };
  const m = budget.match(/(\d+)\s*[-~]\s*(\d+)/);
  if (m) return { min: +m[1], max: +m[2] };
  const n = parseInt(budget, 10);
  if (!isNaN(n)) return { min: 0, max: n };
  return { min: null, max: null };
}

function filterByBudget(hotels, budget) {
  const { min, max } = parseBudget(budget);
  if (min == null && max == null) return hotels;
  return hotels.filter(h => {
    if (h.price <= 0) return true;
    if (min != null && h.price < min) return false;
    if (max != null && h.price > max) return false;
    return true;
  });
}

// ─── 酒店搜索工具 ──────────────────────────────────────
export const searchHotelsTool = {
  name: "search_hotels",
  label: "酒店搜索",
  description: "搜索指定城市或景点附近的酒店，支持按预算筛选。返回酒店名称、价格、评分、距离等真实信息。",
  parameters: Type.Object({
    city: Type.String({ description: "城市名称" }),
    latitude: Type.Optional(Type.Number({ description: "搜索中心点纬度" })),
    longitude: Type.Optional(Type.Number({ description: "搜索中心点经度" })),
    budget: Type.Optional(Type.String({ description: "预算范围，如 '200-400'" })),
    style: Type.Optional(Type.String({ description: "住宿风格: 经济型 | 精品民宿 | 豪华" })),
  }),
  execute: async (_id, params) => {
    const { city, latitude, longitude, budget, style } = params;
    const apiKey = getAmapGeoKey();

    if (!apiKey) {
      return {
        content: [{ type: "text", text: `## ${city}酒店搜索\n\n> ⚠️ 无高德 API Key，无法搜索真实酒店数据` }],
        details: { city, source: "none" },
      };
    }

    // 确定搜索中心点
    let centerLat, centerLng;
    if (latitude != null && longitude != null) {
      centerLat = latitude;
      centerLng = longitude;
    } else if (CITY_CENTERS[city]) {
      [centerLat, centerLng] = CITY_CENTERS[city];
    } else {
      return {
        content: [{ type: "text", text: `## ${city}酒店搜索\n\n> ⚠️ 未知城市坐标，请提供经纬度` }],
        details: { city, source: "none" },
      };
    }

    // 根据风格设置搜索关键词
    let keywords;
    if (style?.includes("民宿")) keywords = "民宿";
    else if (style?.includes("青旅") || style?.includes("青年")) keywords = "青年旅舍";

    // 搜索高德 POI
    const radius = 5000;
    const locStr = `${centerLng},${centerLat}`;
    const url = new URL("https://restapi.amap.com/v3/place/around");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("location", locStr);
    url.searchParams.set("types", "10"); // 住宿服务大类
    url.searchParams.set("radius", String(radius));
    url.searchParams.set("sortrule", "distance");
    url.searchParams.set("offset", "20");
    url.searchParams.set("page", "1");
    url.searchParams.set("extensions", "all");
    if (keywords) url.searchParams.set("keywords", keywords);

    try {
      const resp = await fetch(url.toString());
      const data = await resp.json();

      if (data.status !== "1" || !Array.isArray(data.pois) || data.pois.length === 0) {
        return {
          content: [{ type: "text", text: `## ${city}酒店搜索\n\n> 未找到附近酒店，试试扩大搜索范围` }],
          details: { city, source: "amap-empty" },
        };
      }

      let hotels = data.pois.map(poi => amapPoiToHotel(poi, centerLat, centerLng));
      hotels = filterByBudget(hotels, budget);
      hotels.sort((a, b) => a.distance - b.distance);
      hotels = hotels.slice(0, 10);

      const lines = hotels.map((h, i) => {
        const tagsStr = h.tags.length > 0 ? ` · ${h.tags.slice(0, 3).join("/")}` : "";
        const transitStr = h.transitAccessible ? " 🚌公交可达" : "";
        return (
          `${i + 1}. 🏨 **${h.name}**\n` +
          `   📍 ${(h.distance / 1000).toFixed(1)}km · 🚶 步行约${h.walkMinutes}分钟${transitStr}\n` +
          `   💰 ${h.priceRange}/晚 · ⭐ ${h.rating}${tagsStr}\n` +
          (h.address ? `   📫 ${h.address}` : "")
        );
      }).join("\n\n");

      const styleLabel = style ? ` · ${style}` : "";
      const budgetLabel = budget ? ` · 预算 ¥${budget}` : "";

      return {
        content: [{
          type: "text",
          text: `## ${city}酒店搜索结果（真实数据）${styleLabel}${budgetLabel}\n\n数据源: 高德地图 | 搜索半径: 5km | 共 ${hotels.length} 家\n\n${lines}`
        }],
        details: { city, hotels, source: "amap" },
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `## ${city}酒店搜索\n\n> ⚠️ 搜索失败: ${err.message}` }],
        details: { city, source: "error", error: err.message },
      };
    }
  },
};
