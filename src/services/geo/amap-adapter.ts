/**
 * 高德地图地理编码适配器
 *
 * 特点：国内优先，返回 GCJ-02 坐标
 * API: https://restapi.amap.com/v3/geocode/geo
 */

import type { Location } from "../../types/trip.js";
import { fetchWithTimeout } from "../http-client.js";
import type { GeocodeProvider, GeocodeResult } from "./types.js";

interface AmapGeocodeResponse {
  status: string;
  geocodes: { formatted_address: string; location: string }[];
}

export class AmapGeocodeProvider implements GeocodeProvider {
  name = "amap";
  private key: string;
  private timeout: number;

  constructor(key: string, timeout = 4000) {
    this.key = key;
    this.timeout = timeout;
  }

  isAvailable(): boolean {
    return !!this.key;
  }

  async geocode(address: string, city: string): Promise<GeocodeResult> {
    const url = `https://restapi.amap.com/v3/geocode/geo?key=${this.key}&address=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}`;
    const res = await fetchWithTimeout(url, { timeout: this.timeout });
    if (!res.ok) throw new Error(`Amap error: ${res.status}`);

    const data = (await res.json()) as AmapGeocodeResponse;
    if (data.status !== "1" || !data.geocodes?.length) {
      throw new Error(`Amap no result: ${address}`);
    }

    const [lng, lat] = data.geocodes[0].location.split(",").map(Number);
    // 高德直接返回 GCJ-02 坐标
    const location: Location = { latitude: lat, longitude: lng };

    return { location, engine: this.name };
  }
}
