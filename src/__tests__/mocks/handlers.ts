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
    geocodes: [
      { formatted_address: "测试地址", location: "116.397428,39.90923", adcode: "110000" },
    ],
  });
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

// ─── Nominatim (OpenStreetMap) ────────────────────────────
export const nominatimHandler = http.get("https://nominatim.openstreetmap.org/search", () => {
  return HttpResponse.json([
    { lat: "39.9163", lon: "116.3972", display_name: "Test Address", importance: 0.8 },
  ]);
});

// ─── Open Topo Data (高程查询) ────────────────────────────
export const opentopodataHandler = http.get("https://api.opentopodata.org/v1/srtm90m", () => {
  return HttpResponse.json({
    results: [{ location: { lat: 30.25, lng: 120.15 }, elevation: 15 }],
  });
});

// ─── Rnote (小红书笔记) ───────────────────────────────────
export const rnoteHandler = http.get("https://rnote.dev/api/v1/xhs/search_notes", () => {
  return HttpResponse.json({
    code: 0,
    data: {
      items: [
        {
          note_id: "test-note-1",
          title: "测试笔记",
          desc: "这是一个测试笔记内容",
          liked_count: 100,
          user: { nickname: "测试用户" },
        },
      ],
    },
  });
});

// ─── JustOneAPI (小红书聚合) ──────────────────────────────
export const justoneapiHandler = http.get(
  "https://api.justoneapi.com/api/xiaohongshu/search-note/v3",
  () => {
    return HttpResponse.json({
      code: 200,
      data: {
        items: [
          {
            note_id: "test-note-2",
            title: "JustOneAPI 测试",
            desc: "聚合平台测试内容",
            liked_count: "50",
            user: { nickname: "聚合用户" },
          },
        ],
      },
    });
  },
);

// ─── TikHub (小红书多平台) ────────────────────────────────
export const tikhubHandler = http.get(
  "https://api.tikhub.io/api/v1/xiaohongshu/web/search_notes",
  () => {
    return HttpResponse.json({
      code: 200,
      data: {
        data: [
          {
            note_id: "test-note-3",
            display_title: "TikHub 测试",
            note_card: {
              desc: "多平台测试内容",
              interact_info: { liked_count: "80" },
              user: { nickname: "TikHub 用户" },
            },
          },
        ],
      },
    });
  },
);

// ─── Crawler (NanmiCoder 自部署爬虫) ──────────────────────
export const crawlerStartHandler = http.post("http://localhost:8080/api/crawler/start", () => {
  return HttpResponse.json({ status: "ok", message: "started" });
});

export const crawlerStatusHandler = http.get("http://localhost:8080/api/crawler/status", () => {
  return HttpResponse.json({ status: "idle" });
});

export const crawlerFilesHandler = http.get("http://localhost:8080/api/data/files", () => {
  return HttpResponse.json({
    files: [
      {
        name: "test.json",
        path: "test.json",
        size: 1024,
        modified_at: Date.now(),
        record_count: 1,
        type: "json",
      },
    ],
  });
});

export const crawlerFileContentHandler = http.get(
  "http://localhost:8080/api/data/files/:path",
  () => {
    return HttpResponse.json({
      data: [
        {
          title: "爬虫测试笔记",
          desc: "本地爬虫抓取内容",
          note_id: "crawler-note-1",
          nickname: "爬虫用户",
          liked_count: 10,
        },
      ],
      total: 1,
    });
  },
);

