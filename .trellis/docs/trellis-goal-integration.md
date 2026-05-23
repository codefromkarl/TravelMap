# Trellis + Goal 集成设计方案

## 一、核心思路

将 Goal 的"自动循环执行"能力内化到 Trellis 的 Execute 阶段，实现：

```
用户需求 → prd.md → 一个命令 → 自动执行所有 task → 完成
```

## 二、架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                 Trellis Execute + Goal 集成                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  用户输入: /trellis:execute                                      │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. 读取 prd.md                                          │   │
│  │ 2. 解析任务列表 (tasks/子任务)                          │   │
│  │ 3. 构建 goal 条件                                       │   │
│  │ 4. 设置 activeGoal                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Goal 自动循环                          │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │ 循环:                                           │   │   │
│  │  │   1. trellis-implement 执行当前任务             │   │   │
│  │  │   2. turn_end → 评估器检查                      │   │   │
│  │  │   3. 任务完成 → 标记 ✅，切换下一个            │   │   │
│  │  │   4. 所有任务完成 → 通知用户                    │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 5. 自动运行 trellis-check                               │   │
│  │ 6. 更新 prd.md 完成状态                                 │   │
│  │ 7. 通知用户全部完成                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 三、命令设计

### 3.1 主命令

```bash
# 执行当前 task 的所有任务
/trellis:execute

# 执行指定 task
/trellis:execute 05-23-product-polish

# 只执行阶段 1
/trellis:execute --phase 1

# 从任务 2 开始执行
/trellis:execute --from 2
```

### 3.2 辅助命令

```bash
# 查看执行进度
/trellis:execute status

# 暂停执行
/trellis:execute pause

# 恢复执行
/trellis:execute resume

# 跳过当前任务
/trellis:execute skip

# 重试当前任务
/trellis:execute retry
```

## 四、实现方案

### 4.1 方案 A: Extension 实现（推荐）

创建 `.pi/extensions/trellis-execute.ts`，集成 Goal 能力：

```typescript
// trellis-execute.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  dependencies?: string[];
}

interface ExecuteState {
  taskDir: string;
  tasks: TaskItem[];
  currentTaskIndex: number;
  startTimestamp: number;
  turnCount: number;
}

let executeState: ExecuteState | null = null;

export default function (pi: ExtensionAPI) {
  // 注册 /trellis:execute 命令
  pi.registerCommand("trellis:execute", {
    description: "Execute all tasks from prd.md with automatic goal-driven loop",
    handler: async (args, ctx) => {
      // 1. 读取当前 task
      const taskDir = await getCurrentTaskDir();
      if (!taskDir) {
        ctx.ui.notify("No active task. Run `task.py start` first.", "error");
        return;
      }

      // 2. 解析 prd.md 中的任务
      const tasks = await parsePrdTasks(taskDir);
      if (tasks.length === 0) {
        ctx.ui.notify("No tasks found in prd.md", "warning");
        return;
      }

      // 3. 构建 goal 条件
      const goalCondition = buildGoalCondition(tasks);

      // 4. 设置执行状态
      executeState = {
        taskDir,
        tasks,
        currentTaskIndex: 0,
        startTimestamp: Date.now(),
        turnCount: 0,
      };

      // 5. 设置 goal 并开始执行
      ctx.ui.notify(`Starting execution of ${tasks.length} tasks...`, "info");
      ctx.ui.setStatus("execute", `◎ Executing: 0/${tasks.length}`);
      
      // 发送第一个任务
      pi.sendUserMessage(
        `Execute task 1/${tasks.length}: ${tasks[0].title}\n\n${tasks[0].description}`,
        { deliverAs: "followUp" }
      );
    },
  });

  // 监听 turn_end 事件
  pi.on("turn_end", async (event, ctx) => {
    if (!executeState) return;

    executeState.turnCount++;
    
    // 检查当前任务是否完成
    const currentTask = executeState.tasks[executeState.currentTaskIndex];
    const isTaskComplete = await checkTaskCompletion(currentTask, ctx);

    if (isTaskComplete) {
      // 标记当前任务完成
      currentTask.status = 'completed';
      ctx.ui.notify(`✅ Task ${executeState.currentTaskIndex + 1} completed: ${currentTask.title}`, "success");

      // 移动到下一个任务
      executeState.currentTaskIndex++;

      if (executeState.currentTaskIndex >= executeState.tasks.length) {
        // 所有任务完成
        await handleAllTasksComplete(ctx);
        return;
      }

      // 发送下一个任务
      const nextTask = executeState.tasks[executeState.currentTaskIndex];
      ctx.ui.setStatus("execute", 
        `◎ Executing: ${executeState.currentTaskIndex}/${executeState.tasks.length}`);
      
      pi.sendUserMessage(
        `Execute task ${executeState.currentTaskIndex + 1}/${executeState.tasks.length}: ${nextTask.title}\n\n${nextTask.description}`,
        { deliverAs: "followUp" }
      );
    } else {
      // 任务未完成，注入 guidance
      pi.sendMessage({
        customType: "execute-guidance",
        content: `Task "${currentTask.title}" not yet complete. Continue working on it.`,
        display: false,
      }, { triggerTurn: true, deliverAs: "steer" });
    }
  });
}

// 辅助函数
async function parsePrdTasks(taskDir: string): Promise<TaskItem[]> {
  // 解析 prd.md 中的任务列表
  // 支持多种格式：
  // - [ ] 任务描述
  // - ## 阶段 1: 标题
  // - 1. 任务描述
}

function buildGoalCondition(tasks: TaskItem[]): string {
  const taskList = tasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n');
  return `All tasks completed:\n${taskList}`;
}

async function checkTaskCompletion(task: TaskItem, ctx: any): Promise<boolean> {
  // 基于对话记录判断任务是否完成
  // 可以调用 LLM 评估器
}

async function handleAllTasksComplete(ctx: any) {
  // 1. 运行 trellis-check
  // 2. 更新 prd.md
  // 3. 通知用户
  const duration = formatDuration(Date.now() - executeState!.startTimestamp);
  ctx.ui.notify(
    `🎉 All tasks completed!\nDuration: ${duration}\nTurns: ${executeState!.turnCount}`,
    "success"
  );
  ctx.ui.setStatus("execute", undefined);
  executeState = null;
}
```

