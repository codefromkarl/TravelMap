/**
 * AI E2E 测试 setup
 *
 * 在测试启动前清除代理环境变量，确保本地 Docker API 请求不被代理拦截。
 * Node.js 的 undici/fetch 在进程启动时绑定代理，运行时修改 process.env 无效，
 * 因此必须在 vitest setupFiles 阶段就清除。
 */

// 全局清除代理 — 这在 vitest fork 进程启动时执行
const proxyKeys = [
  "http_proxy",
  "https_proxy",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "all_proxy",
];
for (const k of proxyKeys) {
  if (process.env[k]) {
    console.log(`[ai-e2e-setup] Clearing proxy: ${k}=${process.env[k]?.slice(0, 20)}...`);
    delete process.env[k];
  }
}

console.log("[ai-e2e-setup] Proxy env cleared");
