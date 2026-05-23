/**
 * Goal Extension for Pi
 * 
 * 实现类似 Claude Code 的 /goal 功能：
 * 1. 用户设置完成条件
 * 2. Agent 每轮结束后用小模型评估条件
 * 3. 条件未满足时自动注入 guidance 继续工作
 * 4. 条件满足时清除 goal 并通知用户
 * 
 * Usage:
 *   /goal all tests pass
 *   /goal status
 *   /goal clear
 */

import { complete, getModel } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ========== 类型定义 ==========

interface GoalState {
  condition: string;
  startTimestamp: number;
  turnCount: number;
  lastEvaluation?: string;
  evaluatorProvider: string;
  evaluatorModel: string;
}

interface EvaluationResult {
  met: boolean;
  reason: string;
}

type SessionEntry = {
  type: string;
  customType?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
  toolName?: string;
  content?: string;
  data?: unknown;
};

// ========== 全局状态 ==========

let activeGoal: GoalState | null = null;

// ========== 辅助函数 ==========

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join(" ");
  }
  return "";
}

function buildTranscript(entries: SessionEntry[], maxEntries: number = 15): string {
  const recent = entries.slice(-maxEntries);
  const lines: string[] = [];

  for (const entry of recent) {
    if (entry.type === "message" && entry.message) {
      const role = entry.message.role || "unknown";
      const text = extractTextFromContent(entry.message.content).slice(0, 500);
      if (text.trim()) {
        lines.push(`[${role}]: ${text}`);
      }
    } else if (entry.type === "toolResult") {
      const toolName = entry.toolName || "unknown";
      const content = entry.content?.slice(0, 300) || "";
      if (content.trim()) {
        lines.push(`[tool:${toolName}]: ${content}`);
      }
    }
  }

  return lines.join("\n");
}

