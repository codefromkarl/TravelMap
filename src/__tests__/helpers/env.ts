/**
 * 测试环境 helper — 替代手动 process.env 管理
 *
 * 用法:
 *   import { stubEnv } from "../helpers/env.js";
 *   stubEnv({ GOOGLE_MAPS_API_KEY: "test-key" });
 */

import { afterAll, beforeEach } from "vitest";

/**
 * 在 beforeEach 中 stub 指定环境变量，在 afterAll 中恢复原始值。
 * 自动在每个测试文件中调用，避免 env 泄漏。
 */
export function stubEnv(overrides: Record<string, string | undefined>): void {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  afterAll(() => {
    process.env = originalEnv;
  });
}

/**
 * 创建一个可链式调用的 env stub builder。
 * 在 beforeEach 中应用，在 afterAll 中恢复。
 *
 * 用法:
 *   const env = createEnvStub();
 *   env.beforeEach(); // 在 beforeEach 中恢复 env
 *
 *   // 在单个测试中：
 *   env.set("GOOGLE_MAPS_API_KEY", "test-key");
 *   env.unset("XHS_API_TOKEN");
 */
export function createEnvStub() {
  const originalEnv = { ...process.env };
  const _pending: Record<string, string | undefined> = {};

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  return {
    set(key: string, value: string) {
      process.env[key] = value;
      return this;
    },
    unset(key: string) {
      delete process.env[key];
      return this;
    },
    /** 恢复到原始 env */
    reset() {
      process.env = { ...originalEnv };
      return this;
    },
  };
}
