/**
 * MSW handlers — 天气相关 API
 *
 * 和风天气 7 天预报 / 高德天气 3 天预报 / OpenWeatherMap 5-day forecast / OWM Geocode
 */

import { HttpResponse, http } from "msw";

// ─── OpenWeatherMap Geocode ───────────────────────────────
export const owmGeocodeHandler = http.get("https://api.openweathermap.org/geo/1.0/direct", () => {
  return HttpResponse.json([{ name: "TestCity", lat: 39.91, lon: 116.39, country: "CN" }]);
});

// ─── OpenWeatherMap 5-day Forecast ───────────────────────
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
