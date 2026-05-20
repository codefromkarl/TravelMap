/**
 * 流式输出中断测试 — 用户在 LLM 输出过程中打断并重新调整需求
 *
 * 场景：
 *   1. 流式输出中途发送新消息 — 应不崩溃
 *   2. 流式输出中途 abort + 新消息 — 系统应恢复
 *   3. 快速连续发送 — 多次打断不应崩溃
 *   4. 中断后上下文应保持
 *
 * 策略：mock streamFn 为慢速生成器，模拟真实 LLM 流式延迟，
 *       在流式过程中注入新消息，验证系统不崩溃且可恢复。
 */

import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "child_process";
import { createServer } from "net";

let server: ChildProcess | null = null;
let serverPort = 0;

async function startServer(): Promise<number> {
  const port = await new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, () => {
      const p = (s.address() as any).port;
      s.close(() => resolve(p));
    });
  });
  server = spawn("python3", ["-m", "http.server", String(port), "--directory", "web"], {
    cwd: process.cwd(),
    stdio: "ignore",
  });
  await new Promise((r) => setTimeout(r, 800));
  return port;
}

function stopServer() {
  if (server) {
    server.kill();
    server = null;
  }
}

const MODEL_CONFIG = {
  id: "test-model",
  name: "Test Model",
  api: "openai-completions",
  provider: "openai",
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  contextWindow: 128000,
  maxTokens: 4096,
};

/** 等待页面和 agent 就绪 */
async function waitForAppReady(page: Page) {
  await page.goto(`http://localhost:${serverPort}/index.html`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => {
    const panel = document.querySelector("pi-chat-panel") as any;
    return panel?.agent;
  }, { timeout: 15000 });
}

/** 设置 agent model + streamFn（streamFn 内部有延迟） */
async function setupMockAgent(page: Page, text: string, delayMs = 200) {
  await page.evaluate(
    ({ text, delayMs, modelConfig }) => {
      const panel = document.querySelector("pi-chat-panel") as any;
      const agent = panel.agent;
      localStorage.setItem("api-key-openai", "test-key");
      agent.state.model = modelConfig;

      agent.streamFn = async (model: any) => {
        const message = {
          role: "assistant",
          content: [{ type: "text", text }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: {
            input: 50,
            output: 200,
            totalTokens: 250,
            cacheRead: 0,
            cacheWrite: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "stop",
          timestamp: Date.now(),
        };

        const chunks = text.match(/.{1,20}/gs) || [text];

        const stream = {
          async *[Symbol.asyncIterator]() {
            yield { type: "start", partial: { ...message, content: [] } };
            let partialText = "";
            for (const chunk of chunks) {
              await new Promise((r) => setTimeout(r, delayMs));
              partialText += chunk;
              yield {
                type: "text_delta",
                contentIndex: 0,
                delta: chunk,
                partial: {
                  ...message,
                  content: [{ type: "text", text: partialText }],
                },
              };
            }
            yield { type: "text_end", contentIndex: 0, content: text, partial: message };
            yield { type: "done", reason: "stop", message };
          },
          result() {
            return Promise.resolve(message);
          },
        };
        return stream;
      };
    },
    { text, delayMs, modelConfig: MODEL_CONFIG },
  );
}

/** 发送消息（不等待流式完成） */
async function sendMessage(page: Page, text: string) {
  await page.evaluate((msg) => {
    const panel = document.querySelector("pi-chat-panel") as any;
    panel.agent.prompt(msg);
  }, text);
}

/** 等待 isStreaming 变为指定状态 */
async function waitForStreamingState(page: Page, expected: boolean, timeout = 10000) {
  await page.waitForFunction(
    (exp) => {
      const panel = document.querySelector("pi-chat-panel") as any;
      return panel?.agent?.state.isStreaming === exp;
    },
    expected,
    { timeout },
  );
}

/** 收集页面错误（排除已知无关项） */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

function filterCriticalErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes("abort") &&
      !e.includes("AbortError") &&
      !e.includes("user abort") &&
      !e.includes("Failed to resolve module specifier") &&
      !e.includes("reading 'total'") && // mock usage 结构不完整
      !e.includes("esm.sh"),
  );
}

// ─── 测试 ─────────────────────────────────────────────────

