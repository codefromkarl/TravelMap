/**
 * MSW handlers — 图片/知识/高程 API
 *
 * Unsplash / Pexels / Wikipedia / Wikivoyage / Open Topo Data
 */

import { HttpResponse, http } from "msw";

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

// ─── Open Topo Data (高程查询) ────────────────────────────
export const opentopodataHandler = http.get("https://api.opentopodata.org/v1/srtm90m", () => {
  return HttpResponse.json({
    results: [{ location: { lat: 30.25, lng: 120.15 }, elevation: 15 }],
  });
});
