#!/usr/bin/env node
/**
 * TravelAgent CLI — 端到端验证入口
 *
 * 支持：
 *   - 偏好挖掘模式：模糊输入时 Agent 主动追问
 *   - Steering 模式：生成后可逐步微调
 *
 * Usage:
 *   npx tsx src/bin/cli.ts --city 北京 --days 3 --preferences 历史文化,美食
 *   npx tsx src/bin/cli.ts --city 西安   # 模糊输入，触发偏好挖掘
 */

import * as readline from "node:readline";
import { TravelAgent } from "../agent/travel-agent.js";
import { createTools } from "../tools/index.js";
import type { TripRequest } from "../types/trip.js";

function parseArgs(argv: string[]): Partial<TripRequest> & { provider?: string; model?: string } {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      const key = argv[i].slice(2);
      args[key] = argv[++i];
    }
  }

  const city = args.city ?? "北京";
  const days = Number.parseInt(args.days ?? "3", 10);
  const startDate = args.startDate ?? getTodayStr();
  const endDate = addDays(startDate, days);

  return {
    city,
    cities: [{ city, days }],
    startDate,
    endDate,
    travelDays: days,
    transportation: args.transportation ?? "公共交通",
    accommodation: args.accommodation ?? "经济型酒店",
    preferences: args.preferences ? args.preferences.split(",") : [],
    freeTextInput: args.extra ?? "",
    provider: args.provider,
    model: args.model,
  };
}

function getTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** 创建 readline 接口 */
function createRL(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  const parsed = parseArgs(process.argv);

  console.log("🌍 TravelAgent — AI 旅行规划 (偏好挖掘 + Steering 模式)");
  console.log("━".repeat(50));
  console.log(`📍 目的地: ${parsed.city}`);
  console.log(`📅 日期: ${parsed.startDate} ~ ${parsed.endDate} (${parsed.travelDays}天)`);
  console.log(`🚗 交通: ${parsed.transportation}`);
  console.log(`🏨 住宿: ${parsed.accommodation}`);
  if (parsed.preferences?.length) {
    console.log(`🎯 偏好: ${parsed.preferences.join("、")}`);
  }
  if (parsed.freeTextInput) {
    console.log(`📝 额外: ${parsed.freeTextInput}`);
  }

  const isVague = !parsed.preferences?.length && !parsed.freeTextInput;
  if (isVague) {
    console.log("💡 偏好信息不足，将进入偏好挖掘模式...");
  }
  console.log("━".repeat(50));
  console.log();

  const provider = (parsed.provider ?? "openai") as
    | "openai"
    | "anthropic"
    | "google"
    | "deepseek"
    | "xai"
    | "openrouter";
  const agent = new TravelAgent({
    provider,
    model: parsed.model,
  });

  // 注册工具
  const tools = createTools();
  agent.setTools(tools);
  console.log(`🔧 已注册 ${tools.length} 个工具: ${tools.map((t) => t.name).join(", ")}`);
  console.log();

  // 监听事件 — 输出 assistant 消息
  let lastAssistantText = "";
  agent.onEvent((event) => {
    switch (event.type) {
      case "message_update": {
        const msg = event.message;
        if (msg.role === "assistant") {
          for (const c of msg.content) {
            if (c.type === "text" && c.text) {
              // 只输出新增部分
              const newText = c.text.slice(lastAssistantText.length);
              if (newText) {
                process.stdout.write(newText);
                lastAssistantText = c.text;
              }
            }
          }
        }
        break;
      }
      case "tool_execution_start":
        console.log(
          `\n📞 调用工具: ${event.toolName}(${JSON.stringify(event.args).slice(0, 100)})`,
        );
        lastAssistantText = "";
        break;
      case "tool_execution_end": {
        const result = event.result;
        const text = result?.content?.[0]?.type === "text" ? result.content[0].text : "[done]";
        const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text;
        console.log(`✅ 工具结果: ${preview}\n`);
        lastAssistantText = "";
        break;
      }
      case "agent_end":
        console.log("\n");
        lastAssistantText = "";
        break;
    }
  });

  // 构建请求
  const request: TripRequest = {
    city: parsed.city ?? "北京",
    cities: parsed.cities ?? [{ city: parsed.city ?? "北京", days: parsed.travelDays ?? 3 }],
    startDate: parsed.startDate ?? getTodayStr(),
    endDate: parsed.endDate ?? addDays(getTodayStr(), parsed.travelDays ?? 3),
    travelDays: parsed.travelDays ?? 3,
    transportation: parsed.transportation ?? "公共交通",
    accommodation: parsed.accommodation ?? "经济型酒店",
    preferences: parsed.preferences ?? [],
    freeTextInput: parsed.freeTextInput,
  };

  const rl = createRL();

  try {
    // Step 1: 发起规划（可能触发偏好挖掘）
    await agent.planTrip(request);
    await agent.waitForIdle();

    // Step 2: 交互式循环 — 偏好挖掘回答 + Steering 微调
    console.log("━".repeat(50));
    console.log("💬 进入交互模式（输入反馈微调行程，输入 'exit' 退出）");
    console.log("━".repeat(50));

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const input = await ask(rl, "\n✏️  你的反馈: ");

      if (!input || input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
        console.log("👋 再见！祝旅途愉快！");
        break;
      }

      if (input.toLowerCase() === "满意" || input.toLowerCase() === "好的") {
        console.log("🎉 太好了！行程已确定。");
        break;
      }

      // 使用 steer 进行微调
      console.log("\n🔧 正在微调行程...\n");
      agent.steer(input);
      await agent.waitForIdle();
    }
  } catch (err) {
    console.error("规划失败:", err);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
