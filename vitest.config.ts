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
      "web/__tests__/unit/**/*.test.ts",
      "web/modules/__tests__/**/*.test.js",
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
        // WIP / 未实现模块，暂时排除覆盖率检查
        "src/services/dianping-scrape-service.ts",
      ],
      // Phase 5: 调整覆盖率阈值（平衡测试成本与覆盖率）
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85,
      },
    },

    // 超时 — Agent 集成测试可能耗时较长
    testTimeout: 30_000,
    hookTimeout: 30_000,

    // 隔离 — 每个 test file 独立 setup/teardown
    pool: "forks",

    // 限制并发 worker 数量，避免内存爆炸
    // 28 核 CPU，默认会创建 27 个 worker，每个 ~500MB
    // 限制为 4 个 worker，内存占用从 11GB 降到 ~2GB
    poolOptions: {
      forks: {
        maxForks: 4,
        minForks: 1,
      },
    },

    // 别名（与 tsconfig 保持一致）
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