// ─── 高德周边搜索（餐厅） ──────────────────────────────
export const amapNearbySearchHandler = http.get(
  "https://restapi.amap.com/v3/place/around",
  ({ request }) => {
    const url = new URL(request.url);
    const keywords = url.searchParams.get("keywords");

    return HttpResponse.json({
      status: "1",
      count: "2",
      pois: [
        {
          id: "B001",
          name: keywords ? `${keywords}餐厅` : "外婆家(西湖店)",
          type: "餐饮服务;中餐厅;浙江菜",
          address: "杭州市西湖区龙井路1号",
          location: "120.155,30.275",
          tel: "0571-88888001",
          rating: "4.5",
          biz_ext: { rating: "4.5", cost: "85", open_time: "10:00-22:00" },
          distance: "350",
        },
        {
          id: "B002",
          name: "绿茶餐厅(西湖银泰店)",
          type: "餐饮服务;中餐厅;浙江菜",
          address: "杭州市上城区延安路98号",
          location: "120.169,30.259",
          tel: "0571-88888002",
          rating: "4.2",
          biz_ext: { rating: "4.2", cost: "65", open_time: "11:00-21:30" },
          distance: "580",
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

// ─── 高德路线规划（城际交通） ─────────────────────────────
export const amapTransitHandler = http.get(
  "https://restapi.amap.com/v3/direction/transit/integrated",
  () => {
    return HttpResponse.json({
      status: "1",
      route: {
        transits: [
          {
            cost: { duration: "5400", transit_fee: "73.5" },
            distance: "175000",
            segments: [
              {
                transit_mode: "火车",
                bus: {
                  buslines: [
                    {
                      departure_stop: { name: "杭州东站", location: "120.21,30.29" },
                      arrival_stop: { name: "上海虹桥站", location: "121.32,31.19" },
                      name: "G7590",
                      via_num: "1",
                      via_stops: [],
                      start_time: "08:30",
                      end_time: "09:30",
                    },
                  ],
                },
              },
            ],
          },
          {
            cost: { duration: "6000", transit_fee: "55.0" },
            distance: "175000",
            segments: [
              {
                transit_mode: "火车",
                bus: {
                  buslines: [
                    {
                      departure_stop: { name: "杭州东站", location: "120.21,30.29" },
                      arrival_stop: { name: "上海站", location: "121.47,31.23" },
                      name: "D658",
                      via_num: "2",
                      via_stops: [],
                      start_time: "10:00",
                      end_time: "11:40",
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });
  },
);

// ─── 和风天气 7 天预报 ──────────────────────────────────
export const qweatherHandler = http.get("https://devapi.qweather.com/v7/weather/7d", () => {
  const now = new Date();
  const daily = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    daily.push({
      fxDate: date.toISOString().split("T")[0],
      textDay: i % 2 === 0 ? "晴" : "多云",
      textNight: i % 3 === 0 ? "晴" : "多云",
      tempMax: String(25 + (i % 3)),
      tempMin: String(15 + (i % 3)),
      windDirDay: "东南风",
      windScaleDay: "3",
    });
  }
  return HttpResponse.json({ code: "200", daily });
});

// ─── 高德天气 3 天预报 ──────────────────────────────────
export const amapWeatherHandler = http.get(
  "https://restapi.amap.com/v3/weather/weatherInfo",
  () => {
    const now = new Date();
    const casts = [];
    for (let i = 0; i < 4; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() + i);
      casts.push({
        date: date.toISOString().split("T")[0],
        dayweather: i % 2 === 0 ? "晴" : "多云",
        nightweather: "晴",
        daytemp: String(26 + (i % 3)),
        nighttemp: String(16 + (i % 3)),
        daywind: "东南风",
        nightwind: "东南风",
        daypower: "3",
        nightpower: "2",
        week: "",
      });
    }
    return HttpResponse.json({
      status: "1",
      forecasts: [{ city: "北京市", casts }],
    });
  },
);

// ─── OpenTripMap Geoname ────────────────────────────────────
// 注册: https://dev.opentripmap.org/ (免费)
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

// ─── Wikipedia API ──────────────────────────────────────────
export const wikipediaHandler = http.get("https://zh.wikipedia.org/w/api.php", ({ request }) => {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const list = url.searchParams.get("list");

  if (action === "query" && list === "geosearch") {
    return HttpResponse.json({
      query: {
        geosearch: [
          { pageid: 1, title: "故宫", lat: 39.9163, lon: 116.3972, dist: 500 },
          { pageid: 2, title: "天坛", lat: 39.8822, lon: 116.4066, dist: 3500 },
        ],
      },
    });
  }

  if (action === "query" && list === "search") {
    return HttpResponse.json({
      query: {
        search: [{ pageid: 3, title: "颐和园" }],
      },
    });
  }

  // extracts / page images / coordinates
  if (action === "query") {
    return HttpResponse.json({
      query: {
        pages: {
          "1": {
            pageid: 1,
            title: "故宫",
            extract:
              "故宫是中国明清两代的皇家宫殿，位于北京中轴线的中心。旧称紫禁城，是世界上现存规模最大、保存最为完整的木质结构古建筑之一。",
            thumbnail: { source: "https://example.com/gugong.jpg", width: 300, height: 200 },
          },
          "2": {
            pageid: 2,
            title: "天坛",
            extract: "天坛是明清两朝帝王祭天祈谷的场所。",
            coordinates: [{ lat: 39.8822, lon: 116.4066 }],
          },
          "3": {
            pageid: 3,
            title: "颐和园",
            extract: "颐和园是中国清朝时期皇家园林，前身为清漪园。",
          },
        },
      },
    });
  }

  return HttpResponse.json({ query: {} });
});

// ─── Wikivoyage API ────────────────────────────────────────
export const wikivoyageHandler = http.get("https://zh.wikivoyage.org/w/api.php", ({ request }) => {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "parse") {
    const wikitext = `==景点==
{{see | name=故宫博物院 | address=景山前街4号 | lat=39.9163 | long=116.3972 | content=明清皇家宫殿，世界文化遗产}}
{{see | name=天坛公园 | address=天坛内东里7号 | lat=39.8822 | long=116.4066 | content=明清祭天建筑群}}
* '''颐和园''' — 皇家园林，以昆明湖万寿山为基址
* [[长城]] — 万里长城，世界七大奇迹之一
`;
    return HttpResponse.json({
      parse: { wikitext: { "*": wikitext } },
    });
  }

  if (action === "query") {
    return HttpResponse.json({
      query: { pages: { "1": { extract: "北京是中国首都。" } } },
    });
  }

  return HttpResponse.json({});
});

// ─── Unsplash 图片搜索 ──────────────────────────────────
export const unsplashHandler = http.get("https://api.unsplash.com/search/photos", () => {
  return HttpResponse.json({
    results: [
      { id: 1, urls: { regular: "https://example.com/photo1.jpg" }, alt_description: "测试图片" },
    ],
  });
});

// ─── Pexels 图片搜索 ────────────────────────────────────
export const pexelsHandler = http.get("https://api.pexels.com/v1/search", () => {
  return HttpResponse.json({
    photos: [{ id: 1, src: { medium: "https://example.com/photo1.jpg" }, alt: "测试图片" }],
  });
});

// ─── 汇总导出 ──────────────────────────────────────────────
export const handlers = [
  googlePlacesHandler,
  googleGeocodeHandler,
  googlePlacesNearbyHandler,
  owmGeocodeHandler,
  owmForecastHandler,
  amapGeocodeHandler,
  amapPoiHandler,
  amapNearbySearchHandler,
  amapTransitHandler,
  amapWeatherHandler,
  qweatherHandler,
  nominatimHandler,
  opentopodataHandler,
  rnoteHandler,
  justoneapiHandler,
  tikhubHandler,
  crawlerStartHandler,
  crawlerStatusHandler,
  crawlerFilesHandler,
  crawlerFileContentHandler,
  otmGeonameHandler,
  otmRadiusHandler,
  otmDetailHandler,
  qunarTicketHandler,
  wikipediaHandler,
  wikivoyageHandler,
  pexelsHandler,
  unsplashHandler,
];
