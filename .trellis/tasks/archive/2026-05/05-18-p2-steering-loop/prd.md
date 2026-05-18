# P2-1: Steering 交互循环

## 目标
实现逐步确认式行程规划——Agent 生成 Day 1 方案 → 暂停等用户确认 → 继续 Day 2。

## 需求
- 利用 pi-agent-core 的 `agent.steer()` 实现中途干预
- Agent 每生成一天行程后暂停，等待用户反馈
- 用户说"满意"继续下一天，"换一个"重新生成当天
- 通过 system prompt 控制分步输出行为
- 支持 prepareNextTurn 在 turn 间注入确认逻辑

## 验收标准
- [x] Agent 能在生成 Day 1 后暂停等待用户输入
- [x] 用户确认后继续生成 Day 2
- [x] 用户拒绝后重新生成当前天
