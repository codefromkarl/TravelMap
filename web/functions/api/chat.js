/**
 * LLM API 代理 — Cloudflare Pages Function
 *
 * POST /api/chat
 *
 * 功能：
 *   1. 服务端持有 API Key，前端不暴露
 *   2. 支持多 provider 转发 + SSE 流式透传
 *   3. 无认证，开放访问
 */

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
  sensenova: {
    baseUrl: "https://token.sensenova.cn",
    path: "/v1/chat/completions",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
  },
};

const MAX_BODY = 256 * 1024;

const COMMON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Turn-Info, x-trace-id, x-session-id",
  "Access-Control-Expose-Headers": "x-trace-id",
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

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(null, { status: 405, headers: COMMON_HEADERS });
  }

  const { request, env } = context;

  const traceId = request.headers.get('x-trace-id') || `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[ChatProxy] traceId=${traceId}`);

  const apiKey = env.LLM_API_KEY || env.OPENAI_API_KEY || "";
  const allowedProvider = (env.LLM_PROVIDER || "sensenova").toLowerCase();
  const allowedModel = env.LLM_MODEL || "";

  if (!apiKey) {
    return jsonResponse(503, {
      error: "服务端 API 暂不可用，如需使用请在设置中配置自己的 API Key",
      error_en: "Server API unavailable. Configure your own API Key in settings if needed.",
      missing: ["LLM_API_KEY"]
    });
  }

  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return jsonResponse(413, { error: "Request too large" });
    body = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

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

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(cleanBody),
    });

    const respHeaders = { ...COMMON_HEADERS, "x-trace-id": traceId };

    if (isStream && upstream.body) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no", ...respHeaders },
      });
    }

    const respBody = await upstream.text();
    return new Response(respBody, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", ...respHeaders },
    });
  } catch (err) {
    console.error("[Proxy] Upstream error:", err);
    return jsonResponse(502, {
      error: "服务端 API 暂不可用，如需使用请在设置中配置自己的 API Key",
      error_en: "Server API unavailable. Configure your own API Key in settings if needed.",
      detail: err instanceof Error ? err.message : String(err)
    });
  }
}
