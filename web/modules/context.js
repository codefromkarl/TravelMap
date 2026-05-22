// ─── 共享可变状态 ──────────────────────────────────────
// 所有模块从这里 import 替代全局作用域

export let agent = null;
export let currentTripId = null;
export let currentLang = localStorage.getItem("travel-agent-lang") || "zh";
export let chatPanel = null;
export let appStorage = null;

// 认证相关
export let currentUser = null;
export let quotaRemaining = 0;

// 代理模式
export let isProxyMode = false;

// 导出相关
export let lastTripContent = "";

// 面板
export let activePanel = null;

// 出行人群
export let currentTravelers = null;

// 用户偏好
export let currentPreferences = null;
export const PREFERENCES_KEY = "travel-agent-preferences";

// 导航
export let currentPage = 'page-map';

// ─── 常量 ────────────────────────────────────────────────
export const EXPORT_STORAGE_KEY = "travel-agent-exported-trips";
export const TRAVELERS_KEY = "travel-agent-travelers";
export const DB_NAME = "TravelAgentDB";
export const DB_VERSION = 3;
export const STORE_NAME = "trips";
export const SUPPLY_STORE_NAME = "supplyPoints";

// 测试成功的 provider 列表存储 key
export const TESTED_PROVIDERS_KEY = "travel-agent-tested-providers";

