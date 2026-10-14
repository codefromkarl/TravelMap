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
import { defineProject } from "vitest/config";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "src"),
};

// The filename is retained for imports; Vitest reads this list via root test.projects.
export default [
  // ── 后端单元测试 ──────────────────────────────
  defineProject({
    test: {
      name: "backend-unit",
      sequence: { groupOrder: 0 },
      include: ["src/__tests__/unit/**/*.test.ts", "src/__tests__/quality/**/*.test.ts"],
      environment: "node",
      setupFiles: ["./src/__tests__/setup.ts"],
      pool: "forks",
      maxWorkers: 4,
      testTimeout: 30_000,
      hookTimeout: 30_000,
      alias,
    },
  }),

  // ── 后端集成测试 ──────────────────────────────
  defineProject({
    test: {
      name: "backend-integration",
      sequence: { groupOrder: 1 },
      include: ["src/__tests__/integration/**/*.test.ts"],
      environment: "node",
      setupFiles: ["./src/__tests__/setup.ts"],
      pool: "forks",
      maxWorkers: 2,
      testTimeout: 30_000,
      hookTimeout: 30_000,
      alias,
    },
  }),

  // ── 前端单元测试 ──────────────────────────────
  // web/modules/__tests__/*.test.js (浏览器模块)
  // web/__tests__/unit/*.test.ts (Cloudflare Functions)
  defineProject({
    test: {
      name: "frontend-unit",
      sequence: { groupOrder: 0 },
      include: ["web/modules/__tests__/**/*.test.js", "web/__tests__/unit/**/*.test.ts"],
      environment: "node",
      setupFiles: ["./src/__tests__/setup.ts"],
      pool: "forks",
      maxWorkers: 4,
      testTimeout: 30_000,
      hookTimeout: 30_000,
      alias,
    },
  }),

  // ── 跨层集成测试 ──────────────────────────────
  // 前后端联调: Agent → API → 前端渲染
  defineProject({
    test: {
      name: "cross-layer",
      sequence: { groupOrder: 2 },
      include: ["src/__tests__/cross-layer/**/*.test.ts"],
      environment: "node",
      pool: "forks",
      maxWorkers: 1,
      testTimeout: 60_000,
      hookTimeout: 30_000,
      alias,
    },
  }),

  // Real providers are omitted completely unless explicitly requested.
  ...(process.env.AI_E2E === "true"
    ? [
        // ── AI E2E (条件启用) ─────────────────────────
        // 需要 AI_E2E=true 环境变量
        defineProject({
          test: {
            name: "ai-e2e",
            sequence: { groupOrder: 3 },
            include: ["src/__tests__/e2e/**/*.test.ts", "src/__tests__/evaluation/**/*.test.ts"],
            environment: "node",
            setupFiles: ["src/__tests__/helpers/ai-e2e-setup.ts"],
            pool: "forks",
            maxWorkers: 1,
            testTimeout: 180_000,
            hookTimeout: 30_000,
            alias,
          },
        }),
      ]
    : []),
];
