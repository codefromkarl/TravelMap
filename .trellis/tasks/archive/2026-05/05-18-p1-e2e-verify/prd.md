# P1-4: 端到端验证

## 目标
创建 CLI 入口脚本，验证 TravelAgent 从用户输入到结构化行程输出的完整链路。

## 需求
- 创建 `src/bin/cli.ts`，通过命令行调用 TravelAgent
- 用户传入：城市、天数、偏好
- Agent 依次调用景点/天气/地理编码工具
- 最终输出结构化 TripPlan JSON 到 stdout
- 验证 pi-agent-core 的 steering、tool execution、event streaming 均工作正常

## 验收标准
- [ ] `npx tsx src/bin/cli.ts --city 北京 --days 3 --preferences 历史文化` 生成合法 JSON
- [ ] Agent 事件流正常输出到控制台
- [ ] 至少触发 2 个工具调用
