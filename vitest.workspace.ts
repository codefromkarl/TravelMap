/**
 * Vitest Workspace — 统一测试运行器
 *
 * 将后端 (Vitest)、前端 (Vitest)、跨层集成测试统一到一个 workspace。
 * 一条命令跑全量测试，合并覆盖率报告。
 *
 * 用法:
 *   vitest run                    # 跑全部 (除 ai-e2e)
 *   vitest run --project backend-unit  # 只跑后端单元
 *   vitest run --project frontend-unit # 只跑前端单元
 *   AI_E2E=true vitest run        # 包含 AI E2E
 */
import { defineWorkspace } from "vitest/config";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "src"),
};

export default defineWorkspace([
  // ── 后端单元测试 ──────────────────────────────
  {
    test: {
      name: "backend-unit",
      include: [
        "src/__tests__/unit/**/*.test.ts",
        "src/__tests__/quality/**/*.test.ts",
      ],
      environment: "node",
      setupFiles: ["./src/__tests__/setup.ts"],
      pool: "forks",
      poolOptions: {
        forks: { maxForks: 4, minForks: 1 },
      },
      testTimeout: 30_000,
      hookTimeout: 30_000,
      alias,
    },
  },

  // ── 后端集成测试 ──────────────────────────────
  {
    test: {
      name: "backend-integration",
      include: ["src/__tests__/integration/**/*.test.ts"],
      environment: "node",
      setupFiles: ["./src/__tests__/setup.ts"],
      pool: "forks",
      poolOptions: {
        forks: { maxForks: 2, minForks: 1 },
      },
      testTimeout: 30_000,
      hookTimeout: 30_000,
      alias,
    },
  },

  // ── 前端单元测试 ──────────────────────────────
  // web/modules/__tests__/*.test.js (浏览器模块)
  // web/__tests__/unit/*.test.ts (Cloudflare Functions)
  {
    test: {
      name: "frontend-unit",
      include: [
        "web/modules/__tests__/**/*.test.js",
        "web/__tests__/unit/**/*.test.ts",
      ],
      environment: "node",
      setupFiles: ["./src/__tests__/setup.ts"],
      pool: "forks",
      poolOptions: {
        forks: { maxForks: 4, minForks: 1 },
      },
      testTimeout: 30_000,
      hookTimeout: 30_000,
      alias,
    },
  },

  // ── 跨层集成测试 ──────────────────────────────
  // 前后端联调: Agent → API → 前端渲染
  {
    test: {
      name: "cross-layer",
      include: ["src/__tests__/cross-layer/**/*.test.ts"],
      environment: "node",
      pool: "forks",
      poolOptions: {
        forks: { maxForks: 1, minForks: 1 },
      },
      testTimeout: 60_000,
      hookTimeout: 30_000,
      alias,
    },
  },

  // ── AI E2E (条件启用) ─────────────────────────
  // 需要 AI_E2E=true 环境变量
  {
    test: {
      name: "ai-e2e",
      include: [
        "src/__tests__/e2e/**/*.test.ts",
        "src/__tests__/evaluation/**/*.test.ts",
      ],
      environment: "node",
      setupFiles: ["src/__tests__/helpers/ai-e2e-setup.ts"],
      enabled: process.env.AI_E2E === "true",
      pool: "forks",
      poolOptions: {
        forks: { maxForks: 1, minForks: 1 },
      },
      testTimeout: 180_000,
      hookTimeout: 30_000,
      alias,
    },
  },
]);
