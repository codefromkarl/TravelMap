/**
 * 会话持久化服务 — 行程数据的序列化/反序列化 + 标题提取
 *
 * 用于 IndexedDB 存储层的辅助工具函数。
 */

/** 持久化的行程记录 */
export interface PersistedTrip {
  id: string;
  title: string;
  summary: string;
  content: string;
  messages: unknown[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 从 assistant 消息内容中提取行程标题
 * 格式：城市名 + 日期范围
 */
export function extractTitle(content: string): string {
  // 尝试匹配 "目的地**:** XXX" 或 "城市:** XXX" (支持 **加粗** 包裹)
  const cityMatch = content.match(/\*{0,2}(?:目的地|城市)\*{0,2}[：:]\s*\*{0,2}([^*\n,，]+)/);
  if (cityMatch) {
    const city = cityMatch[1].trim();
    const dateMatch = content.match(
      /(\d{4}[-/]\d{1,2}[-/]\d{1,2})\s*[至到~-]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
    );
    if (dateMatch) {
      return `${city} ${dateMatch[1]}~${dateMatch[2]}`;
    }
    return city;
  }

  // 尝试匹配 markdown 标题中的城市
  const headingMatch = content.match(/^#+\s*(.+?行程|.+?旅行|.+?计划)/m);
  if (headingMatch) {
    return headingMatch[1].trim().substring(0, 50);
  }

  // 退回：取前 30 字符
  return (
    content
      .substring(0, 30)
      .replace(/[#*\n]/g, "")
      .trim() || "未命名行程"
  );
}

/**
 * 生成行程摘要（取前 100 字符）
 */
export function extractSummary(content: string): string {
  // 去掉 markdown 标记
  const cleaned = content
    .replace(/^#+\s+.*/gm, "")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return cleaned.substring(0, 100).trim();
}

/**
 * 验证消息数组是否可恢复
 */
export function isValidMessages(messages: unknown[]): messages is Record<string, unknown>[] {
  return (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        "role" in (m as Record<string, unknown>) &&
        "content" in (m as Record<string, unknown>),
    )
  );
}

/**
 * 创建新的 PersistedTrip 记录
 */
export function createPersistedTrip(
  id: string,
  content: string,
  messages: unknown[],
): PersistedTrip {
  const now = new Date().toISOString();
  return {
    id,
    title: extractTitle(content),
    summary: extractSummary(content),
    content,
    messages,
    createdAt: now,
    updatedAt: now,
  };
}
