/**
 * Vitest 全局 setup
 *
 * - 在每个测试文件运行前/后执行
 * - 负责 MSW 服务端启动/关闭
 * - 提供 global 的 afterAll/afterEach 清理
 */
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mocks/server.js";

// 启动 MSW 拦截器
beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" });
});

// 每个 test case 后重置 handler（清除 runtime handler）
afterEach(() => {
  server.resetHandlers();
});

// 所有测试完成后关闭
afterAll(() => {
  server.close();
});
