import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // 测试环境
    environment: "node",

    // 全局 setup/teardown
    setupFiles: ["./src/__tests__/setup.ts"],

    // 测试文件匹配
    include: [
      "src/**/*.test.ts",
      "src/__tests__/**/*.test.ts",
    ],

    // 覆盖率配置
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/__tests__/**",
        "src/types/**",
        "src/**/index.ts",
      ],
      // Phase 3: 逐步提升覆盖率阈值
      thresholds: {
        lines: 30,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },

    // 超时 — Agent 集成测试可能耗时较长
    testTimeout: 30_000,
    hookTimeout: 30_000,

    // 隔离 — 每个 test file 独立 setup/teardown
    pool: "forks",

    // 别名（与 tsconfig 保持一致）
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
