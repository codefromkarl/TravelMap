/**
 * Google Maps 地理编码适配器
 *
 * 特点：国际通用，返回 WGS-84 坐标（自动转换为 GCJ-02）
 * API: https://maps.googleapis.com/maps/api/geocode/json
 */

import type { Location } from "../../types/trip.js";
import { wgs84ToGcj02 } from "../dual-map-service.js";
import { fetchWithTimeout } from "../http-client.js";
import type { GeocodeProvider, GeocodeResult } from "./types.js";

interface GoogleGeocodeResponse {
  status: string;
  results: { geometry: { location: { lat: number; lng: number } } }[];
}

export interface GoogleGeocodeConfig {
  key: string;
  proxyUrl?: string;
  timeout?: number;
}

export class GoogleGeocodeProvider implements GeocodeProvider {
  name = "google";
  private config: GoogleGeocodeConfig;

  constructor(config: GoogleGeocodeConfig) {
    this.config = config;
  }

  isAvailable(): boolean {
    return !!this.config.key;
  }

  async geocode(address: string, city: string): Promise<GeocodeResult> {
    const query = `${address}, ${city}`;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${this.config.key}`;

    const fetchUrl = this.config.proxyUrl
      ? `${this.config.proxyUrl}?url=${encodeURIComponent(url)}`
      : url;

    const res = await fetchWithTimeout(fetchUrl, { timeout: this.config.timeout ?? 4000 });
    if (!res.ok) throw new Error(`Google Geocode error: ${res.status}`);

    const data = (await res.json()) as GoogleGeocodeResponse;
    if (data.status !== "OK" || !data.results?.length) {
      throw new Error(`Google no result: ${address}`);
    }

    // Google Maps 返回 WGS-84 坐标，转换为 GCJ-02
    const wgs84Lat = data.results[0].geometry.location.lat;
    const wgs84Lng = data.results[0].geometry.location.lng;
    const rawLocation: Location = { latitude: wgs84Lat, longitude: wgs84Lng };
    const location = wgs84ToGcj02(wgs84Lat, wgs84Lng);

    return { location, engine: this.name, rawLocation };
  }
}
