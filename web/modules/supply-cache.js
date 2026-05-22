// ─── 补给点缓存 ──────────────────────────────────────────
// 导出 re-export，实际实现在 db.js 中以便复用 openDB

export {
  saveSupplyPointsToCache,
  loadSupplyPointsFromCache,
  clearExpiredSupplyCache,
} from './db.js?v=7';