### 4.2 方案 B: Skill + Goal Extension 组合

创建一个 Trellis skill，配合已有的 Goal Extension：

```markdown
<!-- .pi/skills/trellis-execute/SKILL.md -->
---
name: trellis-execute
description: "Execute all tasks from prd.md using goal-driven automation. Use when the user wants to run all tasks with a single command."
---

# Trellis Execute

Execute all tasks from prd.md using goal-driven automation.

## Steps

1. **Read current task**
   ```bash
   python3 ./.trellis/scripts/task.py current --source
   ```

2. **Parse prd.md tasks**
   Extract all `- [ ]` items from prd.md.

3. **Build goal condition**
   Create a goal condition that covers all tasks:
   ```
   /goal [所有任务标题]，测试通过
   ```

4. **Start execution**
   Tell the agent to start working on the first task.

5. **Monitor progress**
   The goal extension will automatically:
   - Execute each task
   - Check completion after each turn
   - Move to next task when current is done
   - Notify when all tasks are complete

6. **Post-execution**
   - Run trellis-check
   - Update prd.md checkboxes
   - Commit changes
```

### 4.3 方案 C: 增强 Goal Extension

扩展现有的 Goal Extension，添加 Trellis 集成：

```typescript
// 在 goal-extension.ts 中添加 Trellis 支持

pi.registerCommand("goal:trellis", {
  description: "Set a goal based on current Trellis task's prd.md",
  handler: async (args, ctx) => {
    // 1. 读取当前 task
    const taskDir = await getCurrentTaskDir();
    
    // 2. 解析 prd.md
    const tasks = await parsePrdTasks(taskDir);
    
    // 3. 构建 goal 条件
    const condition = buildGoalCondition(tasks);
    
    // 4. 设置 goal
    activeGoal = {
      condition,
      startTimestamp: Date.now(),
      turnCount: 0,
      trellisMode: true,
      tasks,
      currentTaskIndex: 0,
    };
    
    // 5. 开始执行
    pi.sendUserMessage(`Working toward: ${condition}`, { deliverAs: "followUp" });
  },
});
```

## 五、任务解析格式

### 5.1 支持的 prd.md 格式

```markdown
## 阶段 1: 核心体验

- [ ] 新手引导弹窗
- [ ] 示例行程预置
- [ ] 错误处理优化

## 阶段 2: 移动端适配

- [ ] 首页响应式布局
- [ ] 行程详情页适配
```

### 5.2 解析逻辑

```typescript
function parsePrdTasks(content: string): TaskItem[] {
  const tasks: TaskItem[] = [];
  const lines = content.split('\n');
  let currentPhase = '';

  for (const line of lines) {
    // 匹配阶段标题
    const phaseMatch = line.match(/^##\s+(.+)/);
    if (phaseMatch) {
      currentPhase = phaseMatch[1];
      continue;
    }

    // 匹配任务项
    const taskMatch = line.match(/^-\s+\[([ x])\]\s+(.+)/);
    if (taskMatch) {
      tasks.push({
        id: `task-${tasks.length + 1}`,
        title: taskMatch[2],
        description: '', // 可以从后续行提取
        status: taskMatch[1] === 'x' ? 'completed' : 'pending',
        phase: currentPhase,
      });
    }
  }

  return tasks;
}
```

## 六、评估器增强

### 6.1 任务级评估

```typescript
async function checkTaskCompletion(
  task: TaskItem,
  transcript: string
): Promise<{ complete: boolean; reason: string }> {
  const prompt = `