// 获取测试成功的 provider 列表
export function getTestedProviders() {
  try {
    const stored = localStorage.getItem(TESTED_PROVIDERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// 保存测试成功的 provider
export function addTestedProvider(provider) {
  const providers = getTestedProviders();
  if (!providers.includes(provider)) {
    providers.push(provider);
    localStorage.setItem(TESTED_PROVIDERS_KEY, JSON.stringify(providers));
  }
}

// 移除测试成功的 provider
export function removeTestedProvider(provider) {
  const providers = getTestedProviders().filter(p => p !== provider);
  localStorage.setItem(TESTED_PROVIDERS_KEY, JSON.stringify(providers));
}

// 高德地图默认 Key（仅白名单域名 + localhost 使用）
export const _DEFAULT_AMAP_KEY = 'e134de721c4969afee0b5b82f2a232a4'; // Web端(JS API) - 地图瓦片
export const _DEFAULT_AMAP_GEO_KEY = '74301f4873f7e09e18c9e39bf65c6256'; // Web服务 - 地理编码
export const _ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'codefromkarl.xyz', 'www.codefromkarl.xyz'];

export function getAmapKey() {
  const userKey = localStorage.getItem('api-key-amap-web');
  if (userKey) return userKey;
  const host = location.hostname;
  const allowed = _ALLOWED_HOSTS.some(h => host === h || host.endsWith('.' + h));
  return allowed ? _DEFAULT_AMAP_KEY : '';
}

export function getAmapGeoKey() {
  const userKey = localStorage.getItem('api-key-amap-geo');
  if (userKey) return userKey;
  const host = location.hostname;
  const allowed = _ALLOWED_HOSTS.some(h => host === h || host.endsWith('.' + h));
  return allowed ? _DEFAULT_AMAP_GEO_KEY : '';
}

// ─── 补给点类型颜色 ─────────────────────────────────────
export const SUPPLY_COLORS = {
  restaurant: "#f59e0b",
  cafe: "#8b5cf6",
  shop: "#10b981",
  water: "#06b6d4",
  rest_area: "#ec4899",
  toilet: "#6b7280",
};

// ─── 城市中心坐标 ───────────────────────────────────────
export const CITY_CENTERS = {
  '北京':[39.9042,116.4074],'上海':[31.2304,121.4737],'广州':[23.1291,113.2644],
  '深圳':[22.5431,114.0579],'成都':[30.5728,104.0668],'杭州':[30.2741,120.1551],
  '西安':[34.3416,108.9398],'重庆':[29.563,106.5516],'南京':[32.0603,118.7969],
  '武汉':[30.5928,114.3055],'长沙':[28.228,112.9388],'苏州':[31.2989,120.5853],
  '厦门':[24.4798,118.0894],'青岛':[36.0671,120.3826],'大连':[38.914,121.6147],
  '昆明':[25.0389,102.7183],'三亚':[18.2528,109.512],'桂林':[25.2345,110.18],
  '拉萨':[29.65,91.1],'天津':[39.1252,117.1904],'哈尔滨':[45.8038,126.535],
  '黄山':[30.13,118.17],'丽江':[26.87,100.23],'张家界':[29.12,110.48],
  '九寨沟':[33.26,103.92],'洛阳':[34.62,112.45],'无锡':[31.49,120.31],
  '乌镇':[30.75,120.48],'嘉兴':[30.75,120.76],
};

// ─── 国内城市列表（用于地图判断） ────────────────────────
export const DOMESTIC_CITIES = [
  "北京","上海","广州","深圳","成都","杭州","西安","重庆","南京","武汉","长沙",
  "苏州","厦门","青岛","大连","昆明","丽江","三亚","桂林","张家界","黄山","九寨沟",
  "拉萨","天津","哈尔滨","沈阳","济南","郑州","福州","合肥","贵阳","南宁","海口",
  "石家庄","太原","兰州","银川","西宁","呼和浩特","乌鲁木齐","长春","南昌",
];

// ─── LLM 厂商域名映射 ──────────────────────────────────
export const LLM_HOSTS = {
  'api.openai.com': 'openai',
  'api.anthropic.com': 'anthropic',
  'generativelanguage.googleapis.com': 'google',
  'api.deepseek.com': 'deepseek',
  'openrouter.ai': 'openrouter',
  'token.sensenova.cn': 'sensenova',
};

// ─── 预设模型列表 ──────────────────────────────────────
export const PROVIDER_MODELS = {
  'deepseek-local': ['deepseek-v4-flash', 'deepseek-v4-flash-nothinking', 'deepseek-v4-pro', 'deepseek-v4-pro-nothinking'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o3-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  openrouter: ['openai/gpt-4o', 'anthropic/claude-sonnet-4-20250514', 'google/gemini-2.5-pro'],
  sensenova: ['deepseek-v4-flash'],
  custom: [],
};

// ─── 地图风险颜色 ──────────────────────────────────────
export const RISK_COLORS = {
  1: { stroke: "#22c55e", fill: "#86efac", fill2: "#4ade80", bg: "rgba(34,197,94,0.15)", label: "🟢 低风险", label2: "低风险" },
  2: { stroke: "#f59e0b", fill: "#fcd34d", fill2: "#fbbf24", bg: "rgba(245,158,11,0.15)", label: "🟡 中风险", label2: "中风险" },
  3: { stroke: "#ef4444", fill: "#fca5a5", fill2: "#f87171", bg: "rgba(239,68,68,0.15)", label: "🔴 高风险", label2: "高风险" },
};

// ─── 工具函数 ────────────────────────────────────────────
// showToast 已迁移到 feedback.js，这里 re-export 保持向后兼容
export { showToast } from './feedback.js';

export function isDomesticCityForMap(city) {
  return DOMESTIC_CITIES.some(c => city.includes(c) || c.includes(city));
}

// ─── Setter 函数 ─────────────────────────────────────────
export function setAgent(a) { agent = a; }
export function setPreferences(p) { currentPreferences = p; }
export function setCurrentTripId(id) { currentTripId = id; }
export function setCurrentLang(lang) { currentLang = lang; }
export function setChatPanel(c) { chatPanel = c; }
export function setAppStorage(a) { appStorage = a; }
export function setCurrentUser(u) { currentUser = u; }
export function setQuotaRemaining(q) { quotaRemaining = q; }
export function setIsProxyMode(m) { isProxyMode = m; }
export function setLastTripContent(c) { lastTripContent = c; }
export function setActivePanel(p) { activePanel = p; }
export function setCurrentTravelers(t) { currentTravelers = t; }
export function setCurrentPage(p) { currentPage = p; }