# 构建 Trellis 空闲探索定时器

## Goal

构建一个可本地运行的 Trellis 空闲探索定时器：周期性检测当前仓库的 Trellis 任务流；当没有正在执行的任务时，自动触发后续方向探索，并在探索提示中显式使用 `skill:improve-codebase-architecture` 分析已有内容的问题，再分派子代理执行研究/分析。

## What I already know

- 当前项目由 Trellis 管理，任务目录位于 `.trellis/tasks/`，任务状态记录在各任务的 `task.json`。
- `task.py current` 是 session-scoped，不适合单独作为长期守护进程的唯一空闲判断。
- Trellis agent 类型包括 `trellis-research`、`trellis-implement`、`trellis-check`。
- Pi CLI 支持非交互执行：`pi -p "<prompt>"`，也支持加载 skill：`--skill <path>`。
- `skill:improve-codebase-architecture` 要求使用固定架构词汇：Module、Interface、Depth、Seam、Adapter、Leverage、Locality；先探索并提出 deepening opportunities，不直接设计 Interface。

## Assumptions

- “有空/空闲”定义为：没有 Trellis 任务处于 `in_progress` 或 `review` 状态；`planning`/`deferred` 不阻止空闲探索。
- 自动探索应默认安全：不直接修改业务代码，优先生成研究/架构问题分析；需要实际改代码时再由用户确认或后续 Trellis 任务处理。
- 为避免死循环，定时器必须具备锁、冷却时间、dry-run、once 模式和最大运行次数限制。

## Requirements

1. 提供一个可运行的定时器 CLI。
   - 支持 `--once` 单次检测。
   - 支持 `--interval` 周期检测。
   - 支持 `--cooldown` 防止频繁触发。
   - 支持 `--dry-run` 只打印将执行的动作。
   - 支持 `--max-runs` 限制自动触发次数。
2. 检测 Trellis 任务流。
   - 读取 `.trellis/tasks/*/task.json`。
   - 忽略归档目录。
   - 当存在 `in_progress` 或 `review` 任务时判定为忙碌。
3. 空闲时触发探索。
   - 调用 `pi -p` 非交互执行探索提示。
   - 显式加载/引用 `skill:improve-codebase-architecture`。
   - 提示中要求分派 `trellis-research` 子代理执行代码库探索，并输出架构问题候选。
4. 可观测性与安全。
   - 输出清晰日志：idle/busy、触发时间、命令、退出码。
   - 使用锁文件避免重入。
   - 记录最近一次触发时间用于 cooldown。
   - 默认不执行浏览器/部署/破坏性命令。
5. 测试。
   - 为纯逻辑增加单元测试：duration 解析、任务状态判定、提示构建、cooldown 判断。
   - 至少运行相关单测、typecheck 或等价检查。

## Acceptance Criteria

- [ ] `npm run trellis:idle-explorer -- --once --dry-run` 能在本地执行并输出空闲判定与将要运行的探索提示/命令。
- [ ] 当存在 `in_progress`/`review` 任务时，定时器不会触发探索。
- [ ] 当没有 busy 状态任务且 cooldown 允许时，定时器会准备运行 `pi` 探索命令。
- [ ] 探索提示包含 `improve-codebase-architecture` 的架构词汇约束和子代理分派要求。
- [ ] 单元测试覆盖核心判断逻辑。
- [ ] 相关 lint/typecheck/test 通过。

## Out of Scope

- 不做系统级 daemon/service 安装。
- 不自动提交、推送或部署。
- 不自动执行架构重构代码修改。
- 不实现跨仓库任务队列。

## Technical Notes

- 入口建议：`src/bin/trellis-idle-explorer.ts`，通过 `tsx` 运行。
- 核心逻辑建议：`src/services/trellis-idle-explorer.ts`，方便测试。
- npm script 建议：`"trellis:idle-explorer": "tsx src/bin/trellis-idle-explorer.ts"`。
- 状态文件建议：`.trellis/.runtime/idle-explorer/state.json`；锁文件：`.trellis/.runtime/idle-explorer/lock`。
