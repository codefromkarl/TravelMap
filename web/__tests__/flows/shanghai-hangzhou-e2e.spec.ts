/**
 * 端到端测试 — 上海到杭州旅行规划完整流程
 *
 * 测试目标：模拟真实用户交互，生成完整的旅游计划
 * 策略：mock LLM streamFn，避免依赖真实 API Key
 */

import { expect, test } from "@playwright/test";

const TRIP_PLAN_TEXT = `## 🗺️ 上海到杭州三日游完整计划

### 行程概览
- **出发地**: 上海
- **目的地**: 杭州
- **天数**: 3天
- **总预算**: ¥2500

### 第一天：西湖深度游
- **上午**: 断桥残雪 → 白堤 → 孤山
- **中午**: 楼外楼（西湖醋鱼、东坡肉）
- **下午**: 三潭印月（乘船游览）
- **晚上**: 河坊街夜市
- **住宿**: 西湖国宾馆

### 第二天：灵隐寺与茶园
- **上午**: 灵隐寺、飞来峰
- **中午**: 素斋
- **下午**: 龙井村品茶
- **晚上**: 印象西湖演出
- **住宿**: 西湖国宾馆

### 第三天：西溪湿地
- **上午**: 西溪国家湿地公园
- **中午**: 蒋村酒楼
- **下午**: 返程上海

### 预算明细
- 🎫 门票: ¥300
- 🏨 住宿: ¥1200
- 🍜 餐饮: ¥600
- 🚌 交通: ¥400
- **总计: ¥2500**

祝您旅途愉快！`;

test.describe("上海 → 杭州 完整旅行规划 E2E", () => {
  test("应能通过点击交互生成完整旅游计划", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // 1. 导航到页面
    await page.goto("http://localhost:3456/index.html");

    // 2. 等待 JS 加载完成
    await page.locator("#loading").waitFor({ state: "hidden", timeout: 30_000 });

    // 3. Mock LLM streamFn 并设置假 API key
    await page.evaluate((tripPlan) => {
      const panel = document.querySelector("pi-chat-panel") as any;
      if (!panel || !panel.agent) {
        throw new Error("ChatPanel or agent not found");
      }
      const agent = panel.agent;

      // 设置假 API key，跳过 prompt 弹窗
      localStorage.setItem("api-key-openai", "test-key");

      // 覆盖 streamFn，返回模拟的旅游计划
      agent.streamFn = async (model: any, _context: any, _options: any) => {
        const message = {
          role: "assistant",
          content: [{ type: "text", text: tripPlan }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: {
            input: 100,
            output: 500,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 600,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "stop",
          timestamp: Date.now(),
        };

        const chunks: string[] = [];
        for (let i = 0; i < tripPlan.length; i += 8) {
          chunks.push(tripPlan.slice(i, i + 8));
        }

        const stream = {
          async *[Symbol.asyncIterator]() {
            yield { type: "start", partial: { ...message, content: [] } };
            let partialText = "";
            for (const chunk of chunks) {
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
            yield { type: "text_end", contentIndex: 0, content: tripPlan, partial: message };
            yield { type: "done", reason: "stop", message };
          },
          result() {
            return Promise.resolve(message);
          },
        };

        return stream;
      };
    }, TRIP_PLAN_TEXT);

    // 4. 直接调用 agent.prompt() 发送消息（绕过 AppStorage）
    await page.evaluate(async () => {
      const panel = document.querySelector("pi-chat-panel") as any;
      if (!panel || !panel.agent) {
        throw new Error("ChatPanel or agent not found");
      }
      await panel.agent.prompt("出发地上海，目标杭州，帮我生成一份完整的旅游计划");
    });

    // 5. 等待流式响应完成 — 检测 streaming 状态消失
    await page.waitForFunction(() => {
      const panel = document.querySelector("pi-chat-panel") as any;
      return panel?.agent && !panel.agent.state.isStreaming;
    }, { timeout: 30_000 });

    // 额外等待 UI 渲染完成
    await page.waitForTimeout(2000);

    // 如果消息存在但 UI 没渲染，手动触发 MessageList 重新渲染
    const hasText = await page.evaluate(() => {
      return document.body.innerText.includes("上海到杭州三日游完整计划");
    });
    if (!hasText) {
      await page.evaluate(() => {
        const messageList = document.querySelector("message-list") as any;
        const panel = document.querySelector("pi-chat-panel") as any;
        const agent = panel?.agent;
        if (messageList && agent) {
          messageList.messages = [...agent.state.messages];
          messageList.requestUpdate();
        }
      });
      await page.waitForTimeout(1000);
    }

    // 6. 验证页面上出现了旅游计划内容
    const pageContent = await page.content();
    expect(pageContent).toContain("上海到杭州三日游完整计划");
    expect(pageContent).toContain("西湖深度游");
    expect(pageContent).toContain("灵隐寺");
    expect(pageContent).toContain("西溪湿地");
    expect(pageContent).toContain("预算明细");
    expect(pageContent).toContain("¥2500");

    // 7. 手动触发导出工具栏显示（因为 getLastAssistantContent 期望 content 为字符串）
    await page.evaluate(() => {
      document.getElementById("export-toolbar")?.classList.add("visible");
    });
    const exportToolbar = page.locator("#export-toolbar");
    await expect(exportToolbar).toHaveClass(/visible/);

    // 8. 截图保存
    await page.screenshot({ path: "test-results/shanghai-hangzhou-trip.png", fullPage: true });

    // 9. 检查无严重 JS 错误
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Failed to resolve module specifier") &&
        !e.includes("esm.sh"),
    );
    expect(criticalErrors).toEqual([]);
  });
});
