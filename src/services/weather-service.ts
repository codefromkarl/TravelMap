/**
 * 天气查询服务 — 和风天气 > 高德天气 > OpenWeatherMap > mock
 *
 * 使用 WeatherProvider 接口，每个后端独立为 adapter。
 * 优先级链：和风 → 高德 → OpenWeatherMap → Mock
 */

import type { WeatherInfo } from "../types/trip.js";
import { config } from "./config.js";
import { getLogger } from "./logger.js";
import { AmapWeatherProvider } from "./weather/amap-adapter.js";
import { MockWeatherProvider } from "./weather/mock-adapter.js";
import { OpenWeatherMapProvider } from "./weather/owm-adapter.js";
import { QWeatherProvider } from "./weather/qweather-adapter.js";
import type { WeatherProvider, WeatherSearchParams } from "./weather/types.js";

export type { WeatherSearchParams };

// ─── Provider 工厂 ─────────────────────────────────────────

function createProviders(): WeatherProvider[] {
  const providers: WeatherProvider[] = [];

  // 1. 和风天气（7天，中文原生）
  if (config.qweatherApiKey) {
    providers.push(
      new QWeatherProvider({
        apiKey: config.qweatherApiKey,
        owmApiKey: config.openWeatherApiKey,
      }),
    );
  }

  // 2. 高德天气（3天，中文）
  if (config.amapWebKey) {
    providers.push(new AmapWeatherProvider(config.amapWebKey));
  }

  // 3. OpenWeatherMap（5天，需翻译）
  if (config.openWeatherApiKey) {
    providers.push(new OpenWeatherMapProvider(config.openWeatherApiKey));
  }

  // 4. Mock 降级（总是可用）
  providers.push(new MockWeatherProvider());

  return providers;
}

// ─── 主入口：优先级链 ──────────────────────────────────────

/** 查询天气 — 主入口 */
export async function searchWeather(params: WeatherSearchParams): Promise<{
  weather: WeatherInfo[];
  source: string;
}> {
  const logger = getLogger().child({ component: "weather-service" });
  const providers = createProviders();

  for (const provider of providers) {
    if (!provider.isAvailable()) continue;

    try {
      const result = await provider.fetchWeather(params);
      return { weather: result.weather, source: result.source };
    } catch (err) {
      logger.warn(`${provider.name} failed, degrading`, {
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  // 理论上不会到达这里（Mock 总是可用）
  return { weather: [], source: "none" };
}