Task: ${task.title}
Description: ${task.description}

Recent conversation:
${transcript}

Is this task completed? Look for:
1. Code changes related to the task
2. Test results showing success
3. Completion messages from the assistant

Reply with JSON: {"complete": boolean, "reason": string}
`;

  return await callEvaluator(prompt);
}
```

### 6.2 整体评估

```typescript
async function checkAllTasksComplete(
  tasks: TaskItem[],
  transcript: string
): Promise<{ complete: boolean; reason: string }> {
  const incompleteTasks = tasks.filter(t => t.status !== 'completed');
  
  if (incompleteTasks.length === 0) {
    return { complete: true, reason: 'All tasks completed' };
  }

  const taskList = incompleteTasks.map(t => `- ${t.title}`).join('\n');
  const prompt = `
Remaining tasks:
${taskList}

Recent conversation:
${transcript}

Are all these tasks completed? Check for evidence of completion.

Reply with JSON: {"complete": boolean, "reason": string}
`;

  return await callEvaluator(prompt);
}
```

## 七、进度追踪

### 7.1 状态栏显示

```typescript
function updateStatusBar(ctx: ExtensionContext) {
  if (!executeState) return;

  const completed = executeState.tasks.filter(t => t.status === 'completed').length;
  const total = executeState.tasks.length;
  const current = executeState.tasks[executeState.currentTaskIndex];

  ctx.ui.setStatus("execute", 
    `◎ ${completed}/${total} - ${current.title.slice(0, 30)}...`);
}
```

### 7.2 进度通知

```typescript
function notifyProgress(ctx: ExtensionContext, task: TaskItem) {
  const completed = executeState!.tasks.filter(t => t.status === 'completed').length;
  const total = executeState!.tasks.length;
  const duration = formatDuration(Date.now() - executeState!.startTimestamp);

  ctx.ui.notify(
    `✅ Task ${completed}/${total} completed: ${task.title}\n` +
    `Duration: ${duration}\n` +
    `Remaining: ${total - completed} tasks`,
    "success"
  );
}
```

## 八、错误处理

### 8.1 任务失败

```typescript
async function handleTaskFailure(task: TaskItem, reason: string, ctx: ExtensionContext) {
  ctx.ui.notify(
    `❌ Task failed: ${task.title}\nReason: ${reason}\n\nRetrying...`,
    "error"
  );

  // 重试逻辑
  task.status = 'in_progress';
  pi.sendUserMessage(
    `The previous attempt failed. Please try again:\n\n${task.description}`,
    { deliverAs: "followUp" }
  );
}
```

### 8.2 超时处理

```typescript
function checkTimeout(): boolean {
  if (!executeState) return false;

  const duration = Date.now() - executeState.startTimestamp;
  const maxDuration = 30 * 60 * 1000; // 30 分钟

  if (duration > maxDuration) {
    ctx.ui.notify(
      `⏱️ Execution timeout after ${formatDuration(duration)}\n` +
      `Completed: ${executeState.tasks.filter(t => t.status === 'completed').length}/${executeState.tasks.length} tasks`,
      "warning"
    );
    return true;
  }

  return false;
}
```

## 九、使用示例

### 9.1 基本使用

```bash
# 1. 创建 task
python3 ./.trellis/scripts/task.py create "展示级产品打磨" --slug product-polish

# 2. 编辑 prd.md，添加任务列表

# 3. 启动 pi
pi

# 4. 执行所有任务
/trellis:execute

# 5. 等待完成...
```

### 9.2 高级使用

```bash
# 只执行阶段 1
/trellis:execute --phase 1

# 从任务 3 开始
/trellis:execute --from 3

# 查看进度
/trellis:execute status

# 暂停
/trellis:execute pause

# 恢复
/trellis:execute resume
```

## 十、实现优先级

### Phase 1: MVP（1-2 天）
- [ ] 创建 trellis-execute extension
- [ ] 实现基本的任务解析
- [ ] 集成 Goal 自动循环
- [ ] 实现任务完成检测

### Phase 2: 增强（2-3 天）
- [ ] 添加进度追踪
- [ ] 实现错误处理
- [ ] 添加暂停/恢复功能
- [ ] 优化评估器

### Phase 3: 完善（1-2 天）
- [ ] 添加超时处理
- [ ] 实现任务依赖
- [ ] 优化 UI 显示
- [ ] 编写文档

## 十一、总结

这个方案将 Goal 的自动循环能力内化到 Trellis 工作流，实现：

1. **一个命令执行所有任务** - `/trellis:execute`
2. **自动任务切换** - 完成一个自动开始下一个
3. **进度追踪** - 实时显示执行进度
4. **错误恢复** - 自动重试失败任务
5. **质量保证** - 自动运行 trellis-check

最终效果：
```
用户: /trellis:execute
系统: [自动执行所有任务...]
系统: 🎉 All tasks completed!
```
