/**
 * 应用配置统一入口
 *
 * 优先级：config.local.js（不入库） > 内置默认值
 * 使用方法：import { config, resolveApiKey } from './config.js';
 */

import { isProxyMode } from './context.js?v=3';

const defaults = {
  deepseekLocal: {
    baseUrl: "http://localhost:6011/v1",
    apiKey: "",
    defaultModel: "deepseek-v4-flash",
  },
};

// 同步加载本地配置（config.local.js 是静态 ES Module，浏览器会缓存）
let localConfig = {};
try {
  // 使用动态 import 但立即同步处理 — 模块加载是并行的，在 initApp 之前已完成
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
 * 优先级：localStorage 用户配置 > config.local.js > 代理模式
 */
export function resolveApiKey(provider) {
  if (isProxyMode) return 'proxy';
  const stored = localStorage.getItem(`api-key-${provider}`);
  if (stored) return stored;
  if (provider === 'deepseek' && !localStorage.getItem('travel-agent-provider')) {
    return config.deepseekLocal.apiKey || undefined;
  }
  return undefined;
}
