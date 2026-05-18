# P6-P1a: 分阶段精简 System Prompt

## 目标
不同阶段使用不同长度的 system prompt，搜索阶段用精简版，编排阶段用完整版，降低每轮 input tokens。

## 当前问题

当前的 `SYSTEM_PROMPT` 约 ~1.5KB，包含：
- 完整工作流程（7 步）
- 局部修改规则
- 伴游问答规则
- 模型切换说明
- 输出格式要求
- 重要规则（7 条）

**每轮 LLM 调用都全量注入这个 prompt。**

## 优化方案

### 分阶段 Prompt

```typescript
// 阶段 1: 搜索（精简版，~300 tokens）
const SEARCH_PROMPT = `你是旅行助手。根据以下目的地和偏好搜索景点、天气、酒店信息。
城市: {city}, 日期: {dates}, 偏好: {prefs}`;

// 阶段 2: 编排（完整版，~1500 tokens）
const PLANNING_PROMPT = `你是「旅途星辰」...
[完整 prompt]`;

// 阶段 3: 微调（最小版，~200 tokens）
const STEERING_PROMPT = `用户要求修改行程。基于已有行程只做最小改动。
已有行程: {summary}
用户请求: {delta}`;
```

### 具体改动

1. **修改 `src/agent/prompts.ts`** — 拆分为阶段化 prompt
   - `SEARCH_PROMPT` — 搜索阶段（精简）
   - `PLANNING_PROMPT` — 编排阶段（完整，基于当前 SYSTEM_PROMPT）
   - `STEERING_PROMPT` — 微调阶段（最小化）

2. **修改 `TravelAgent`** — 阶段切换时更新 system prompt
   - 预搜索阶段用 `SEARCH_PROMPT`
   - 编排阶段切换到 `PLANNING_PROMPT`
   - steer 时切换到 `STEERING_PROMPT`

## 验收标准
- [ ] `prompts.ts` 分阶段 prompt 全部通过 `npm run check`
- [ ] 搜索阶段 prompt < 500 tokens
- [ ] 编排阶段 prompt 完整（基于现有 SYSTEM_PROMPT）
- [ ] 阶段切换逻辑正确
- [ ] `npm run check` 全部通过
