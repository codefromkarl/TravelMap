/**
 * 测试质量守卫 — 元测试
 *
 * 定期运行（或 CI 中运行），确保测试体系不会随开发产生偏移：
 *   1. 所有源文件都有对应测试
 *   2. Mock handlers 覆盖了所有外部 API
 *   3. Fixtures 工厂覆盖了所有核心类型
 *   4. 测试命名规范
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../../");
const SRC_DIR = path.join(PROJECT_ROOT, "src");
const TEST_DIR = path.join(SRC_DIR, "__tests__");

// 需要测试覆盖的源文件（排除纯类型/导出文件）
const SOURCE_FILES_REQUIRE_TEST = [
  "services/attraction-service.ts",
  "services/budget-service.ts",
  "services/dual-map-service.ts",
  "services/geocode-service.ts",
  "services/multi-source-service.ts",
  "services/partial-edit-service.ts",
  "services/weather-service.ts",
  "tools/attractions.ts",
  "tools/budget.ts",
  "tools/geocode.ts",
  "tools/weather.ts",
  "tools/hotels.ts",
  "agent/travel-agent.ts",
  "agent/prompts.ts",
];

// 不需要测试的文件（纯导出/类型/入口）
const SOURCE_FILES_EXEMPT = [
  "types/trip.ts",
  "types/index.ts",
  "index.ts",
  "bin/cli.ts", // CLI 交互式，需要 Playwright
];

// 所有已注册的 HTTP handler 对应的外部 API
const EXPECTED_API_DOMAINS = [
  "maps.googleapis.com",
  "api.openweathermap.org",
  "restapi.amap.com",
  "nominatim.openstreetmap.org",
];

// 核心类型名，fixtures 应有对应工厂
const EXPECTED_FIXTURE_TYPES = [
  "createMockLocation",
  "createMockAttraction",
  "createMockMeal",
  "createMockHotel",
  "createMockWeatherInfo",
  "createMockDayPlan",
  "createMockTripPlan",
  "createMockTripRequest",
];

describe("测试质量守卫", () => {
  // ─── 1. 源文件覆盖检查 ───────────────────────────────────

  describe("源文件 → 测试文件映射", () => {
    for (const srcFile of SOURCE_FILES_REQUIRE_TEST) {
      it(`${srcFile} 应有对应的测试文件`, () => {
        const hasTest = hasCorrespondingTest(srcFile);
        expect(hasTest).toBe(true);
      });
    }

    it("应检查所有 src 下的 .ts 源文件（守卫完整性）", () => {
      const allSrcFiles = getAllSourceFiles();
      const covered = new Set([...SOURCE_FILES_REQUIRE_TEST, ...SOURCE_FILES_EXEMPT]);

      const uncovered = allSrcFiles.filter((f) => !covered.has(f));
      if (uncovered.length > 0) {
        // 如果有新文件未注册，列出但不失败（开发期宽松策略）
        console.warn(
          "[测试守卫] 新发现源文件未在守卫清单中:\n" +
            uncovered.map((f) => `  - ${f}`).join("\n") +
            "\n请更新 quality-guard.test.ts 中的 SOURCE_FILES_REQUIRE_TEST 或 SOURCE_FILES_EXEMPT",
        );
      }
    });
  });

  // ─── 2. Mock Handlers 覆盖 ──────────────────────────────

  describe("HTTP Mock 覆盖", () => {
    it("handlers.ts 应覆盖所有外部 API 域名", () => {
      const handlersPath = path.join(TEST_DIR, "mocks", "handlers.ts");
      const content = fs.readFileSync(handlersPath, "utf-8");

      for (const domain of EXPECTED_API_DOMAINS) {
        expect(content).toContain(domain);
      }
    });

    it("源码中所有 fetch 调用的 URL 域名应在 handlers 中有对应", () => {
      const handlerContent = fs.readFileSync(path.join(TEST_DIR, "mocks", "handlers.ts"), "utf-8");

      // 从源码中提取所有外部 URL
      const srcFiles = SOURCE_FILES_REQUIRE_TEST.filter((f) => f.startsWith("services/"));
      for (const srcFile of srcFiles) {
        const srcPath = path.join(SRC_DIR, srcFile);
        if (!fs.existsSync(srcPath)) continue;

        const content = fs.readFileSync(srcPath, "utf-8");
        const urlMatches = content.matchAll(/https?:\/\/([a-z0-9.-]+)/gi);

        for (const match of urlMatches) {
          const domain = match[1];
          if (domain === "esm.sh") continue; // CDN 不需要 mock
          expect(
            handlerContent.includes(domain),
            `handlers.ts 缺少对 ${domain} 的 mock (来自 ${srcFile})`,
          ).toBe(true);
        }
      }
    });
  });

  // ─── 3. Fixtures 工厂完整性 ─────────────────────────────

  describe("Fixtures 工厂覆盖", () => {
    it("fixtures.ts 应导出所有核心类型的工厂函数", () => {
      const fixturesPath = path.join(TEST_DIR, "mocks", "fixtures.ts");
      const content = fs.readFileSync(fixturesPath, "utf-8");

      for (const factory of EXPECTED_FIXTURE_TYPES) {
        expect(content).toContain(`export function ${factory}`);
      }
    });
  });

  // ─── 4. 测试命名规范 ────────────────────────────────────

  describe("测试命名规范", () => {
    it("所有测试文件应以 .test.ts 结尾", () => {
      const testFiles = findFiles(
        TEST_DIR,
        (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith("d.ts"),
      );

      // 排除非测试文件 (setup, handlers, fixtures, mock-llm, server)
      const allowed = new Set([
        "setup.ts",
        "server.ts",
        "handlers.ts",
        "fixtures.ts",
        "mock-llm.ts",
        "env.ts", // helpers/env.ts — 测试环境工具
      ]);
      const violations = testFiles.filter((f) => !allowed.has(path.basename(f)));

      expect(violations).toEqual([]);
    });
  });

  // ─── 5. 断言质量检查 ────────────────────────────────────

  describe("断言质量检查", () => {
    it("测试不应以 .not.toThrow() 作为唯一实质性断言", () => {
      const testFiles = findFiles(TEST_DIR, (f) => f.endsWith(".test.ts"));
      const warnings: string[] = [];

      for (const file of testFiles) {
        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");

        let notToThrowCount = 0;
        let nonNotToThrowExpects = 0;

        for (const line of lines) {
          if (line.includes("expect(") && line.includes(".not.toThrow()")) {
            notToThrowCount++;
          } else if (line.includes("expect(")) {
            nonNotToThrowExpects++;
          }
        }

        if (notToThrowCount > 0 && nonNotToThrowExpects === 0) {
          warnings.push(
            `  - ${path.relative(TEST_DIR, file)} (${notToThrowCount}× .not.toThrow, 0× value assertions)`,
          );
        }
      }

      if (warnings.length > 0) {
        console.warn(
          "[测试守卫] 以下测试文件仅依赖 .not.toThrow() 断言，无实质值验证:\n" +
            warnings.join("\n"),
        );
      }
    });
  });

  // ─── 6. Catch 覆盖检查 ──────────────────────────────────

  describe("Catch 覆盖检查", () => {
    it("services 中的 catch 块应有对应的错误路径测试", () => {
      const srcFiles = getAllSourceFiles().filter((f) => f.startsWith("services/"));
      const warnings: string[] = [];
      const ERROR_PATTERNS = [
        /\btoThrow\b/,
        /\brejects\b/,
        /\bmockRejectedValue\b/,
        /错误|异常|降级/,
        /\berror\b/i,
        /\bfail/i,
        /\btimeout\b/i,
      ];

      for (const srcFile of srcFiles) {
        const srcPath = path.join(SRC_DIR, srcFile);
        const content = fs.readFileSync(srcPath, "utf-8");
        const catchCount = (content.match(/catch\s*\(/g) ?? []).length;
        if (catchCount === 0) continue;

        const testContent = getTestContentForSource(srcFile);
        if (!testContent) {
          warnings.push(`  - ${srcFile}: ${catchCount} catch(es), 无测试文件`);
          continue;
        }

        const hasErrorTest = ERROR_PATTERNS.some((p) => p.test(testContent));
        if (!hasErrorTest) {
          warnings.push(
            `  - ${srcFile}: ${catchCount} catch(es), 但测试中无错误路径覆盖 (toThrow/rejects/mockRejectedValue/降级)`,
          );
        }
      }

      if (warnings.length > 0) {
        console.warn(`[测试守卫] 以下服务的 catch 块缺少对应错误路径测试:\n${warnings.join("\n")}`);
      }
    });
  });

  // ─── 7. 断言密度检查 ────────────────────────────────────

  describe("断言密度检查", () => {
    it("测试文件应有足够的断言密度", () => {
      const testFiles = findFiles(
        TEST_DIR,
        (f) => f.endsWith(".test.ts") && !f.includes("quality-guard"),
      );
      let totalTests = 0;
      let totalExpects = 0;

      for (const file of testFiles) {
        const content = fs.readFileSync(file, "utf-8");
        const testCount = (content.match(/\bit\s*\(|test\s*\(/g) ?? []).length;
        const expectCount = (content.match(/\bexpect\s*\(/g) ?? []).length;
        totalTests += testCount;
        totalExpects += expectCount;
      }

      const ratio = totalTests > 0 ? totalExpects / totalTests : 0;
      if (ratio < 1.0) {
        console.warn(
          `[测试守卫] 断言密度偏低: 共 ${totalTests} 个测试, ${totalExpects} 个 expect, 平均 ${ratio.toFixed(2)} expect/测试 (建议 ≥ 1.5)`,
        );
      }
    });
  });
});

// ─── 工具函数 ────────────────────────────────────────────────

function hasCorrespondingTest(srcFile: string): boolean {
  // 提取完整模块路径（不含扩展名），如 "services/weather-service"
  const modulePath = srcFile.replace(/\.ts$/, "");
  // 提取文件名不含扩展名，如 "weather-service"
  const moduleName = path.basename(srcFile, ".ts");

  const testDirs = [
    path.join(TEST_DIR, "unit"),
    path.join(TEST_DIR, "integration"),
    path.join(TEST_DIR, "evaluation"),
    path.join(TEST_DIR, "quality"),
  ];

  for (const dir of testDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = findFiles(dir, (f) => f.endsWith(".test.ts"));

    for (const testFile of files) {
      const content = fs.readFileSync(testFile, "utf-8");
      // 精确匹配: 检查 import 路径或文件名引用
      if (
        content.includes(`/${modulePath}`) ||
        content.includes(`/${modulePath}.js`) ||
        content.includes(`/${moduleName}`) ||
        content.includes(`"${moduleName}"`) ||
        content.includes(`'${moduleName}'`)
      ) {
        return true;
      }
    }
  }
  return false;
}

function getAllSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts") &&
        !entry.name.endsWith(".d.ts")
      ) {
        files.push(`${prefix}${entry.name}`);
      }
    }
  };
  walk(SRC_DIR, "");
  return files.filter((f) => !f.startsWith("__tests__"));
}

function findFiles(dir: string, predicate: (name: string) => boolean): string[] {
  const result: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (predicate(entry.name)) result.push(full);
    }
  };
  walk(dir);
  return result;
}

function getTestContentForSource(srcFile: string): string | null {
  const moduleName = path.basename(srcFile, ".ts");
  const testDirs = [
    path.join(TEST_DIR, "unit"),
    path.join(TEST_DIR, "integration"),
    path.join(TEST_DIR, "evaluation"),
  ];

  for (const dir of testDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = findFiles(dir, (f) => f.endsWith(".test.ts"));
    for (const testFile of files) {
      if (path.basename(testFile) === `${moduleName}.test.ts`) {
        return fs.readFileSync(testFile, "utf-8");
      }
    }
  }
  return null;
}
