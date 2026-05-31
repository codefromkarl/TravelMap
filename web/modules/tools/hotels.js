/**
 * 酒店搜索 Agent Tool — 通过后端代理调用高德 API
 *
 * 不在前端持有 API Key，所有请求通过 /api/amap 代理
 */

import { Type } from "@earendil-works/pi-ai";
import { CITY_CENTERS } from '../infra/context.js';

const WALK_SPEED_MPM = 5000 / 60;

// ─── 推荐区域（无 API 时使用）──────────────────────────
function getRecommendAreas(city) {
  const areas = {
    '杭州': ['西湖区（西湖景区周边）', '上城区（河坊街/南宋御街）', '下城区（武林广场）'],
    '北京': ['东城区（故宫/天安门）', '西城区（什刹海）', '朝阳区（三里屯）'],
    '上海': ['黄浦区（外滩/南京路）', '浦东新区（陆家嘴）', '徐汇区（衡山路）'],
  };
  const cityAreas = areas[city] || [`${city}市中心区域`];
  return `### 推荐住宿区域\n\n${cityAreas.map((area, i) => `${i + 1}. **${area}**`).join('\n')}\n\n> 💡 提示：建议选择靠近景点或交通便利的区域入住`;
}

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
  const cost = parseFloat(poi.biz_ext?.cost ?? "0");
  const walkMinutes = Math.ceil(distance / WALK_SPEED_MPM);
  const transitAccessible = distance < 8000;

  let priceRange = "价格待询";
  if (cost > 0) priceRange = `¥${cost}`;

  const tags = [];
  if (poi.biz_ext?.tag) tags.push(...poi.biz_ext.tag.split("|").filter(Boolean));
  if (transitAccessible) tags.push("公交可达");

  return {
    name: poi.name ?? "未知酒店",
    address: poi.address ?? "",
    location: poi.location ? parseLocation(poi.location) : null,
    priceRange,
    rating: isNaN(rating) ? 0 : rating,
    distance,
    walkMinutes,
    transitAccessible,
    tags,
    source: "amap",
  };
}

function parseLocation(loc) {
  const [lng, lat] = loc.split(",").map(Number);
  return { latitude: lat, longitude: lng };
}

// ─── 预算过滤 ────────────────────────────────────────────
function filterByBudget(hotels, budget) {
  if (!budget) return hotels;
  const match = budget.match(/(\d+)[-\s]*(\d+)/);
  if (!match) return hotels;
  const min = parseInt(match[1]);
  const max = parseInt(match[2]);
  return hotels.filter(h => {
    const price = parseFloat(h.priceRange.replace(/[^\d.]/g, ""));
    return isNaN(price) || (price >= min && price <= max);
  });
}

// ─── 通过后端代理调用高德 API ────────────────────────────
async function searchAmapPOI(params) {
  const resp = await fetch('/api/amap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: 'place/around',
      params: {
        location: params.location,
        types: '10', // 住宿服务
        radius: params.radius || 5000,
        sortrule: 'distance',
        offset: '20',
        page: '1',
        extensions: 'all',
        ...(params.keywords ? { keywords: params.keywords } : {}),
      },
    }),
  });
  return resp.json();
}

// ─── 工具定义 ────────────────────────────────────────────
export const searchHotelsTool = {
  name: "search_hotels",
  costTier: "cheap",
  label: "酒店搜索",
  description: "搜索指定城市或景点附近的真实酒店，返回名称、价格、评分、距离等信息",
  parameters: Type.Object({
    city: Type.String({ description: "城市名称" }),
    latitude: Type.Optional(Type.Number({ description: "搜索中心点纬度" })),
    longitude: Type.Optional(Type.Number({ description: "搜索中心点经度" })),
    budget: Type.Optional(Type.String({ description: "预算范围，如 '200-400'" })),
    style: Type.Optional(Type.String({ description: "住宿风格: 经济型 | 精品民宿 | 豪华" })),
  }),
  execute: async (_id, params) => {
    const { city, latitude, longitude, budget, style } = params;

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

    try {
      // 通过后端代理调用高德 API
      const data = await searchAmapPOI({
        location: `${centerLng},${centerLat}`,
        radius: 5000,
        keywords,
      });

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
      // 后端代理失败时返回推荐区域
      const recommendAreas = getRecommendAreas(city);
      return {
        content: [{ type: "text", text: `## ${city}酒店搜索\n\n${recommendAreas}` }],
        details: { city, source: "recommend", error: err.message },
      };
    }
  },
};
