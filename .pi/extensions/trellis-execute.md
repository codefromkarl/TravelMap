# Trellis Execute - 一个命令执行所有任务

## 快速开始

### 1. 创建任务并编写 prd.md

```bash
# 创建 task
python3 ./.trellis/scripts/task.py create "展示级产品打磨" --slug product-polish

# 设置为当前任务
python3 ./.trellis/scripts/task.py start 05-23-product-polish
```

### 2. 编辑 prd.md，添加任务列表

```markdown
# 展示级产品打磨

## 阶段 1: 核心体验

- [ ] 新手引导弹窗
- [ ] 示例行程预置
- [ ] 错误处理优化

## 阶段 2: 移动端适配

- [ ] 首页响应式布局
- [ ] 行程详情页适配
- [ ] 地图触摸手势支持
```

### 3. 启动 pi 并执行

```bash
# 启动 pi
pi

# 执行所有任务
/trellis:execute
```

就这么简单！系统会自动：
1. 解析 prd.md 中的任务
2. 逐个执行每个任务
3. 每轮检查任务是否完成
4. 完成后自动切换到下一个任务
5. 所有任务完成后通知你

---

## 命令参考

### 主命令

```bash
# 开始执行所有任务
/trellis:execute

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

# 停止执行
/trellis:execute stop
```

---

## 工作流程

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  用户: /trellis:execute                                          │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. 读取 prd.md                                          │   │
│  │ 2. 解析任务列表                                         │   │
│  │ 3. 找到第一个未完成任务                                 │   │
│  │ 4. 开始执行                                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   自动循环执行                           │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │ 循环:                                           │   │   │
│  │  │   1. Agent 执行当前任务                         │   │   │
│  │  │   2. turn_end → 检查任务是否完成                │   │   │
│  │  │   3. 完成 → 标记 ✅，切换下一个                │   │   │
│  │  │   4. 未完成 → 注入 guidance，继续              │   │   │
│  │  │   5. 所有任务完成 → 通知用户                    │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🎉 All tasks completed!                                 │   │
│  │ - 自动更新 prd.md 中的任务状态                          │   │
│  │ - 提示运行 trellis-check                                │   │
│  │ - 记录执行统计                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 使用示例

### 示例 1: 基本使用

```bash
# 准备工作
cd /path/to/project
python3 ./.trellis/scripts/task.py create "添加用户认证" --slug auth
python3 ./.trellis/scripts/task.py start 05-23-auth

# 编辑 .trellis/tasks/05-23-auth/prd.md
# 添加任务列表

# 启动执行
pi
/trellis:execute

# 等待完成...
# 系统会自动执行所有任务并通知你
```

### 示例 2: 分阶段执行

```bash
# 只执行阶段 1
/trellis:execute --phase 1

# 从任务 3 开始
/trellis:execute --from 3
```

### 示例 3: 暂停和恢复

```bash
# 执行中需要暂停
/trellis:execute pause

# 查看当前进度
/trellis:execute status

# 恢复执行
/trellis:execute resume
```

### 示例 4: 处理失败

```bash
# 当前任务失败，重试
/trellis:execute retry

# 跳过当前任务
/trellis:execute skip

# 停止执行
/trellis:execute stop
```

---

## prd.md 格式要求

### 支持的格式

```markdown
# 项目标题

## 阶段 1: 标题

- [ ] 任务 1
- [ ] 任务 2
- [x] 已完成的任务

## 阶段 2: 标题

- [ ] 任务 3
- [ ] 任务 4
```

### 关键点

1. **任务项必须以 `- [ ]` 或 `- [x]` 开头**
2. **阶段标题以 `##` 开头**
3. **`[x]` 表示已完成，会自动跳过**
4. **每个任务应该是独立可验证的**

### 最佳实践

```markdown
## 阶段 1: 核心功能

- [ ] 实现用户登录接口
- [ ] 添加 JWT 认证中间件
- [ ] 编写登录测试用例

## 阶段 2: 前端集成

- [ ] 创建登录页面组件
- [ ] 对接登录 API
- [ ] 添加表单验证
```

---

## 状态栏显示

执行过程中，状态栏会显示：

```
◎ 3/10 - 实现用户登录接口...
```

- `◎` - 正在执行
- `⏸` - 已暂停
- `3/10` - 已完成/总数
- 任务标题（截断）

---

## 通知系统

### 任务完成

```
✅ Task 3/10 completed: 实现用户登录接口
```

### 所有任务完成

```
🎉 All tasks completed!
Duration: 5m 32s
Tasks: 10/10
Turns: 25

Running quality check...
```

