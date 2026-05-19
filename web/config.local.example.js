/**
 * 本地开发配置示例
 *
 * 使用方法：cp config.local.example.js config.local.js
 * 然后填入实际值。
 */

export default {
  /** 本地 DeepSeek 代理 (ds2api) */
  deepseekLocal: {
    baseUrl: "http://localhost:6011/v1",
    apiKey: "YOUR_DS2API_KEY",
    defaultModel: "deepseek-v4-flash",
  },
};
