/**
 * MSW handlers — 景点/POI 相关 API
 *
 * Google Places Text Search / Nearby Search / Geocoding
 * OpenTripMap Geoname / Radius / Detail
 * 去哪儿门票页
 * 高德 POI 详情
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

// ─── Google Maps Geocoding ────────────────────────────────
export const googleGeocodeHandler = http.get(
  "https://maps.googleapis.com/maps/api/geocode/json",
  () => {
    return HttpResponse.json({
      status: "OK",
      results: [
        {
          formatted_address: "测试地址, 北京",
          geometry: { location: { lat: 39.9163, lng: 116.3972 } },
        },
      ],
    });
  },
);

// ─── Google Places Nearby Search ─────────────────────────
export const googlePlacesNearbyHandler = http.get(
  "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
  () => {
    return HttpResponse.json({
      status: "OK",
      results: [
        {
          name: "Tokyo Ramen Street",
          vicinity: "Tokyo Station Basement",
          geometry: { location: { lat: 35.681, lng: 139.767 } },
          rating: 4.3,
          price_level: 2,
          types: ["restaurant", "food"],
        },
        {
          name: "Sushi Dai",
          vicinity: "Tsukiji Market",
          geometry: { location: { lat: 35.665, lng: 139.771 } },
          rating: 4.7,
          price_level: 3,
          types: ["restaurant", "food", "sushi_restaurant"],
        },
      ],
    });
  },
);

// ─── OpenTripMap Geoname ────────────────────────────────────
export const otmGeonameHandler = http.get(
  "https://api.opentripmap.com/0.1/zh/places/geoname",
  () => {
    return HttpResponse.json([{ name: "Beijing", lat: 39.9042, lon: 116.4074, country: "CN" }]);
  },
);

// ─── OpenTripMap Radius Search ───────────────────────────────
export const otmRadiusHandler = http.get("https://api.opentripmap.com/0.1/zh/places/radius", () => {
  return HttpResponse.json([
    {
      name: "故宫博物院",
      xid: "otm_1",
      kinds: "museums,historic",
      rate: "3",
      point: { lat: 39.9163, lon: 116.3972 },
    },
    {
      name: "天坛公园",
      xid: "otm_2",
      kinds: "parks,religion",
      rate: "3",
      point: { lat: 39.8822, lon: 116.4066 },
    },
  ]);
});

// ─── OpenTripMap Place Detail ────────────────────────────────
export const otmDetailHandler = http.get(
  "https://api.opentripmap.com/0.1/zh/places/xid/:xid",
  ({ params }) => {
    const details: Record<string, Record<string, unknown>> = {
      otm_1: {
        name: "故宫博物院",
        kinds: "museums,historic,architecture",
        rate: "3",
        point: { lat: 39.9163, lon: 116.3972 },
        address: { city: "北京", road: "景山前街4号" },
        info: { descr: "明清两代皇家宫殿，世界文化遗产" },
        preview: { source: "https://example.com/gugong.jpg" },
        otm: "otm_1",
      },
      otm_2: {
        name: "天坛公园",
        kinds: "parks,religion,historic",
        rate: "3",
        point: { lat: 39.8822, lon: 116.4066 },
        address: { city: "北京", road: "天坛内东里7号" },
        info: { descr: "明清祭天建筑群" },
        preview: { source: "https://example.com/tiantan.jpg" },
        otm: "otm_2",
      },
    };
    const xid = params.xid as string;
    return HttpResponse.json(details[xid] ?? { name: "测试景点", kinds: "museums", rate: "2" });
  },
);

// ─── 去哪儿门票页 ──────────────────────────────────────────
export const qunarTicketHandler = http.get("https://piao.qunar.com/ticket/list.htm", () => {
  const html = `
      <html><body>
      <script type="application/ld+json">{"@type":"Product","name":"故宫博物院","offers":{"price":"60"},"aggregateRating":{"ratingValue":"4.9","reviewCount":"12000"}}</script>
      <script>window.__INITIAL_STATE__ = {"sightList":[{"sightName":"颐和园","address":"海淀区新建宫门路19号","qunarPrice":30,"score":4.8,"commentCount":8000,"needBooking":true,"sightId":12345}]};</script>
      </body></html>
    `;
  return new HttpResponse(html, { headers: { "Content-Type": "text/html" } });
});

// ─── 高德地图 POI 详情 ────────────────────────────────────
export const amapPoiHandler = http.get("https://restapi.amap.com/v3/place/detail", () => {
  return HttpResponse.json({
    status: "1",
    regeocode: {
      addressComponent: { city: "北京市" },
      pois: [
        {
          name: "测试POI",
          location: "116.397428,39.90923",
          type: "餐饮服务;中餐厅",
          biz_ext: { rating: "4.5", cost: "60" },
        },
      ],
    },
  });
});

// ─── 高德地图 Geocode ─────────────────────────────────────
export const amapGeocodeHandler = http.get("https://restapi.amap.com/v3/geocode/geo", () => {
  return HttpResponse.json({
    status: "1",
    geocodes: [
      { formatted_address: "测试地址", location: "116.397428,39.90923", adcode: "110000" },
    ],
  });
});

// ─── Nominatim (OpenStreetMap) ────────────────────────────
export const nominatimHandler = http.get("https://nominatim.openstreetmap.org/search", () => {
  return HttpResponse.json([
    { lat: "39.9163", lon: "116.3972", display_name: "Test Address", importance: 0.8 },
  ]);
});
