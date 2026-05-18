/**
 * MSW (Mock Service Worker) — Node 端 HTTP mock
 *
 * 使用方式：
 *   1. 默认 handler 在 handlers.ts 中定义（静态 mock）
 *   2. 单个测试可使用 server.use() 覆盖 handler
 *   3. server.use() 的 handler 在 afterEach 中自动清除
 *
 * 参考: https://mswjs.io/docs/integrations/vitest
 */
import { setupServer } from "msw/node";
import { handlers } from "./handlers.js";

export const server = setupServer(...handlers);
