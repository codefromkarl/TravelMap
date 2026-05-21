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
    const enriched = structuredClone(tripPlan);
    let enrichedCount = 0;
    let failedCount = 0;

    for (const day of enriched.days) {
      const city = day.city || enriched.city;
      for (const attr of day.attractions) {
        // 检查是否需要补全坐标
        const loc = attr.location;
        const needsGeocode =
          !loc ||
          !loc.latitude ||
          !loc.longitude ||
          (loc.latitude === 0 && loc.longitude === 0);

        if (!needsGeocode) continue;

        const attrName = attr.nameZh || attr.name;
        try {
          logger.info("补全坐标", { attraction: attrName, city });
          const result = await dualGeocode(attrName, city);

          if (result.location.latitude !== 0 && result.location.longitude !== 0) {
            attr.location = result.location;
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
    }

    if (enrichedCount > 0) {
      logger.info("坐标补全完成", { enrichedCount, failedCount });
    }

    return enriched;
  }
}
