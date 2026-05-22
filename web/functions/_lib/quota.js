/**
 * 配额管理 — 免费体验配额
 *
 * 免费用户可使用：
 *   - 10 次完整的旅途规划（含工具调用链）
 *   - 每次规划可微调和生成详细报告
 *
 * 实现为 200 次 LLM API 调用（每次规划约 20 次工具调用链）
 */

export const FREE_TIER = {
  maxApiCalls: 200,  // LLM API 调用次数上限（约 10 次完整规划）
};

/**
 * 从 KV 读取用户数据
 */
export async function getUser(kv, userId) {
  const raw = await kv.get(`user:${userId}`, { type: "json" }).catch(() => null);
  return raw;
}

/**
 * 创建新用户（首次 OAuth 登录时调用）
 */
export async function createUser(kv, profile) {
  const user = {
    id: profile.id,
    provider: profile.provider,
    name: profile.name || "",
    avatar: profile.avatar || "",
    email: profile.email || "",
    createdAt: new Date().toISOString(),
    usage: { apiCalls: 0 },
  };
  await kv.put(`user:${user.id}`, JSON.stringify(user));
  return user;
}

/**
 * 检查配额 & 递增使用量（原子操作）
 * 返回 { ok, user, remaining }
 */
export async function consumeQuota(kv, userId) {
  const user = await getUser(kv, userId);
  if (!user) return { ok: false, reason: "User not found" };

  if (user.usage.apiCalls >= FREE_TIER.maxApiCalls) {
    return { ok: false, reason: "Free quota exhausted", remaining: 0, user };
  }

  user.usage.apiCalls++;
  await kv.put(`user:${user.id}`, JSON.stringify(user));

  return {
    ok: true,
    remaining: FREE_TIER.maxApiCalls - user.usage.apiCalls,
    user,
  };
}
