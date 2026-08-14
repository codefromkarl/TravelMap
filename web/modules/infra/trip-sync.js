/**
 * 行程云同步 — 换设备不丢数据
 *
 * 仅在非 localhost 生效（本地开发/E2E 的静态服务器没有 /api/trips 路由）。
 * 合并策略（按 updatedAt）：
 *  - 本地独有，或本地 updatedAt 新于服务端 → 上传（PUT /api/trips/<id>）
 *  - 服务端独有，或服务端 updatedAt 新于本地 → 下载（GET /api/trips/<id>）→ saveTripPlan 入库
 *  - 删除只删除本地，不传播到云端（简单化，避免误删其它设备数据）
 * 失败静默，不阻塞主流程；同一 trip 5 秒内不重复上传，上传失败静默重试一次。
 */

import { listTrips, loadTripById, saveTripPlan } from "../db.js";

const SYNC_DEBOUNCE_MS = 5000;
const UPLOAD_COOLDOWN_MS = 5000;

let inited = false;
let debounceTimer = null;
let syncing = null;
const recentUploads = new Map();

function isLocalHost() {
  if (typeof location === "undefined") return true;
  return ["localhost", "127.0.0.1"].includes(location.hostname);
}

function withinCooldown(id) {
  const last = recentUploads.get(id) || 0;
  return Date.now() - last < UPLOAD_COOLDOWN_MS;
}

async function fetchTripList() {
  try {
    const response = await fetch("/api/trips", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response || !response.ok) return null;
    const data = await response.json().catch(() => null);
    return data && Array.isArray(data.trips) ? data.trips : null;
  } catch {
    return null;
  }
}

async function fetchTrip(id) {
  try {
    const response = await fetch("/api/trips/" + encodeURIComponent(id), {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response || !response.ok) return null;
    const data = await response.json().catch(() => null);
    return data && data.trip ? data.trip : null;
  } catch {
    return null;
  }
}

async function uploadTrip(trip) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch("/api/trips/" + encodeURIComponent(trip.id), {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip }),
      });
      if (response && response.ok) return true;
    } catch {
      // 静默，进入下一次重试
    }
  }
  return false;
}

async function runSync() {
  try {
    const serverTrips = await fetchTripList();
    if (!serverTrips) return;

    const localTrips = await listTrips();
    const serverMap = new Map(serverTrips.map((trip) => [trip.id, trip]));

    // 1. 本地 → 服务端：本地独有，或本地更新 → 上传
    for (const localTrip of localTrips) {
      const serverTrip = serverMap.get(localTrip.id);
      const localUpdatedAt = localTrip.updatedAt || "";
      const serverUpdatedAt = serverTrip?.updatedAt || "";
      if (serverTrip && localUpdatedAt <= serverUpdatedAt) continue;
      if (withinCooldown(localTrip.id)) continue;
      const uploaded = await uploadTrip(localTrip);
      if (uploaded) recentUploads.set(localTrip.id, Date.now());
    }

    // 2. 服务端 → 本地：本地缺失，或服务端更新 → 下载
    for (const serverTrip of serverTrips) {
      const localTrip = await loadTripById(serverTrip.id);
      if (localTrip && (localTrip.updatedAt || "") >= (serverTrip.updatedAt || "")) continue;
      const fullTrip = await fetchTrip(serverTrip.id);
      if (!fullTrip) continue;
      await saveTripPlan(fullTrip);
    }
  } catch {
    // 同步失败静默，不阻塞主流程
  }
}

/**
 * 执行一次云同步（合并本地与服务端行程）。
 * 仅非 localhost 生效；并发调用复用同一在途同步；失败静默。
 */
export async function syncTrips() {
  if (isLocalHost()) return;
  if (syncing) return syncing;
  syncing = runSync();
  try {
    await syncing;
  } catch {
    // runSync 自身已兜底，这里再兜一层
  } finally {
    syncing = null;
  }
}

/**
 * 初始化行程同步：监听本地变更事件（debounce 5s）+ pagehide 尽力冲刷。
 * 幂等；失败静默，不阻塞主流程。
 */
export function initTripSync() {
  if (typeof window === "undefined") return;
  if (inited) return;
  inited = true;

  window.addEventListener("travelmap-trip-changed", () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void syncTrips();
    }, SYNC_DEBOUNCE_MS);
  });

  window.addEventListener("pagehide", () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = null;
    void syncTrips();
  });
}