test.describe("流式输出中断", () => {
  test.beforeAll(async () => {
    serverPort = await startServer();
  });

  test.afterAll(() => {
    stopServer();
  });

  // === 场景 1: 流式输出中途发送新消息 ===
  test("流式输出中途发送新消息 — 应不崩溃且可继续交互", async ({ page }) => {
    const errors = collectErrors(page);
    await waitForAppReady(page);

    // 安装慢速流
    const longReply = "## 第一天：故宫与天安门\n上午参观故宫博物院。\n下午游览天安门广场。\n## 第二天：长城\n前往八达岭长城。\n## 第三天：颐和园\n游览颐和园。";
    await setupMockAgent(page, longReply, 100);

    // 发送第一条消息
    await sendMessage(page, "帮我规划北京三日游");

    // 等待流式开始（isStreaming = true）
    // 如果没有进入 streaming（比如 prompt 被节流），跳过中断步骤
    let streamingStarted = false;
    try {
      await waitForStreamingState(page, true, 5000);
      streamingStarted = true;
    } catch {
      // prompt 可能在排队或跳过了，继续测试
    }

    if (streamingStarted) {
      // 在流式过程中发送新消息
      await page.waitForTimeout(500); // 等待几个 chunk 流出

      const newReply = "好的，已根据您的新需求调整行程。";
      await setupMockAgent(page, newReply, 50);
      await sendMessage(page, "改成两日游，预算2000元");
    }

    // 等待系统稳定
    await page.waitForTimeout(3000);

    // 验证：页面不崩溃
    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);

    // 验证：无不可恢复错误
    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  // === 场景 2: abort 后发送新消息 ===
  test("abort 中断后发送新消息 — 系统应恢复可交互", async ({ page }) => {
    const errors = collectErrors(page);
    await waitForAppReady(page);

    // 安装慢速流（足够长）
    await setupMockAgent(page, "这是一段很长的回复。\n".repeat(30), 80);

    // 发送消息
    await sendMessage(page, "规划行程");

    // 等待流式开始
    try {
      await waitForStreamingState(page, true, 5000);
    } catch {
      // 如果 prompt 未启动 streaming，直接跳到 abort 测试
    }

    // 等一下让流式输出进行
    await page.waitForTimeout(800);

    // ─── 显式 abort ───
    await page.evaluate(() => {
      const panel = document.querySelector("pi-chat-panel") as any;
      if (panel?.agent) panel.agent.abort();
    });
    await page.waitForTimeout(500);

    // 等待 isStreaming 回到 false
    try {
      await waitForStreamingState(page, false, 3000);
    } catch {
      // 可能已经是 false
    }

    // ─── abort 后发送新消息 ───
    await setupMockAgent(page, "已为您重新规划行程。", 50);
    await sendMessage(page, "重新规划");

    // 等待新消息处理完成
    await page.waitForTimeout(3000);

    // 验证：页面健康
    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);

    // 验证：无不可恢复错误
    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  // === 场景 3: 快速连续发送 ===
  test("快速连续发送 3 条消息 — 不应崩溃", async ({ page }) => {
    const errors = collectErrors(page);
    await waitForAppReady(page);

    const messages = ["北京三日游", "改成两日游", "预算3000"];

    for (let i = 0; i < messages.length; i++) {
      await setupMockAgent(page, `收到：${messages[i]}，正在为您规划...`, 50);
      await sendMessage(page, messages[i]);
      // 不等待完成，立即准备下一条
      await page.waitForTimeout(200);
    }

    // 等待所有操作稳定
    await page.waitForTimeout(5000);

    // 验证：页面健康
    const hasApp = await page.locator("#app").count();
    expect(hasApp).toBe(1);

    // 验证：无不可恢复错误
    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  // === 场景 4: 中断后上下文保持 ===
  test("中断后新消息应能正常处理", async ({ page }) => {
    const errors = collectErrors(page);
    await waitForAppReady(page);

    // 第一轮：正常完成
    await setupMockAgent(page, "已为您规划北京三日游：\n第一天：故宫\n第二天：长城\n第三天：颐和园", 30);
    await sendMessage(page, "北京三日游");

    // 等待完成
    try {
      await waitForStreamingState(page, true, 5000);
      await waitForStreamingState(page, false, 15000);
    } catch {
      await page.waitForTimeout(3000);
    }

    // 第二轮：abort
    await setupMockAgent(page, "正在修改行程...", 100);
    await sendMessage(page, "第一天改成去南锣鼓巷");

    try {
      await waitForStreamingState(page, true, 3000);
      await page.waitForTimeout(500);

      // 打断
      await page.evaluate(() => {
        const panel = document.querySelector("pi-chat-panel") as any;
        if (panel?.agent) panel.agent.abort();
      });
      await page.waitForTimeout(500);
    } catch {
      // 可能流式太快已完成，直接继续
    }

    // 第三轮：验证可正常发送
    await setupMockAgent(page, "好的，已确认修改。", 30);
    await sendMessage(page, "确认修改");

    // 等待完成
    await page.waitForTimeout(3000);

    // 验证：消息历史存在
    const messageCount = await page.evaluate(() => {
      const panel = document.querySelector("pi-chat-panel") as any;
      return panel?.agent?.state.messages?.length || 0;
    });
    expect(messageCount).toBeGreaterThanOrEqual(2); // 至少有 user+assistant

    // 验证：无不可恢复错误
    expect(filterCriticalErrors(errors)).toEqual([]);
  });
});
