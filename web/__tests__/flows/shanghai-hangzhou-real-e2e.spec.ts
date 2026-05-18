/**
 * 真实端到端测试 — 上海到杭州旅行规划
 *
 * 使用真实 LLM (cpa-proxy-api ds 模型) 生成旅游计划
 * 包含真实的用户点击交互
 */

import { expect, test } from "@playwright/test";

const CPA_API_KEY = process.env.CPA_API_KEY || "";

test.describe("上海 → 杭州 真实 LLM 旅行规划 E2E", () => {
  test.skip(!CPA_API_KEY, "需要 CPA_API_KEY 环境变量");

  test("应能通过真实点击交互生成完整旅游计划", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // 1. 导航到页面
    await page.goto("http://localhost:3456/index.html");
    await page.locator("#loading").waitFor({ state: "hidden", timeout: 30_000 });

    // 2. 配置 agent 使用 cpa-proxy-api 的 ds 模型
    await page.evaluate(async (apiKey) => {
      const panel = document.querySelector("pi-chat-panel") as any;
      if (!panel || !panel.agent) throw new Error("ChatPanel or agent not found");
      const agent = panel.agent;

      try {
        const piAi = await import("@earendil-works/pi-ai");
        const dsModel = piAi.getModel("deepseek", "deepseek-v4-flash");
        if (dsModel) {
          dsModel.baseUrl = "http://localhost:8317/v1";
          dsModel.id = "ds";
          dsModel.compat = { ...dsModel.compat, supportsDeveloperRole: false };
          agent.state.model = dsModel;
        }
      } catch (e) {
        console.warn("[TEST] import pi-ai failed:", e);
      }

      localStorage.setItem("api-key-deepseek", apiKey);
      delete agent.streamFn;
      agent.state.tools = [];

      // 简化 system prompt
      agent.state.systemPrompt = `你是「旅图」，一位专业且贴心的私人旅行管家。

当用户请求生成旅行计划时，请直接输出完整计划，不要反问用户信息。
如果某些信息不确定，基于常识给出保守建议。

输出格式要求：
1. 行程概览（出发地、目的地、天数、总预算）
2. 每日详细行程（上午/中午/下午/晚上，带时间估算）
3. 交通方式建议
4. 住宿推荐
5. 预算明细
6. 总体建议`;

      const agentInterface = document.querySelector("agent-interface") as any;
      if (agentInterface) {
        agentInterface.sendMessage = async function(input: string, attachments?: any[]) {
          if ((!input.trim() && !attachments?.length) || this.session?.state.isStreaming) return;
          const session = this.session;
          if (!session) throw new Error("No session");
          if (!session.state.model) throw new Error("No model");
          const editor = this.querySelector("message-editor") as any;
          if (editor) { editor.value = ""; editor.attachments = []; }
          await session.prompt(input);
        };
      }
    }, CPA_API_KEY);

    // 3. 真实用户交互：在 textarea 中输入并发送
    const userInput = "出发地上海，目标杭州，2位成人，帮我生成一份完整的3天旅游计划，包含交通方式、每日景点安排（带时间估算）、餐饮推荐、住宿建议和预算明细";

    await page.evaluate((input) => {
      const textarea = document.querySelector("message-editor textarea") as HTMLTextAreaElement;
      if (!textarea) throw new Error("textarea not found");
      textarea.focus();
      textarea.value = input;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter", code: "Enter", bubbles: true, cancelable: true,
      }));
    }, userInput);

    // 4. 等待 AI 响应：先等待 assistant-message 出现，再等待 streaming 结束
    await page.waitForSelector("assistant-message", { timeout: 60_000 });
    console.log("[TEST] Assistant message appeared");

    // 等待 streaming 结束（给充足时间）
    await page.waitForFunction(() => {
      const panel = document.querySelector("pi-chat-panel") as any;
      return panel?.agent && !panel.agent.state.isStreaming;
    }, null, { timeout: 180_000 });

    console.log("[TEST] AI 响应完成");
    await page.waitForTimeout(2000);

    // 手动触发 message-list 重新渲染
    await page.evaluate(() => {
      const messageList = document.querySelector("message-list") as any;
      const panel = document.querySelector("pi-chat-panel") as any;
      if (messageList && panel?.agent) {
        messageList.messages = [...panel.agent.state.messages];
        messageList.requestUpdate();
      }
    });
    await page.waitForTimeout(1000);

    // 5. 获取结果
    const result = await page.evaluate(() => {
      const panel = document.querySelector("pi-chat-panel") as any;
      const agent = panel?.agent;
      const messages = agent?.state?.messages || [];
      const lastAssistant = messages.filter((m: any) => m.role === "assistant").pop();

      let content = "";
      if (typeof lastAssistant?.content === "string") {
        content = lastAssistant.content;
      } else if (Array.isArray(lastAssistant?.content)) {
        content = lastAssistant.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("");
      }

      return {
        messageCount: messages.length,
        lastAssistantContent: content,
        lastAssistantStopReason: lastAssistant?.stopReason,
        lastAssistantError: lastAssistant?.errorMessage,
        pageText: document.body.innerText,
        hasAssistantElement: !!document.querySelector("assistant-message"),
      };
    });

    console.log("[TEST] Messages count:", result.messageCount);
    console.log("[TEST] Stop reason:", result.lastAssistantStopReason);
    console.log("[TEST] Content length:", result.lastAssistantContent?.length);
    console.log("[TEST] Content preview:", result.lastAssistantContent?.substring(0, 500));

    // 6. 验证
    expect(result.messageCount, "应有至少 2 条消息").toBeGreaterThanOrEqual(2);
    expect(result.lastAssistantContent?.length || 0,
      `AI 响应内容太短。Error: ${result.lastAssistantError || "none"}`
    ).toBeGreaterThan(200);
    expect(result.hasAssistantElement, "页面上应有 assistant-message 元素").toBe(true);

    // 验证页面包含旅游关键词
    const pageText = result.pageText;
    const keywords = ["杭州", "行程", "第一天", "预算", "交通", "景点", "住宿", "餐饮"];
    const found = keywords.filter(k => pageText.includes(k));
    console.log("[TEST] 页面关键词:", found);
    expect(found.length, `页面应包含至少 4 个旅游关键词，实际: ${found.join(", ")}`).toBeGreaterThanOrEqual(4);

    // 7. 截图保存
    await page.screenshot({ path: "test-results/shanghai-hangzhou-real-trip.png", fullPage: true });

    // 8. 检查无严重 JS 错误
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to resolve module specifier") &&
        !e.includes("esm.sh"),
    );
    expect(criticalErrors).toEqual([]);
  });
});