async function evaluateGoalCondition(
  condition: string,
  transcript: string,
  provider: string,
  modelId: string,
  ctx: ExtensionContext
): Promise<EvaluationResult> {
  const model = getModel(provider, modelId);
  if (!model) {
    return { met: false, reason: `Evaluator model ${provider}/${modelId} not found` };
  }

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth?.ok || !auth.apiKey) {
    return { met: false, reason: "No API key for evaluator model" };
  }

  const prompt = `You are a goal evaluator. Your job is to determine if a specific condition has been met based on the conversation transcript.

Goal condition: "${condition}"

Recent conversation:
<transcript>
${transcript}
</transcript>

Evaluate whether the goal condition is met. Look for:
1. Test results showing all tests pass
2. Successful command executions
3. Completion messages from the assistant
4. Absence of errors or failures
5. Evidence that the work described in the condition is done

Reply with ONLY a JSON object (no markdown, no explanation):
{"met": true/false, "reason": "brief explanation of why the condition is or isn't met"}`;

  try {
    const response = await complete(
      model,
      {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }],
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
      }
    );

    const responseText = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim();

    // 尝试解析 JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        met: Boolean(parsed.met),
        reason: String(parsed.reason || "No reason provided"),
      };
    }

    return { met: false, reason: "Failed to parse evaluator response" };
  } catch (error) {
    return { met: false, reason: `Evaluator error: ${error}` };
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// ========== Extension 入口 ==========

export default function (pi: ExtensionAPI) {
  // 注册 /goal 命令
  pi.registerCommand("goal", {
    description: "Set a completion condition. Agent works autonomously until condition is met.",
    getArgumentCompletions: (prefix: string) => {
      const actions = [
        { value: "clear", label: "Clear active goal" },
        { value: "status", label: "Show goal status" },
        { value: "off", label: "Alias for clear" },
        { value: "reset", label: "Alias for clear" },
      ];
      return actions
        .filter((a) => a.value.startsWith(prefix))
        .map((a) => ({ value: a.value, label: a.label }));
    },
    handler: async (args: string, ctx) => {
      const arg = args.trim();

      // /goal clear/off/reset/none/cancel
      if (["clear", "off", "reset", "none", "cancel"].includes(arg)) {
        if (activeGoal) {
          const duration = formatDuration(Date.now() - activeGoal.startTimestamp);
          ctx.ui.notify(`Goal cleared after ${duration}, ${activeGoal.turnCount} turns`, "info");
          ctx.ui.setStatus("goal", undefined);
          activeGoal = null;
        } else {
          ctx.ui.notify("No active goal", "warning");
        }
        return;
      }

      // /goal status
      if (arg === "status") {
        if (activeGoal) {
          const duration = formatDuration(Date.now() - activeGoal.startTimestamp);
          ctx.ui.notify(
            [
              `Goal: "${activeGoal.condition}"`,
              `Running: ${duration}, ${activeGoal.turnCount} turns`,
              `Evaluator: ${activeGoal.evaluatorProvider}/${activeGoal.evaluatorModel}`,
              `Last eval: ${activeGoal.lastEvaluation || "pending"}`,
            ].join("\n"),
            "info"
          );
        } else {
          ctx.ui.notify("No active goal", "info");
        }
        return;
      }

      // /goal (无参数) - 显示当前 goal 或用法
      if (!arg) {
        if (activeGoal) {
          const duration = formatDuration(Date.now() - activeGoal.startTimestamp);
          ctx.ui.notify(
            `Active goal: "${activeGoal.condition}" (${duration}, ${activeGoal.turnCount} turns)`,
            "info"
          );
        } else {
          ctx.ui.notify("Usage: /goal <condition> or /goal clear/status", "info");
        }
        return;
      }

      // /goal <condition> - 设置新 goal
      // 获取当前会话的模型作为评估器
      const currentModel = ctx.model;
      activeGoal = {
        condition: arg,
        startTimestamp: Date.now(),
        turnCount: 0,
        evaluatorProvider: currentModel?.provider || "anthropic",
        evaluatorModel: currentModel?.id || "claude-haiku-3.5",
      };

      ctx.ui.notify(`Goal set: "${arg}"`, "info");
      ctx.ui.setStatus("goal", `◎ /goal active`);

      // 立即开始工作
      pi.sendUserMessage(
        `I need to achieve the following goal: ${arg}\n\nPlease start working on this now. After you complete your work, I will verify if the condition is met.`,
        { deliverAs: "followUp" }
      );
    },
  });

  // 监听 turn_end 事件 - 每轮结束后评估 goal
  pi.on("turn_end", async (event, ctx) => {
    if (!activeGoal) return;

    activeGoal.turnCount++;
    ctx.ui.setStatus("goal", `◎ /goal active (${activeGoal.turnCount} turns)`);

    // 构建对话记录
    const entries = ctx.sessionManager.getEntries() as SessionEntry[];
    const transcript = buildTranscript(entries);

    // 调用评估器
    ctx.ui.setStatus("goal", `◎ /goal evaluating...`);

    const evaluation = await evaluateGoalCondition(
      activeGoal.condition,
      transcript,
      activeGoal.evaluatorProvider,
      activeGoal.evaluatorModel,
      ctx
    );

    activeGoal.lastEvaluation = evaluation.reason;

    if (evaluation.met) {
      // 条件满足！
      const duration = formatDuration(Date.now() - activeGoal.startTimestamp);
      ctx.ui.notify(
        [
          "✅ Goal achieved!",
          `Condition: "${activeGoal.condition}"`,
          `Duration: ${duration}, ${activeGoal.turnCount} turns`,
          `Reason: ${evaluation.reason}`,
        ].join("\n"),
        "success"
      );
      ctx.ui.setStatus("goal", undefined);

      // 记录到 session
      pi.appendEntry("goal-achieved", {
        condition: activeGoal.condition,
        duration: Date.now() - activeGoal.startTimestamp,
        turns: activeGoal.turnCount,
        reason: evaluation.reason,
      });

      activeGoal = null;
    } else {
      // 条件未满足，继续工作
      ctx.ui.setStatus("goal", `◎ /goal - ${evaluation.reason.slice(0, 50)}`);

      pi.sendMessage(
        {
          customType: "goal-guidance",
          content: `The goal "${activeGoal.condition}" is not yet achieved.\nReason: ${evaluation.reason}\n\nPlease continue working toward this goal.`,
          display: false,
        },
        { triggerTurn: true, deliverAs: "steer" }
      );
    }
  });

  // 监听 session_start - 恢复 goal 状态
  pi.on("session_start", async (event, ctx) => {
    // 从 session entries 中恢复 goal 状态
    const entries = ctx.sessionManager.getEntries() as SessionEntry[];
    
    // 查找最后一个 goal-state entry（如果 session 被中断）
    const goalStateEntry = entries
      .filter((e) => e.type === "custom" && e.customType === "goal-state")
      .pop();

    if (goalStateEntry?.data) {
      const saved = goalStateEntry.data as GoalState;
      activeGoal = {
        ...saved,
        startTimestamp: Date.now(), // 重置计时
        turnCount: 0, // 重置轮数
      };
      ctx.ui.setStatus("goal", `◎ /goal active (restored)`);
      ctx.ui.notify(`Goal restored: "${activeGoal.condition}"`, "info");
    }
  });

  // 监听 session_shutdown - 保存 goal 状态
  pi.on("session_shutdown", async () => {
    if (activeGoal) {
      pi.appendEntry("goal-state", activeGoal);
    }
  });

  // 注册工具让 LLM 可以主动报告 goal 进度
  pi.registerTool({
    name: "report_goal_progress",
    label: "Report Goal Progress",
    description: "Report progress toward the current goal. Use this to provide evidence that the goal condition is being met.",
    parameters: Type.Object({
      status: Type.String({ description: "Current status description" }),
      evidence: Type.String({ description: "Evidence that the goal is being met (test results, command output, etc.)" }),
      met: Type.Optional(Type.Boolean({ description: "Set to true if you believe the goal is now achieved" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!activeGoal) {
        return {
          content: [{ type: "text", text: "No active goal to report progress on." }],
        };
      }

      const { status, evidence, met } = params;

      // 更新 lastEvaluation
      activeGoal.lastEvaluation = `${status}: ${evidence}`;

      if (met) {
        // LLM 认为目标已达成，立即触发评估
        return {
          content: [
            {
              type: "text",
              text: `Progress reported. Goal evaluation will be triggered at end of turn.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Progress noted: ${status}`,
          },
        ],
      };
    },
  });
}
