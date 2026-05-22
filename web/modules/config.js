/**
 * 应用配置统一入口
 *
 * 优先级：config.local.js（不入库） > 内置默认值
 * 使用方法：import { config, resolveApiKey } from './config.js?v=6';
 */

import { isProxyMode } from './context.js?v=6';

const defaults = {
  deepseekLocal: {
    baseUrl: "http://localhost:6011/v1",
    apiKey: "",
    defaultModel: "deepseek-v4-flash",
  },
};

// 加载本地配置（config.local.js 不入库，仅本地开发用）
let localConfig = {};
try {
  const mod = await import('../config.local.js');
  localConfig = mod.default || {};
} catch {
  // config.local.js 不存在，使用默认值
}

function merge(section) {
  return { ...defaults[section], ...localConfig[section] };
}

export const config = {
  get deepseekLocal() {
    return merge('deepseekLocal');
  },
};

/**
 * 获取当前应使用的 API Key
 * 生产环境统一走后端代理，前端不接触 API Key
 */
export function resolveApiKey(provider) {
  // 代理模式下由后端提供 Key
  if (isProxyMode) return 'proxy';
  // 本地开发：用户可在 localStorage 自行配置
  const stored = localStorage.getItem(`api-key-${provider}`);
  if (stored) return stored;
  // 生产环境兜底：非 localhost 强制走代理
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!isLocal) return 'proxy';
  return undefined;
}
