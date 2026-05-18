# P7-a: 消息历史压缩

## 目标
当对话轮数超过阈值时，将旧消息压缩为摘要，减少 input tokens。

## 当前问题

每轮 steer/followUp 都在 messages 中追加完整内容。5 轮微调后：

```
system(30) + turn1(5000) + turn2(5000) + ... + turn5(5000) = 25,000+ input tokens
```

## 优化方案

### 方案: 规则摘要压缩器

```typescript
function compressHistory(messages: Message[]): Message[] {
  if (messages.length <= 6) return messages; // system + 2轮 * 3条
  
  // 保留 system + 最近 2 轮 + 旧消息摘要
  const summary = summarizeMessages(messages.slice(1, -4));
  return [
    messages[0],                          // system prompt
    { role: "system", content: `[历史摘要] ${summary}` },
    ...messages.slice(-4),                // 最近 2 轮对话
  ];
}
```

### 摘要策略（规则-based，无需 LLM）

从旧消息中提取关键信息：
- 用户原始需求（城市、天数、偏好）
- 已确认的天数安排
- 已做的修改记录

```typescript
function summarizeMessages(oldMessages: Message[]): string {
  // 提取用户请求
  const userRequests = oldMessages
    .filter(m => m.role === "user")
    .map(m => extractText(m));
  
  // 提取 assistant 的关键决策
  const assistantDecisions = oldMessages
    .filter(m => m.role === "assistant")
    .map(m => extractKeyDecisions(m));
    
  return `用户请求: ${userRequests[0]}\n已确认行程: ${assistantDecisions.join("; ")}`;
}
```

## 具体改动

1. **新增 `src/services/message-compressor.ts`**
   - `compressHistory(messages, threshold?)` — 压缩消息历史
   - `summarizeMessages(messages)` — 规则摘要
   - `estimateTokenCount(text)` — 粗略估算 token 数

2. **修改 `TravelAgent`**
   - 在 `steer()` / `followUp()` 前检查消息长度
   - 超过阈值时自动压缩
   - 新增 `compressThreshold` 配置项

## 验收标准
- [ ] 新增 `message-compressor.ts` + 单元测试
- [ ] 6 轮消息内不压缩
- [ ] 超过 6 轮后自动压缩旧消息
- [ ] 压缩后保留最近 2 轮完整对话
- [ ] 摘要包含用户原始需求和关键决策
- [ ] `npm run check` 全部通过
