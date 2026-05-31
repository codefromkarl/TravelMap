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

// 高德地图默认 Key（仅白名单域名 + localhost 使用）
export const _DEFAULT_AMAP_KEY = 'e134de721c4969afee0b5b82f2a232a4'; // Web端(JS API) - 地图瓦片
export const _DEFAULT_AMAP_GEO_KEY = '74301f4873f7e09e18c9e39bf65c6256'; // Web服务 - 地理编码
export const _ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'codefromkarl.xyz', 'www.codefromkarl.xyz', 'travel-agent-ebl.pages.dev'];

export function getAmapKey() {
  const userKey = localStorage.getItem('api-key-amap-web');
  if (userKey) return userKey;
  return _DEFAULT_AMAP_KEY; // 直接返回默认 Key
}

export function getAmapGeoKey() {
  const userKey = localStorage.getItem('api-key-amap-geo');
  if (userKey) return userKey;
  return _DEFAULT_AMAP_GEO_KEY; // 直接返回默认 Key
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

// ─── 城市中心坐标（GCJ-02 坐标系，与高德瓦片一致） ──────────
// 注意：这些坐标已转换为 GCJ-02，可直接用于高德瓦片渲染
export const CITY_CENTERS = {
  '北京':[39.9087,116.4214],'上海':[31.2345,121.4879],'广州':[23.1317,113.2786],
  '深圳':[22.5467,114.0733],'成都':[30.5763,104.0804],'杭州':[30.2783,120.1693],
  '西安':[34.3453,108.9537],'重庆':[29.5666,106.5653],'南京':[32.0639,118.8107],
  '武汉':[30.5964,114.3093],'长沙':[28.2317,112.9526],'苏州':[31.3026,120.5988],
  '厦门':[24.4835,118.1025],'青岛':[36.0707,120.3961],'大连':[38.9176,121.6284],
  '昆明':[25.0424,102.7318],'三亚':[18.2562,109.5253],'桂林':[25.2380,110.1936],
  '拉萨':[29.6537,91.1136],'天津':[39.1289,117.2042],'哈尔滨':[45.8076,126.5489],
  '黄山':[30.1336,118.1836],'丽江':[26.8735,100.2434],'张家界':[29.1236,110.4935],
  '九寨沟':[33.2636,103.9335],'洛阳':[34.6236,112.4635],'无锡':[31.4936,120.3235],
  '乌镇':[30.7536,120.4935],'嘉兴':[30.7536,120.7735],
};

// ─── 国内城市列表（用于地图判断） ────────────────────────
export const DOMESTIC_CITIES = [
  "北京","上海","广州","深圳","成都","杭州","西安","重庆","南京","武汉","长沙",
  "苏州","厦门","青岛","大连","昆明","丽江","三亚","桂林","张家界","黄山","九寨沟",
  "拉萨","天津","哈尔滨","沈阳","济南","郑州","福州","合肥","贵阳","南宁","海口",
  "石家庄","太原","兰州","银川","西宁","呼和浩特","乌鲁木齐","长春","南昌",
];

// ─── Provider 注册表 ────────────────────────────────────
// 统一管理所有 provider 的元数据
export const PROVIDER_REGISTRY = {
  'mimo3': {
    name: 'MiMo3',
    displayName: 'MiMo3 (本地)',
    free: true,
    requiresKey: false,
    baseUrl: '',
    defaultModel: 'mimo3',
    models: ['mimo3', 'mimo-v2.5-pro'],
    piProvider: 'openai',
  },
  'deepseek-local': {
    name: 'DeepSeek 本地',
    displayName: 'DeepSeek 本地 (免费)',
    free: true,
    requiresKey: false,
    baseUrl: 'http://localhost:6011/v1',
    defaultModel: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-flash-nothinking', 'deepseek-v4-pro', 'deepseek-v4-pro-nothinking'],
    // 映射到 pi-ai 的 provider（因为使用 OpenAI 兼容 API）
    piProvider: 'openai',
  },
  openai: {
    name: 'OpenAI',
    displayName: 'OpenAI',
    free: false,
    requiresKey: true,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o3-mini'],
    piProvider: 'openai',
  },
  anthropic: {
    name: 'Anthropic',
    displayName: 'Anthropic',
    free: false,
    requiresKey: true,
    models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
    piProvider: 'anthropic',
  },
  google: {
    name: 'Google',
    displayName: 'Google',
    free: false,
    requiresKey: true,
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    piProvider: 'google',
  },
  deepseek: {
    name: 'DeepSeek',
    displayName: 'DeepSeek',
    free: false,
    requiresKey: true,
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    piProvider: 'deepseek',
  },
  openrouter: {
    name: 'OpenRouter',
    displayName: 'OpenRouter',
    free: false,
    requiresKey: true,
    models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4-20250514', 'google/gemini-2.5-pro'],
    piProvider: 'openrouter',
  },
  sensenova: {
    name: '商汤',
    displayName: '商汤 SenseNova',
    free: false,
    requiresKey: true,
    models: ['deepseek-v4-flash'],
    piProvider: 'sensenova',
  },
  custom: {
    name: '自定义',
    displayName: '自定义 / Custom',
    free: false,
    requiresKey: true,
    models: [],
    piProvider: 'openai',
  },
};

// ─── 预设模型列表（向后兼容） ──────────────────────────
export const PROVIDER_MODELS = Object.fromEntries(
  Object.entries(PROVIDER_REGISTRY).map(([key, config]) => [key, config.models])
);

// 获取免费 provider 列表
export function getFreeProviders() {
  return Object.entries(PROVIDER_REGISTRY)
    .filter(([_, config]) => config.free)
    .map(([key]) => key);
}

// 获取需要 API key 的 provider 列表
export function getKeyRequiredProviders() {
  return Object.entries(PROVIDER_REGISTRY)
    .filter(([_, config]) => config.requiresKey)
    .map(([key]) => key);
}

// 判断 provider 是否免费
export function isFreeProvider(provider) {
  return PROVIDER_REGISTRY[provider]?.free ?? false;
}

// 判断 provider 是否需要 API key
export function requiresApiKey(provider) {
  return PROVIDER_REGISTRY[provider]?.requiresKey ?? true;
}

// 获取 provider 的 pi-ai provider 名称
export function getPiProvider(provider) {
  return PROVIDER_REGISTRY[provider]?.piProvider ?? provider;
}

// 获取 provider 的 baseUrl（如果有的话）
export function getProviderBaseUrl(provider) {
  return PROVIDER_REGISTRY[provider]?.baseUrl;
}

// 获取 provider 的默认模型
export function getDefaultModel(provider) {
  return PROVIDER_REGISTRY[provider]?.defaultModel;
}

// ─── 测试成功的 provider 管理 ────────────────────────────
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

// 获取可用的 provider 列表（免费 + 测试成功）
export function getAvailableProviders() {
  const freeProviders = getFreeProviders();
  const testedProviders = getTestedProviders();
  return [...new Set([...freeProviders, ...testedProviders])];
}

// ─── LLM 厂商域名映射 ──────────────────────────────────
export const LLM_HOSTS = {
  'api.openai.com': 'openai',
  'api.anthropic.com': 'anthropic',
  'generativelanguage.googleapis.com': 'google',
  'api.deepseek.com': 'deepseek',
  'openrouter.ai': 'openrouter',
  'token.sensenova.cn': 'sensenova',
  'localhost': 'deepseek-local',
  '127.0.0.1': 'deepseek-local',
};

// ─── 地图风险颜色 ──────────────────────────────────────
export const RISK_COLORS = {
  1: { stroke: "#22c55e", fill: "#86efac", fill2: "#4ade80", bg: "rgba(34,197,94,0.15)", label: "🟢 低风险", label2: "低风险" },
  2: { stroke: "#f59e0b", fill: "#fcd34d", fill2: "#fbbf24", bg: "rgba(245,158,11,0.15)", label: "🟡 中风险", label2: "中风险" },
  3: { stroke: "#ef4444", fill: "#fca5a5", fill2: "#f87171", bg: "rgba(239,68,68,0.15)", label: "🔴 高风险", label2: "高风险" },
};

// ─── 工具函数 ────────────────────────────────────────────
// showToast 已迁移到 feedback.js，这里 re-export 保持向后兼容
export { showToast } from '../feedback.js';

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
export function setCurrentPage(p) { currentPage = p; }// force update 2026年 05月 26日 星期二 09:29:12 CST
// test 2026年 05月 26日 星期二 09:54:59 CST
// fix amap key 2026年 05月 26日 星期二 10:03:51 CST
// force upload 1779761435
