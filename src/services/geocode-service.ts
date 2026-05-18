/**
 * 地理编码服务 — Nominatim (OpenStreetMap) 免费
 *
 * 备选：高德地图 (需 AMAP_WEB_KEY)
 * 备选：Google Maps (需 GOOGLE_MAPS_API_KEY)
 */

import type { Location } from "../types/trip.js";

export interface GeocodeParams {
  address: string;
  city: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  importance: number;
}

interface AmapGeocodeResult {
  status: string;
  geocodes: {
    formatted_address: string;
    location: string;
  }[];
}

/** 带超时的 fetch */
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = 4000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Nominatim 地理编码 — 免费，无需 Key */
async function fetchFromNominatim(params: GeocodeParams): Promise<Location> {
  const query = `${params.address}, ${params.city}`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=zh`;

  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": "TravelAgent/0.1.0" },
  });
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);

  const data = (await res.json()) as NominatimResult[];
  if (!data.length) throw new Error(`Address not found: ${params.address}`);

  return {
    latitude: Number.parseFloat(data[0].lat),
    longitude: Number.parseFloat(data[0].lon),
  };
}

/** 高德地图地理编码 — 国内精度更高 */
async function fetchFromAmap(params: GeocodeParams, key: string): Promise<Location> {
  const url = `https://restapi.amap.com/v3/geocode/geo?key=${key}&address=${encodeURIComponent(params.address)}&city=${encodeURIComponent(params.city)}`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Amap geocode error: ${res.status}`);

  const data = (await res.json()) as AmapGeocodeResult;
  if (data.status !== "1" || !data.geocodes?.length) {
    throw new Error(`Amap geocode no result: ${params.address}`);
  }

  const [lng, lat] = data.geocodes[0].location.split(",").map(Number);
  return { latitude: lat, longitude: lng };
}

/** Google Maps Geocoding */
async function fetchFromGoogle(params: GeocodeParams, key: string): Promise<Location> {
  const address = `${params.address}, ${params.city}`;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Google Geocode error: ${res.status}`);

  const data = (await res.json()) as {
    status: string;
    results: { geometry: { location: { lat: number; lng: number } } }[];
  };
  if (data.status !== "OK" || !data.results?.length) {
    throw new Error(`Google geocode no result: ${params.address}`);
  }

  return {
    latitude: data.results[0].geometry.location.lat,
    longitude: data.results[0].geometry.location.lng,
  };
}

/** 默认坐标（城市中心点降级） */
function defaultLocation(city: string): Location {
  const defaults: Record<string, Location> = {
    北京: { latitude: 39.9042, longitude: 116.4074 },
    上海: { latitude: 31.2304, longitude: 121.4737 },
    广州: { latitude: 23.1291, longitude: 113.2644 },
    深圳: { latitude: 22.5431, longitude: 114.0579 },
    成都: { latitude: 30.5728, longitude: 104.0668 },
    杭州: { latitude: 30.2741, longitude: 120.1551 },
    西安: { latitude: 34.3416, longitude: 108.9398 },
    重庆: { latitude: 29.563, longitude: 106.5516 },
  };
  return defaults[city] ?? { latitude: 31.23, longitude: 121.47 };
}

/** 地理编码 — 主入口 */
export async function geocodeAddress(params: GeocodeParams): Promise<{
  location: Location;
  source: string;
  warning?: string;
}> {
  // 优先级：Amap > Google > Nominatim
  const amapKey = process.env.AMAP_WEB_KEY;
  const googleKey = process.env.GOOGLE_MAPS_API_KEY;

  // 1. 高德地图（国内首选）
  if (amapKey) {
    try {
      const location = await fetchFromAmap(params, amapKey);
      return { location, source: "amap" };
    } catch (err) {
      console.warn("[GeocodeService] Amap failed:", err);
    }
  }

  // 2. Google Maps
  if (googleKey) {
    try {
      const location = await fetchFromGoogle(params, googleKey);
      return { location, source: "google" };
    } catch (err) {
      console.warn("[GeocodeService] Google failed:", err);
    }
  }

  // 3. Nominatim（免费兜底）
  try {
    const location = await fetchFromNominatim(params);
    return { location, source: "nominatim" };
  } catch (err) {
    console.warn("[GeocodeService] Nominatim failed:", err);
  }

  // 4. 最终降级
  return {
    location: defaultLocation(params.city),
    source: "default",
    warning: `无法获取 "${params.address}" 的精确坐标，使用${params.city}市中心坐标`,
  };
}