### 执行暂停

```
Execution paused
```

---

## 进度追踪

### 查看详细进度

```bash
/trellis:execute status
```

输出示例：

```
Execution Status: Running
Progress: 3/10 tasks
Duration: 2m 15s
Turns: 8
Current: 实现用户登录接口
Last eval: Task not yet verified as complete
```

---

## 错误处理

### 任务失败

如果任务执行失败，系统会：
1. 显示错误信息
2. 自动重试（可配置）
3. 或跳过该任务

### 超时处理

如果执行时间过长：
- 系统会提醒
- 可以选择继续或停止

### 恢复执行

如果会话中断：
- 执行状态会保存
- 下次启动时自动恢复
- 使用 `/trellis:execute resume` 继续

---

## 集成 Trellis 工作流

### 完整工作流程

```bash
# Phase 1: Plan
python3 ./.trellis/scripts/task.py create "新功能" --slug feature
# 编辑 prd.md

# Phase 2: Execute
pi
/trellis:execute
# 等待自动完成...

# Phase 3: Finish
/trellis:check
/trellis:update-spec
git add .
git commit -m "feat: 新功能完成"
/trellis:finish-work
```

### 与 trellis-check 集成

所有任务完成后，系统会提示：

```
All tasks completed. Please run /trellis:check to verify quality.
```

运行检查：

```bash
/trellis:check
```

---

## 高级功能

### 任务依赖

在 prd.md 中标注依赖关系：

```markdown
- [ ] 任务 A
- [ ] 任务 B (depends on A)
- [ ] 任务 C (depends on A, B)
```

系统会按依赖顺序执行。

### 条件任务

```markdown
- [ ] 任务 X (if: 需要时执行)
```

这些任务可以跳过：

```bash
/trellis:execute skip
```

### 并行任务

独立任务可以并行执行（未来功能）：

```markdown
- [ ] 任务 P1 (parallel)
- [ ] 任务 P2 (parallel)
- [ ] 任务 Q (depends on P1, P2)
```

---

## 最佳实践

### 1. 任务粒度

```markdown
# ✅ 好的任务粒度
- [ ] 实现用户登录 API
- [ ] 添加登录测试
- [ ] 创建登录页面

# ❌ 太粗
- [ ] 完成用户系统

# ❌ 太细
- [ ] 创建 login.ts 文件
- [ ] 编写 login 函数
- [ ] 添加 login 路由
```

### 2. 可验证性

```markdown
# ✅ 可验证
- [ ] 所有登录测试通过
- [ ] 登录页面可正常显示

# ❌ 难以验证
- [ ] 优化登录体验
- [ ] 完善登录功能
```

### 3. 独立性

```markdown
# ✅ 独立任务
- [ ] 实现登录 API
- [ ] 实现注册 API

# ❌ 有依赖
- [ ] 创建数据库表
- [ ] 基于表创建 API（隐含依赖）
```

---

## 故障排除

### 问题: 无法解析任务

**症状**: "No tasks found in prd.md"

**解决**: 检查 prd.md 格式，确保任务以 `- [ ]` 开头

### 问题: 任务一直不完成

**症状**: 同一个任务执行很多轮

**解决**:
1. 检查任务是否太模糊
2. 使用 `/trellis:execute skip` 跳过
3. 使用 `/trellis:execute retry` 重试

### 问题: 执行中断

**症状**: 会话断开

**解决**:
1. 重新启动 pi
2. 系统会自动恢复状态
3. 使用 `/trellis:execute resume` 继续

---

## 配置选项

### 评估器配置

在 extension 中配置评估器：

```typescript
// 默认使用启发式判断
// 可配置为使用 LLM
evaluatorModel: "haiku"
```

### 超时配置

```typescript
// 最大执行时间（毫秒）
maxDuration: 30 * 60 * 1000  // 30 分钟

// 最大轮数
maxTurns: 100
```

### 重试配置

```typescript
// 最大重试次数
maxRetries: 3

// 重试间隔（毫秒）
retryDelay: 5000
```

---

## 总结

`/trellis:execute` 将 Goal 的自动循环能力内化到 Trellis 工作流，实现：

1. ✅ **一个命令执行所有任务**
2. ✅ **自动任务切换**
3. ✅ **进度追踪**
4. ✅ **错误恢复**
5. ✅ **与 Trellis 集成**

使用方式：

```bash
# 1. 创建任务
python3 ./.trellis/scripts/task.py create "任务名" --slug name

# 2. 编辑 prd.md 添加任务列表

# 3. 执行
pi
/trellis:execute

# 4. 等待完成
```
