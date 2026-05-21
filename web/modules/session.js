import { agent, currentTripId, setCurrentTripId, showToast } from './context.js';
import { listTrips } from './db.js';

/**
 * 检查 tripPlan 数据完整性
 * 返回缺失坐标的景点数量
 */
function countMissingLocations(tripPlan) {
  if (!tripPlan?.days) return 0;
  let missing = 0;
  for (const day of tripPlan.days) {
    for (const attr of day.attractions || []) {
      const loc = attr.location;
      if (!loc || !loc.latitude || !loc.longitude || (loc.latitude === 0 && loc.longitude === 0)) {
        missing++;
      }
    }
  }
  return missing;
}

// ─── 页面加载时恢复会话 ──────────────────────────────────
export async function tryRestoreSession() {
  try {
    const trips = await listTrips();
    if (trips.length === 0) return;

    // URL 有 ?trip= 参数时不自动恢复
    if (new URLSearchParams(window.location.search).get("trip")) return;

    const latest = trips[0];
    const timeDiff = Date.now() - new Date(latest.updatedAt).getTime();
    // 只恢复 24 小时内的行程
    if (timeDiff >= 24 * 60 * 60 * 1000) return;

    // 恢复 tripPlan（结构化数据）
    if (latest.tripPlan) {
      window._lastTripPlan = latest.tripPlan;
      // 校验坐标完整性
      try {
        const { validateAndWarn } = await import('./tools/validate-trip.js');
        const result = validateAndWarn(latest.tripPlan);
        if (result.hasIssues) {
          showToast('行程数据不完整：' + result.missingCoords.length + ' 个景点缺少坐标，建议重新生成', 5000, 'warning');
        }
      } catch (_) { /* 校验模块加载失败不阻塞恢复 */ }
    }

    // 恢复对话历史
    if (latest.messages && Array.isArray(latest.messages) && latest.messages.length > 0) {
      agent.state.messages = latest.messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));
    }

    setCurrentTripId(latest.id);

    // 渲染地图（带坐标补全）
    if (latest.tripPlan) {
      const missingCount = countMissingLocations(latest.tripPlan);
      if (missingCount > 0) {
        console.warn(`[Session] 行程有 ${missingCount} 个景点缺少坐标，正在自动补全...`);
        showToast(`正在补全 ${missingCount} 个景点坐标...`, 2000, 'default');
      }
      if (typeof window._renderTripAnimated === "function") {
        window._renderTripAnimated(latest.tripPlan);
      } else if (typeof window._initPageMap === "function") {
        window._initPageMap();
      }
    }

    // 隐藏欢迎页
    document.getElementById("welcome")?.classList.add("hidden");
    const welcomeEl = document.getElementById('map-chat-welcome');
    if (welcomeEl) welcomeEl.style.display = 'none';

    // 显示导出工具栏
    if (latest.tripPlan || latest.markdown) {
      document.getElementById("export-toolbar")?.classList.add("visible");
      ["btn-export-md", "btn-export-pdf", "btn-share-image", "btn-share-link-new", "btn-share-qr", "btn-map", "btn-tts", "btn-poster", "btn-voice-companion"].forEach(id => {
        document.getElementById(id)?.classList.remove("disabled-ghost");
      });
    }

    showToast(`已恢复：${latest.title}`, 2500, 'success');
  } catch (err) {
    console.error("[Session] 恢复失败:", err);
  }
}