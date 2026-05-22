/**
 * 坐标补全步骤 — 检测缺失坐标并调用 geocode 补全
 *
 * 当 tripPlan 中的景点缺少 location 或 location 为 (0,0) 时，
 * 自动调用 dualGeocode 获取坐标并填充。
 *
 * 失败时不阻塞后续步骤，仅记录警告。
 */

import type { TripPlan } from "../../../types/trip.js";
import { dualGeocode } from "../../dual-map-service.js";
import { getLogger } from "../../logger.js";
import type { PostProcessConfig, PostProcessStep } from "../pipeline.js";

export class GeocodeEnrichStep implements PostProcessStep {
  name = "geocode-enrich";

  isEnabled(_config: PostProcessConfig): boolean {
    return true; // 始终启用
  }

  async run(tripPlan: TripPlan, _config: PostProcessConfig): Promise<TripPlan> {
    const logger = getLogger().child({ component: "geocode-enrich-step" });
    // 优化：浅拷贝 + 按需深拷贝，避免 structuredClone 的性能开销
    const enriched: TripPlan = { ...tripPlan, days: [...tripPlan.days] };
    let enrichedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < enriched.days.length; i++) {
      const day = enriched.days[i];
      const city = day.city || enriched.city;
      const newAttractions = [...day.attractions];
      let dayModified = false;

      for (let j = 0; j < newAttractions.length; j++) {
        const attr = newAttractions[j];

        // 检查是否需要补全坐标
        const loc = attr.location;
        const needsGeocode =
          !loc || !loc.latitude || !loc.longitude || (loc.latitude === 0 && loc.longitude === 0);

        if (!needsGeocode) continue;

        const attrName = attr.nameZh || attr.name;
        try {
          logger.info("补全坐标", { attraction: attrName, city });
          const result = await dualGeocode(attrName, city);

          if (result.location.latitude !== 0 && result.location.longitude !== 0) {
            // 只拷贝修改的 attraction
            newAttractions[j] = { ...attr, location: result.location };
            dayModified = true;
            enrichedCount++;
            logger.info("坐标补全成功", {
              attraction: attrName,
              lat: result.location.latitude,
              lng: result.location.longitude,
              engine: result.engine,
            });
          } else {
            failedCount++;
            logger.warn("坐标补全返回零坐标", { attraction: attrName });
          }
        } catch (err) {
          failedCount++;
          logger.warn("坐标补全失败", {
            attraction: attrName,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // 只在有修改时才拷贝 day
      if (dayModified) {
        enriched.days[i] = { ...day, attractions: newAttractions };
      }
    }

    if (enrichedCount > 0) {
      logger.info("坐标补全完成", { enrichedCount, failedCount });
    }

    return enriched;
  }
}
