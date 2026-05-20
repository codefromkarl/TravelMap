/**
 * MSW 默认 HTTP handlers — barrel re-export
 *
 * 按 domain 拆分，汇总导出。单个测试可以用 server.use() 覆盖特定 handler。
 *
 * 迭代指引：
 *   - 新增外部 API → 在对应 domain 文件中添加 handler
 *   - 测试需要特殊响应 → 在测试文件中 server.use(override)
 */

import {
  amapGeocodeHandler,
  amapPoiHandler,
  googleGeocodeHandler,
  googlePlacesHandler,
  googlePlacesNearbyHandler,
  nominatimHandler,
  otmDetailHandler,
  otmGeonameHandler,
  otmRadiusHandler,
  qunarTicketHandler,
} from "./attractions.js";
import {
  opentopodataHandler,
  pexelsHandler,
  unsplashHandler,
  wikipediaHandler,
  wikivoyageHandler,
} from "./knowledge.js";
import { amapNearbySearchHandler, amapTransitHandler } from "./transport.js";
import {
  amapWeatherHandler,
  owmForecastHandler,
  owmGeocodeHandler,
  qweatherHandler,
} from "./weather.js";
import {
  crawlerFileContentHandler,
  crawlerFilesHandler,
  crawlerStartHandler,
  crawlerStatusHandler,
  justoneapiHandler,
  rnoteHandler,
  tikhubHandler,
} from "./xhs.js";

export const handlers = [
  // weather
  owmGeocodeHandler,
  owmForecastHandler,
  qweatherHandler,
  amapWeatherHandler,
  // attractions / POI / geocode
  googlePlacesHandler,
  googleGeocodeHandler,
  googlePlacesNearbyHandler,
  otmGeonameHandler,
  otmRadiusHandler,
  otmDetailHandler,
  qunarTicketHandler,
  amapPoiHandler,
  amapGeocodeHandler,
  nominatimHandler,
  // transport / nearby
  amapTransitHandler,
  amapNearbySearchHandler,
  // xhs / UGC
  rnoteHandler,
  justoneapiHandler,
  tikhubHandler,
  crawlerStartHandler,
  crawlerStatusHandler,
  crawlerFilesHandler,
  crawlerFileContentHandler,
  // knowledge / images / elevation
  wikipediaHandler,
  wikivoyageHandler,
  unsplashHandler,
  pexelsHandler,
  opentopodataHandler,
];
