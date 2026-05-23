/**
 * Trellis Execute Extension - Goal 驱动的自动执行
 * 
 * 将 Goal 能力内化到 Trellis 工作流，实现一个命令执行所有任务
 * 
 * Usage:
 *   /trellis:execute          - 执行当前 task 的所有任务
 *   /trellis:execute status   - 查看执行进度
 *   /trellis:execute pause    - 暂停执行
 *   /trellis:execute resume   - 恢复执行
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "fs";
import * as path from "path";

// ========== 类型定义 ==========

interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  phase?: string;
}

interface ExecuteState {
  taskDir: string;
  tasks: TaskItem[];
  currentTaskIndex: number;
  startTimestamp: number;
  turnCount: number;
  paused: boolean;
  lastEvaluation?: string;
}

// ========== 全局状态 ==========

let executeState: ExecuteState | null = null;

// ========== 辅助函数 ==========

async function getCurrentTaskDir(): Promise<string | null> {
  try {
    const { execSync } = require("child_process");
    const output = execSync("python3 ./.trellis/scripts/task.py current --source 2>/dev/null", {
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    // 解析输出，提取 task 目录
    const match = output.match(/\.trellis\/tasks\/([^\s]+)/);
    return match ? `.trellis/tasks/${match[1]}` : null;
  } catch {
    return null;
  }
}

function parsePrdTasks(taskDir: string): TaskItem[] {
  const prdPath = path.join(taskDir, "prd.md");
  if (!fs.existsSync(prdPath)) {
    return [];
  }

  const content = fs.readFileSync(prdPath, "utf-8");
  const tasks: TaskItem[] = [];
  const lines = content.split("\n");
  let currentPhase = "";

  for (const line of lines) {
    // 匹配阶段标题 (## 阶段 1: xxx 或 ## Phase 1: xxx)
    const phaseMatch = line.match(/^##\s+(.+)/);
    if (phaseMatch) {
      currentPhase = phaseMatch[1].trim();
      continue;
    }

    // 匹配任务项 (- [ ] xxx 或 - [x] xxx)
    const taskMatch = line.match(/^-\s+\[([ x])\]\s+(.+)/);
    if (taskMatch) {
      const isCompleted = taskMatch[1] === "x";
      const title = taskMatch[2].trim();
      
      tasks.push({
        id: `task-${tasks.length + 1}`,
        title,
        description: `Complete: ${title}`,
        status: isCompleted ? "completed" : "pending",
        phase: currentPhase,
      });
    }
  }

  return tasks;
}

function buildGoalCondition(tasks: TaskItem[]): string {
  const pendingTasks = tasks.filter(t => t.status !== "completed");
  if (pendingTasks.length === 0) {
    return "All tasks are already completed";
  }

  const taskList = pendingTasks.map((t, i) => `${i + 1}. ${t.title}`).join("\n");
  return `Complete all the following tasks and ensure tests pass:\n${taskList}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function updateStatusBar(ctx: ExtensionContext) {
  if (!executeState) {
    ctx.ui.setStatus("execute", undefined);
    return;
  }

  const completed = executeState.tasks.filter(t => t.status === "completed").length;
  const total = executeState.tasks.length;
  const current = executeState.tasks[executeState.currentTaskIndex];
  
  if (executeState.paused) {
    ctx.ui.setStatus("execute", `⏸ Paused: ${completed}/${total}`);
  } else if (current) {
    const shortTitle = current.title.length > 30 
      ? current.title.slice(0, 30) + "..." 
      : current.title;
    ctx.ui.setStatus("execute", `◎ ${completed}/${total} - ${shortTitle}`);
  }
}

async function checkTaskCompletion(
  task: TaskItem,
  entries: any[]
): Promise<{ complete: boolean; reason: string }> {
  // 简单的启发式判断
  const recentEntries = entries.slice(-10);
  const transcript = recentEntries
    .map(entry => {
      if (entry.type === "message" && entry.message) {
        const text = extractText(entry.message.content);
        return `[${entry.message.role}]: ${text.slice(0, 300)}`;
      }
      if (entry.type === "toolResult") {
        return `[${entry.toolName}]: ${(entry.content || "").slice(0, 200)}`;
      }
      return null;
    })
    .filter(Boolean)
    .join("\n");

  const lowerTranscript = transcript.toLowerCase();
  const lowerTitle = task.title.toLowerCase();

  // 检查完成信号
  const completionSignals = [
    "completed",
    "done",
    "finished",
    "implemented",
    "created",
    "added",
    "success",
    "tests passing",
    "all tests pass",
  ];

  const hasCompletionSignal = completionSignals.some(s => lowerTranscript.includes(s));
  
  // 检查任务相关关键词
  const taskKeywords = lowerTitle.split(/\s+/).filter(w => w.length > 3);
  const hasTaskKeywords = taskKeywords.some(k => lowerTranscript.includes(k));

  // 检查失败信号
  const failureSignals = ["error", "failed", "failing", "broken"];
  const hasFailureSignal = failureSignals.some(s => lowerTranscript.includes(s));

  if (hasCompletionSignal && hasTaskKeywords && !hasFailureSignal) {
    return { complete: true, reason: "Detected completion signals" };
  }

  // 检查测试相关
  if (lowerTitle.includes("test") && lowerTranscript.includes("tests pass")) {
    return { complete: true, reason: "Tests passing detected" };
  }

  return { complete: false, reason: "Task not yet verified as complete" };
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join(" ");
  }
  return "";
}

async function handleAllTasksComplete(ctx: ExtensionContext) {
  if (!executeState) return;

  const duration = formatDuration(Date.now() - executeState.startTimestamp);
  const completed = executeState.tasks.filter(t => t.status === "completed").length;

  ctx.ui.notify(
    [
      "🎉 All tasks completed!",
      `Duration: ${duration}`,
      `Tasks: ${completed}/${executeState.tasks.length}`,
      `Turns: ${executeState.turnCount}`,
      "",
      "Running quality check...",
    ].join("\n"),
    "success"
  );

  ctx.ui.setStatus("execute", undefined);

  // 更新 prd.md 中的任务状态
  await updatePrdStatus(executeState.taskDir, executeState.tasks);

  // 记录到 session
  pi.appendEntry("trellis-execute-complete", {
    taskDir: executeState.taskDir,
    duration,
    tasks: completed,
    turns: executeState.turnCount,
  });

  executeState = null;

  // 提示用户运行 trellis-check
  pi.sendUserMessage(
    "All tasks completed. Please run /trellis:check to verify quality, then commit changes.",
    { deliverAs: "followUp" }
  );
}

async function updatePrdStatus(taskDir: string, tasks: TaskItem[]) {
  const prdPath = path.join(taskDir, "prd.md");
  if (!fs.existsSync(prdPath)) return;

  let content = fs.readFileSync(prdPath, "utf-8");
  
  for (const task of tasks) {
    if (task.status === "completed") {
      // 将 - [ ] 替换为 - [x]
      const regex = new RegExp(`- \\[ \\] ${escapeRegex(task.title)}`, "g");
      content = content.replace(regex, `- [x] ${task.title}`);
    }
  }

  fs.writeFileSync(prdPath, content);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ========== Extension 入口 ==========

export default function (pi: ExtensionAPI) {
  
  // 注册 /trellis:execute 命令
  pi.registerCommand("trellis:execute", {
    description: "Execute all tasks from prd.md with goal-driven automation",
    getArgumentCompletions: (prefix: string) => {
      const actions = [
        { value: "status", label: "Show execution progress" },
        { value: "pause", label: "Pause execution" },
        { value: "resume", label: "Resume execution" },
        { value: "skip", label: "Skip current task" },
        { value: "retry", label: "Retry current task" },
        { value: "stop", label: "Stop execution" },
      ];
      return actions
        .filter(a => a.value.startsWith(prefix))
        .map(a => ({ value: a.value, label: a.label }));
    },
    handler: async (args: string, ctx) => {
      const arg = args.trim();

      // /trellis:execute status
      if (arg === "status") {
        if (!executeState) {
          ctx.ui.notify("No active execution", "info");
          return;
        }

        const completed = executeState.tasks.filter(t => t.status === "completed").length;
        const total = executeState.tasks.length;
        const duration = formatDuration(Date.now() - executeState.startTimestamp);
        const current = executeState.tasks[executeState.currentTaskIndex];

        ctx.ui.notify(
          [
            `Execution Status: ${executeState.paused ? "Paused" : "Running"}`,
            `Progress: ${completed}/${total} tasks`,
            `Duration: ${duration}`,
            `Turns: ${executeState.turnCount}`,
            current ? `Current: ${current.title}` : "Current: (none)",
            executeState.lastEvaluation ? `Last eval: ${executeState.lastEvaluation}` : "",
          ].filter(Boolean).join("\n"),
          "info"
        );
        return;
      }

      // /trellis:execute pause
      if (arg === "pause") {
        if (!executeState) {
          ctx.ui.notify("No active execution", "warning");
          return;
        }
        executeState.paused = true;
        updateStatusBar(ctx);
        ctx.ui.notify("Execution paused", "info");
        return;
      }

      // /trellis:execute resume
      if (arg === "resume") {
        if (!executeState) {
          ctx.ui.notify("No active execution", "warning");
          return;
        }
        executeState.paused = false;
        updateStatusBar(ctx);
        ctx.ui.notify("Execution resumed", "info");
        
        // 继续执行当前任务
        const current = executeState.tasks[executeState.currentTaskIndex];
        if (current) {
          pi.sendUserMessage(
            `Continue working on: ${current.title}`,
            { deliverAs: "followUp" }
          );
        }
        return;
      }

      // /trellis:execute skip
      if (arg === "skip") {
        if (!executeState) {
          ctx.ui.notify("No active execution", "warning");
          return;
        }

        const current = executeState.tasks[executeState.currentTaskIndex];
        if (current) {
          current.status = "skipped";
          ctx.ui.notify(`Skipped: ${current.title}`, "info");
          
          executeState.currentTaskIndex++;
          if (executeState.currentTaskIndex >= executeState.tasks.length) {
            await handleAllTasksComplete(ctx);
          } else {
            const next = executeState.tasks[executeState.currentTaskIndex];
            updateStatusBar(ctx);
            pi.sendUserMessage(
              `Execute task ${executeState.currentTaskIndex + 1}/${executeState.tasks.length}: ${next.title}`,
              { deliverAs: "followUp" }
            );
          }
        }
        return;
      }

      // /trellis:execute stop
      if (arg === "stop" || arg === "cancel") {
        if (!executeState) {
          ctx.ui.notify("No active execution", "warning");
          return;
        }

        const completed = executeState.tasks.filter(t => t.status === "completed").length;
        ctx.ui.notify(
          `Execution stopped\nCompleted: ${completed}/${executeState.tasks.length} tasks`,
          "info"
        );
        executeState = null;
        updateStatusBar(ctx);
        return;
      }

      // /trellis:execute retry
      if (arg === "retry") {
        if (!executeState) {
          ctx.ui.notify("No active execution", "warning");
          return;
        }

        const current = executeState.tasks[executeState.currentTaskIndex];
        if (current) {
          current.status = "in_progress";
          ctx.ui.notify(`Retrying: ${current.title}`, "info");
          pi.sendUserMessage(
            `Please try again: ${current.title}\n\n${current.description}`,
            { deliverAs: "followUp" }
          );
        }
        return;
      }

      // /trellis:execute (无参数 - 开始执行)
      if (executeState) {
        ctx.ui.notify("Execution already active. Use 'status' or 'pause'.", "warning");
        return;
      }

      // 获取当前 task 目录
      const taskDir = await getCurrentTaskDir();
      if (!taskDir) {
        ctx.ui.notify(
          "No active task. Run first:\n  python3 ./.trellis/scripts/task.py start <task>",
          "error"
        );
        return;
      }

      // 解析 prd.md 中的任务
      const tasks = parsePrdTasks(taskDir);
      if (tasks.length === 0) {
        ctx.ui.notify("No tasks found in prd.md. Add tasks with '- [ ] description'", "warning");
        return;
      }

      const pendingTasks = tasks.filter(t => t.status !== "completed");
      if (pendingTasks.length === 0) {
        ctx.ui.notify("All tasks are already completed!", "info");
        return;
      }

      // 初始化执行状态
      executeState = {
        taskDir,
        tasks,
        currentTaskIndex: tasks.findIndex(t => t.status === "pending"),
        startTimestamp: Date.now(),
        turnCount: 0,
        paused: false,
      };

      // 设置状态栏
      updateStatusBar(ctx);

      // 开始执行第一个任务
      const firstTask = executeState.tasks[executeState.currentTaskIndex];
      ctx.ui.notify(
        [
          `🚀 Starting execution`,
          `Tasks: ${pendingTasks.length} pending / ${tasks.length} total`,
          `First: ${firstTask.title}`,
        ].join("\n"),
        "info"
      );

      pi.sendUserMessage(
        [
          `Execute task 1/${tasks.length}: ${firstTask.title}`,
          "",
          firstTask.description,
          "",
          "After completing this task, I will check if it's done and move to the next one.",
        ].join("\n"),
        { deliverAs: "followUp" }
      );
    },
  });

  // 监听 turn_end 事件
  pi.on("turn_end", async (event, ctx) => {
    if (!executeState || executeState.paused) return;

    executeState.turnCount++;
    updateStatusBar(ctx);

    // 获取当前任务
    const currentTask = executeState.tasks[executeState.currentTaskIndex];
    if (!currentTask) return;

    // 检查任务是否完成
    const entries = ctx.sessionManager.getEntries();
    const evaluation = await checkTaskCompletion(currentTask, entries);

    executeState.lastEvaluation = evaluation.reason;

    if (evaluation.complete) {
      // 任务完成
      currentTask.status = "completed";
      
      const completed = executeState.tasks.filter(t => t.status === "completed").length;
      const total = executeState.tasks.length;

      ctx.ui.notify(
        `✅ Task ${completed}/${total} completed: ${currentTask.title}`,
        "success"
      );

      // 移动到下一个任务
      executeState.currentTaskIndex++;

      if (executeState.currentTaskIndex >= executeState.tasks.length) {
        // 所有任务完成
        await handleAllTasksComplete(ctx);
        return;
      }

      // 开始下一个任务
      const nextTask = executeState.tasks[executeState.currentTaskIndex];
      updateStatusBar(ctx);

      pi.sendUserMessage(
        [
          `Execute task ${executeState.currentTaskIndex + 1}/${executeState.tasks.length}: ${nextTask.title}`,
          "",
          nextTask.description,
        ].join("\n"),
        { deliverAs: "followUp" }
      );
    } else {
      // 任务未完成，继续工作
      updateStatusBar(ctx);
      
      pi.sendMessage(
        {
          customType: "execute-guidance",
          content: `Task "${currentTask.title}" not yet complete. ${evaluation.reason}\n\nContinue working on this task.`,
          display: false,
        },
        { triggerTurn: true, deliverAs: "steer" }
      );
    }
  });

  // 注册工具让 LLM 可以报告任务进度
  pi.registerTool({
    name: "report_task_progress",
    label: "Report Task Progress",
    description: "Report progress on the current task. Use this to indicate when a task is complete.",
    parameters: Type.Object({
      task_title: Type.String({ description: "Title of the task" }),
      status: Type.String({ description: "Current status (in_progress, completed, blocked)" }),
      evidence: Type.String({ description: "Evidence of progress or completion" }),
      complete: Type.Optional(Type.Boolean({ description: "Set to true if the task is complete" })),
    }),
    async execute(toolCallId, params) {
      if (!executeState) {
        return {
          content: [{ type: "text", text: "No active execution" }],
        };
      }

      const { task_title, status, evidence, complete } = params;
      
      // 更新最后评估
      executeState.lastEvaluation = `${status}: ${evidence}`;

      if (complete) {
        // 标记任务完成
        const current = executeState.tasks[executeState.currentTaskIndex];
        if (current && current.title.toLowerCase().includes(task_title.toLowerCase())) {
          current.status = "completed";
        }
      }

      return {
        content: [{
          type: "text",
          text: `Progress noted: ${status}. ${complete ? "Task marked as complete." : ""}`,
        }],
      };
    },
  });

  // 监听 session_shutdown
  pi.on("session_shutdown", async () => {
    if (executeState) {
      // 保存执行状态
      pi.appendEntry("trellis-execute-state", executeState);
    }
  });

  // 监听 session_start - 恢复状态
  pi.on("session_start", async (event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const stateEntry = entries
      .filter((e: any) => e.type === "custom" && e.customType === "trellis-execute-state")
      .pop();

    if (stateEntry?.data) {
      const saved = stateEntry.data as ExecuteState;
      // 只恢复未完成的执行
      const hasPending = saved.tasks.some(t => t.status === "pending");
      if (hasPending) {
        executeState = {
          ...saved,
          paused: true, // 恢复时默认暂停
          turnCount: 0,
        };
        updateStatusBar(ctx);
        ctx.ui.notify(
          `Execution restored (${saved.tasks.filter(t => t.status === "completed").length}/${saved.tasks.length} tasks done). Use /trellis:execute resume to continue.`,
          "info"
        );
      }
    }
  });
}
