import { agent, currentTripId, setCurrentTripId, showToast } from './context.js';
import { listTrips } from './db.js';

// ─── 页面加载时恢复会话 ──────────────────────────────────
export async function tryRestoreSession() {
  try {
    const trips = await listTrips();
    if (trips.length > 0 && !new URLSearchParams(window.location.search).get("trip")) {
      const latest = trips[0];
      if (latest.messages && Array.isArray(latest.messages) && latest.messages.length > 0) {
        const timeDiff = Date.now() - new Date(latest.updatedAt).getTime();
        if (timeDiff < 24 * 60 * 60 * 1000) {
          agent.state.messages = [...latest.messages];
          setCurrentTripId(latest.id);
          if (latest.tripPlan) {
            window._lastTripPlan = latest.tripPlan;
            if (typeof window._initPageMap === 'function') window._initPageMap();
          }
          document.getElementById("welcome")?.classList.add("hidden");
          const welcomeEl = document.getElementById('map-chat-welcome');
          if (welcomeEl) welcomeEl.style.display = 'none';
          showToast("已恢复上次的会话", 2500, 'success');
        }
      }
    }
  } catch (err) {
    console.error("Session restore failed:", err);
  }
}