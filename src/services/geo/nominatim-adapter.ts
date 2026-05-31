/**
 * Nominatim 地理编码适配器（免费兜底）
 *
 * 特点：免费、无需 Key、返回 WGS-84 坐标（自动转换为 GCJ-02）
 * API: https://nominatim.openstreetmap.org/search
 */

import type { Location } from "../../types/trip.js";
import { wgs84ToGcj02 } from "../dual-map-service.js";
import { fetchWithTimeout } from "../http-client.js";
import type { GeocodeProvider, GeocodeResult } from "./types.js";

export class NominatimGeocodeProvider implements GeocodeProvider {
  name = "nominatim";
  private timeout: number;

  constructor(timeout = 4000) {
    this.timeout = timeout;
  }

  isAvailable(): boolean {
    return true; // Nominatim 总是可用
  }

  async geocode(address: string, city: string): Promise<GeocodeResult> {
    const query = `${address}, ${city}`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=zh`;
    const res = await fetchWithTimeout(url, {
      timeout: this.timeout,
      headers: { "User-Agent": "TravelAgent/0.1.0" },
    });
    if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);

    const data = (await res.json()) as { lat: string; lon: string }[];
    if (!data.length) throw new Error(`Nominatim no result: ${address}`);

    // Nominatim 返回 WGS-84 坐标，转换为 GCJ-02
    const wgs84Lat = Number.parseFloat(data[0].lat);
    const wgs84Lng = Number.parseFloat(data[0].lon);
    const rawLocation: Location = { latitude: wgs84Lat, longitude: wgs84Lng };
    const location = wgs84ToGcj02(wgs84Lat, wgs84Lng);

    return { location, engine: this.name, rawLocation };
  }
}
