/**
 * AI E2E 专用 Vitest 配置
 *
 * 与主配置的区别：
 *   - 不引入 MSW setup（需要真实 API 调用）
 *   - 更长的超时（LLM 响应可能需要 30-60s）
 *   - 仅包含 e2e 和 evaluation 目录的测试
 *   - 需要通过 AI_E2E=true 环境变量显式启用
 */
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",

    // 不引入 MSW setup — AI E2E 需要真实网络请求
    // 但清除代理环境变量，确保本地 Docker API 请求不被代理拦截
    setupFiles: ["src/__tests__/helpers/ai-e2e-setup.ts"],

    // 包含 e2e 和 evaluation 的 AI 测试
    include: [
      "src/__tests__/e2e/**/*.test.ts",
      "src/__tests__/evaluation/**/*.test.ts",
    ],

    // LLM 响应可能较慢
    testTimeout: 180_000,
    hookTimeout: 30_000,

    // 串行执行 — 避免并发导致 API 限流
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,

    // 仅在 AI_E2E=true 时运行
    enabled: process.env.AI_E2E === "true",

    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
