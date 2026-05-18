/**
 * MSW 默认 HTTP handlers
 *
 * 为项目用到的所有外部 API 提供基础 mock 响应。
 * 单个测试可以用 server.use() 覆盖特定 handler。
 *
 * 迭代指引：
 *   - 新增外部 API → 在此文件添加对应 handler
 *   - 测试需要特殊响应 → 在测试文件中 server.use(override)
 */
import { HttpResponse, http } from "msw";

// ─── Google Places Text Search ────────────────────────────
export const googlePlacesHandler = http.get(
  "https://maps.googleapis.com/maps/api/place/textsearch/json",
  () => {
    return HttpResponse.json({
      status: "OK",
      results: [
        {
          name: "测试景点",
          formatted_address: "测试城市测试路1号",
          geometry: { location: { lat: 39.9163, lng: 116.3972 } },
          rating: 4.5,
          types: ["tourist_attraction"],
          editorial_summary: { overview: "一个用于测试的景点" },
        },
      ],
    });
  },
);

// ─── OpenWeatherMap Geocode ───────────────────────────────
export const owmGeocodeHandler = http.get("https://api.openweathermap.org/geo/1.0/direct", () => {
  return HttpResponse.json([{ name: "TestCity", lat: 39.91, lon: 116.39, country: "CN" }]);
});

// ─── OpenWeatherMap 5-day Forecast ────────────────────────
export const owmForecastHandler = http.get(
  "https://api.openweathermap.org/data/2.5/forecast",
  () => {
    const now = new Date();
    const items = [];
    for (let i = 0; i < 8; i++) {
      const dt = new Date(now);
      dt.setHours(dt.getHours() + i * 3);
      items.push({
        dt: Math.floor(dt.getTime() / 1000),
        dt_txt: dt.toISOString().replace("T", " ").slice(0, 19),
        main: { temp: 22, temp_min: 15, temp_max: 25 },
        weather: [{ id: 800, main: "Clear", description: "clear sky", icon: "01d" }],
        wind: { speed: 3, deg: 180 },
      });
    }
    return HttpResponse.json({
      cod: "200",
      list: items,
      city: { name: "TestCity", country: "CN" },
    });
  },
);

// ─── 高德地图 Geocode ─────────────────────────────────────
export const amapGeocodeHandler = http.get("https://restapi.amap.com/v3/geocode/geo", () => {
  return HttpResponse.json({
    status: "1",
    geocodes: [{ formatted_address: "测试地址", location: "116.397428,39.90923" }],
  });
});

// ─── Nominatim (OpenStreetMap) ────────────────────────────
export const nominatimHandler = http.get("https://nominatim.openstreetmap.org/search", () => {
  return HttpResponse.json([
    { lat: "39.9163", lon: "116.3972", display_name: "Test Address", importance: 0.8 },
  ]);
});

// ─── 汇总导出 ──────────────────────────────────────────────
export const handlers = [
  googlePlacesHandler,
  owmGeocodeHandler,
  owmForecastHandler,
  amapGeocodeHandler,
  nominatimHandler,
];
