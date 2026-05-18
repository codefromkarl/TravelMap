/**
 * 消息历史压缩服务 — 减少长对话场景的 input tokens
 *
 * 策略：超过阈值后，将旧消息（除 system + 最近 N 轮）压缩为规则摘要。
 * 不调用 LLM，纯代码层提取关键信息。
 */

// ─── 类型 ──────────────────────────────────────────────

export interface MessageLike {
  role: string;
  content: unknown;
}

export interface CompressorOptions {
  /** 保留的最近完整对话轮数（每轮 = user + assistant + toolResult） */
  preserveRounds?: number;
  /** 触发压缩的消息数阈值 */
  threshold?: number;
  /** 摘要最大长度（字符） */
  maxSummaryLength?: number;
}

export interface CompressResult {
  messages: MessageLike[];
  compressed: boolean;
  summary?: string;
}

// ─── 文本提取 ──────────────────────────────────────────────

function extractText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: string; text?: string } => typeof c === "object" && c !== null)
      .map((c) => c.text ?? "")
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** 粗略估算字符数对应的 token 数（中文按 chars/2，英文按 chars/4） */
export function estimateTokens(text: string): number {
  // 混合文本的粗略估算：中文字符占多数时按 /2，否则按 /4
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const ratio = chineseChars / text.length;
  const divisor = ratio > 0.5 ? 2 : 4;
  return Math.ceil(text.length / divisor);
}

// ─── 规则摘要 ──────────────────────────────────────────────

/**
 * 从旧消息中提取关键信息生成规则摘要
 *
 * 提取内容：
 * - 用户原始旅行请求
 * - 已生成的行程概览
 * - 已执行的修改记录
 */
function generateRuleSummary(oldMessages: MessageLike[]): string {
  const parts: string[] = [];

  // 1. 提取用户原始请求（第一条 user message）
  const firstUser = oldMessages.find((m) => m.role === "user");
  if (firstUser) {
    const text = extractText(firstUser.content);
    // 截断到前 200 字符
    const request = text.slice(0, 200).replace(/\s+/g, " ");
    parts.push(`用户请求: ${request}`);
  }

  // 2. 提取 assistant 输出的关键决策（找包含 JSON 或行程的）
  const assistantMessages = oldMessages.filter((m) => m.role === "assistant");
  let planExtracted = false;

  for (const msg of assistantMessages) {
    const text = extractText(msg.content);

    // 尝试提取城市/天数
    const cityMatch = text.match(/目的地[:：]\s*([^\n]+)/);
    const daysMatch = text.match(/(\d+)\s*天/);
    if (cityMatch && daysMatch && !planExtracted) {
      parts.push(`行程概览: ${cityMatch[1]} ${daysMatch[1]}天`);
      planExtracted = true;
    }

    // 提取 JSON 中的关键信息
    const jsonMatch = text.match(/"city"\s*:\s*"([^"]+)"/);
    const daysJsonMatch = text.match(/"days"\s*:\s*(\d+)/);
    if (jsonMatch && !planExtracted) {
      parts.push(`行程概览: ${jsonMatch[1]} ${daysJsonMatch ? `${daysJsonMatch[1]}天` : ""}`);
      planExtracted = true;
    }
  }

  // 3. 提取修改记录（steer 类型的 user message）
  const steerMessages = oldMessages
    .filter((m) => m.role === "user")
    .slice(1) // 跳过第一条（原始请求）
    .map((m) => extractText(m.content))
    .filter((t) => t.length > 0 && t.length < 500); // 排除太长的（可能是完整 prompt）

  if (steerMessages.length > 0) {
    parts.push(`已做修改: ${steerMessages.join("; ")}`);
  }

  return parts.join("\n") || "历史对话已压缩";
}

// ─── 主入口 ──────────────────────────────────────────────

/**
 * 压缩消息历史
 *
 * @param messages 完整消息列表（含 system prompt）
 * @param options 压缩选项
 * @returns 压缩后的消息列表
 *
 * @example
 * // 原始: [system, user1, assistant1, tool1, user2, assistant2, tool2, user3, assistant3]
 * // 阈值 6，保留 1 轮 → 压缩为:
 * // [system, summary, user2, assistant2, user3, assistant3]
 */
export function compressHistory(
  messages: MessageLike[],
  options: CompressorOptions = {},
): CompressResult {
  const { preserveRounds = 1, threshold = 6, maxSummaryLength = 500 } = options;

  // 消息数未达阈值，不压缩
  if (messages.length <= threshold) {
    return { messages, compressed: false };
  }

  // 找到 system message（通常在第一条）
  const systemIndex = messages.findIndex((m) => m.role === "system");
  const hasSystem = systemIndex >= 0;

  // 确定要保留的最近消息数（每轮约 3 条：user + assistant + toolResult）
  const keepCount = preserveRounds * 3;

  // 分割：旧消息 / 保留消息
  const splitIndex = Math.max(hasSystem ? systemIndex + 1 : 0, messages.length - keepCount);

  const oldMessages = messages.slice(hasSystem ? systemIndex + 1 : 0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  // 生成摘要
  let summary = generateRuleSummary(oldMessages);
  if (summary.length > maxSummaryLength) {
    summary = `${summary.slice(0, maxSummaryLength)}...[已截断]`;
  }

  // 组装压缩后的消息列表
  const result: MessageLike[] = [];

  if (hasSystem) {
    result.push(messages[systemIndex]!);
  }

  result.push({
    role: "system",
    content: `[历史摘要] ${summary}`,
  });

  result.push(...recentMessages);

  return { messages: result, compressed: true, summary };
}

/**
 * 计算消息列表的估算 token 数
 */
export function estimateMessageTokens(messages: MessageLike[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(extractText(msg.content));
    // system/user/assistant 角色标记的额外开销
    total += 4;
  }
  return total;
}

/**
 * 获取压缩统计信息
 */
export function getCompressionStats(
  original: MessageLike[],
  compressed: MessageLike[],
): { beforeTokens: number; afterTokens: number; savedPercent: number } {
  const beforeTokens = estimateMessageTokens(original);
  const afterTokens = estimateMessageTokens(compressed);
  const savedPercent =
    beforeTokens > 0 ? Math.round(((beforeTokens - afterTokens) / beforeTokens) * 100) : 0;

  return { beforeTokens, afterTokens, savedPercent };
}
