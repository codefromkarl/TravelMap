/**
 * LLM API 代理 — Cloudflare Pages Function
 *
 * POST /api/chat
 *
 * 功能：
 *   1. 验证用户登录状态（JWT cookie）
 *   2. 检查用户配额
 *   3. 服务端持有 API Key，前端不暴露
 *   4. 支持多 provider 转发 + SSE 流式透传
 */

import { verifyJwt, extractToken } from "../_lib/jwt.js";
import { consumeQuota, getUser, FREE_TIER } from "../_lib/quota.js";

// ─── Provider 路由表 ────────────────────────────────────────
const PROVIDERS = {
  openai: {
    baseUrl: "https://api.openai.com",
    path: "/v1/chat/completions",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com",
    path: "/v1/messages",
    authHeader: "x-api-key",
    authPrefix: "",
    extraHeaders: { "anthropic-version": "2023-06-01" },
  },
  google: {
    baseUrl: "https://generativelanguage.googleapis.com",
    pathFn: (model) => `/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    authHeader: "x-goog-api-key",
    authPrefix: "",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    path: "/v1/chat/completions",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai",
    path: "/api/v1/chat/completions",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
  },
};

const MAX_BODY = 256 * 1024;

const COMMON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Turn-Info, x-trace-id, x-session-id",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Expose-Headers": "x-trace-id, X-Quota-Remaining",
};

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...COMMON_HEADERS },
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: COMMON_HEADERS });
}

// ─── 主处理 ────────────────────────────────────────────────
// 使用 onRequest（而非 onRequestPost）因为 Cloudflare Pages Functions
// 对 method-specific handler 的路由不可靠，onRequest catch-all 更稳定。
export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(null, { status: 405, headers: COMMON_HEADERS });
  }
  return handlePost(context);
}

async function handlePost(context) {
  const { request, env } = context;

  // ── 提取 traceId ──
  const traceId = request.headers.get('x-trace-id') || `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const sessionId = request.headers.get('x-session-id') || 'unknown';
  console.log(`[ChatProxy] traceId=${traceId} sessionId=${sessionId}`);

  // ── 环境变量 ──
  const apiKey = env.LLM_API_KEY || env.OPENAI_API_KEY || "";
  const allowedProvider = (env.LLM_PROVIDER || "openai").toLowerCase();
  const allowedModel = env.LLM_MODEL || "";
  const jwtSecret = env.JWT_SECRET || "dev-secret";

  if (!apiKey) {
    console.error(
      "[ChatProxy] ⚠️ LLM_API_KEY / OPENAI_API_KEY 均未配置。" +
        "请在 Cloudflare Pages 环境变量中设置 API Key。"
    );
    return jsonResponse(503, {
      error: "Service not configured",
      detail:
        "缺少 LLM_API_KEY 或 OPENAI_API_KEY 环境变量。" +
        "请在 Cloudflare Dashboard → Pages → Settings → Environment variables 中配置。",
      missing: ["LLM_API_KEY", "OPENAI_API_KEY"],
    });
  }

  // ── 认证检查 ──
  const token = extractToken(request);
  const payload = await verifyJwt(token, jwtSecret);
  if (!payload || !payload.sub) {
    return jsonResponse(401, { error: "Login required", code: "AUTH_REQUIRED" });
  }

  // ── 配额检查 ──
  const kv = env.RATE_LIMIT_KV;
  if (kv) {
    const quota = await consumeQuota(kv, payload.sub);
    if (!quota.ok) {
      return jsonResponse(403, {
        error: quota.reason,
        code: "QUOTA_EXCEEDED",
        remaining: 0,
        max: FREE_TIER.maxApiCalls,
      });
    }
  }

  // ── 解析请求体 ──
  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return jsonResponse(413, { error: "Request too large" });
    body = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  // ── 确定 provider ──
  const provider = (body._provider || allowedProvider).toLowerCase();
  const cfg = PROVIDERS[provider];
  if (!cfg) return jsonResponse(400, { error: `Unsupported provider: ${provider}` });

  const model = allowedModel || body.model || "";
  const upstreamPath = cfg.pathFn ? cfg.pathFn(model) : cfg.path;
  const upstreamUrl = `${cfg.baseUrl}${upstreamPath}`;

  const upstreamHeaders = {
    "Content-Type": "application/json",
    [cfg.authHeader]: `${cfg.authPrefix}${apiKey}`,
    ...(cfg.extraHeaders || {}),
  };

  const cleanBody = { ...body };
  delete cleanBody._provider;
  if (allowedModel) cleanBody.model = allowedModel;

  const isStream = !!cleanBody.stream;

  // ── 转发 ──
  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(cleanBody),
    });

    // 用量头（让前端知道剩余配额）
    const user = kv ? await getUser(kv, payload.sub) : null;
    const remaining = user ? FREE_TIER.maxApiCalls - (user.usage?.apiCalls || 0) : FREE_TIER.maxApiCalls;
    const usageHeaders = { "X-Quota-Remaining": String(Math.max(0, remaining)), "x-trace-id": traceId };

    if (isStream && upstream.body) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
          ...COMMON_HEADERS,
          ...usageHeaders,
        },
      });
    }

    const respBody = await upstream.text();
    return new Response(respBody, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", ...COMMON_HEADERS, ...usageHeaders },
    });
  } catch (err) {
    console.error("[Proxy] Upstream error:", err);
    return jsonResponse(502, { error: "Upstream service unavailable" });
  }
}
