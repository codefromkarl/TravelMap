/**
 * Route Planner 模块 — 路线逻辑从渲染中解耦
 *
 * 把"酒店→景点→景点→酒店"的路线规划逻辑从 map.js 的渲染函数中提取出来。
 *
 * 接口：
 *   routePlanner.planDayRoutes(day) → 路线点数组
 *   routePlanner.shouldIncludeHotel(day) → 是否包含酒店
 */

// ─── 内部工具 ──────────────────────────────────────────

function hasValidLocation(loc) {
  return loc && loc.latitude && loc.longitude && (loc.latitude !== 0 || loc.longitude !== 0);
}

function getAttractionLocation(attr) {
  return hasValidLocation(attr.location) ? attr.location : null;
}

function getHotelLocation(day) {
  return hasValidLocation(day.hotel?.location) ? day.hotel.location : null;
}

// ─── Public API ────────────────────────────────────────

export const routePlanner = {
  /**
   * 检查是否应该包含酒店（酒店有有效坐标）
   */
  shouldIncludeHotel(day) {
    return !!getHotelLocation(day);
  },

  /**
   * 规划一天的路线点序列
   *
   * 策略：
   * - 有酒店：酒店 → 景点1 → 景点2 → ... → 酒店
   * - 无酒店：景点1 → 景点2 → ...
   *
   * @param {object} day - DayPlan 对象
   * @returns {Array<{location: object, name: string, type: string}>} 路线点数组
   */
  planDayRoutes(day) {
    const points = [];

    // 获取有效坐标的景点
    const validAttractions = (day.attractions || []).filter(a => getAttractionLocation(a));

    // 获取酒店位置
    const hotelLoc = getHotelLocation(day);

    // 构建路线点
    if (hotelLoc) {
      points.push({
        location: hotelLoc,
        name: day.hotel?.name || '酒店',
        type: 'hotel',
      });
    }

    for (const attr of validAttractions) {
      points.push({
        location: attr.location,
        name: attr.nameZh || attr.name || '景点',
        type: 'attraction',
      });
    }

    // 回程：如果有酒店且有景点，添加酒店作为终点
    if (hotelLoc && validAttractions.length > 0) {
      points.push({
        location: hotelLoc,
        name: day.hotel?.name || '酒店',
        type: 'hotel-return',
      });
    }

    return points;
  },

  /**
   * 从路线点数组中提取坐标对（供路线 API 使用）
   * @param {Array} points - planDayRoutes 返回的点数组
   * @returns {Array<[number, number]>} [lat, lng] 坐标对数组
   */
  toCoordinatePairs(points) {
    return points.map(p => [p.location.latitude, p.location.longitude]);
  },

  /**
   * 计算路线段数（点数 - 1）
   */
  segmentCount(points) {
    return Math.max(0, points.length - 1);
  },
};
