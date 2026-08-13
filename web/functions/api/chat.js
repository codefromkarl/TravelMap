/**
 * Authenticated, same-origin LLM proxy for Cloudflare Pages Functions.
 * Provider, model, upstream URL and credentials are controlled by the server.
 */

import { extractToken, verifyJwt } from "../_lib/jwt.js";
import { consumeQuota, getUser } from "../_lib/quota.js";

const PROVIDERS = Object.freeze({
  openai: {
    baseUrl: "https://api.openai.com",
    path: "/v1/chat/completions",
    keyEnv: "OPENAI_API_KEY",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com",
    path: "/v1/messages",
    keyEnv: "ANTHROPIC_API_KEY",
    authHeader: "x-api-key",
    authPrefix: "",
    extraHeaders: { "anthropic-version": "2023-06-01" },
  },
  google: {
    baseUrl: "https://generativelanguage.googleapis.com",
    pathFn: (model) => `/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    keyEnv: "GOOGLE_API_KEY",
    authHeader: "x-goog-api-key",
    authPrefix: "",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    path: "/v1/chat/completions",
    keyEnv: "DEEPSEEK_API_KEY",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai",
    path: "/api/v1/chat/completions",
    keyEnv: "OPENROUTER_API_KEY",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
  },
  sensenova: {
    baseUrl: "https://token.sensenova.cn",
    path: "/v1/chat/completions",
    keyEnv: "SENSENOVA_API_KEY",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
  },
});

const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 80;
const MAX_CONTENT_BYTES = 48 * 1024;
const UPSTREAM_TIMEOUT_MS = 45_000;
const USER_REQUESTS_PER_MINUTE = 12;
const IP_REQUESTS_PER_MINUTE = 60;
const FORBIDDEN_FIELDS = ["_provider", "baseUrl", "baseURL", "apiKey", "api_key"];

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'",
  "X-Content-Type-Options": "nosniff",
  Vary: "Origin",
};

function jsonResponse(status, code, message, extraHeaders = {}) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...RESPONSE_HEADERS,
      ...extraHeaders,
    },
  });
}

function hasAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  return request.headers.get("Sec-Fetch-Site") !== "cross-site";
}

function validateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "invalid_body";
  if (FORBIDDEN_FIELDS.some((field) => Object.hasOwn(body, field))) return "forbidden_routing_field";
  if (!Array.isArray(body.messages) || body.messages.length === 0) return "messages_required";
  if (body.messages.length > MAX_MESSAGES) return "too_many_messages";

  let contentBytes = 0;
  for (const message of body.messages) {
    if (!message || typeof message !== "object" || typeof message.role !== "string") {
      return "invalid_message";
    }
    if (!new Set(["system", "developer", "user", "assistant", "tool"]).has(message.role)) {
      return "invalid_message_role";
    }
    try {
      contentBytes += new TextEncoder().encode(JSON.stringify(message.content ?? "")).byteLength;
    } catch {
      return "invalid_message_content";
    }
  }
  if (contentBytes > MAX_CONTENT_BYTES) return "message_content_too_large";
  return null;
}

async function checkRateLimit(kv, key, limit) {
  try {
    const bucket = Math.floor(Date.now() / 60_000);
    const storageKey = `chat-rate:${bucket}:${key}`;
    const current = Number(await kv.get(storageKey)) || 0;
    if (current >= limit) return false;
    await kv.put(storageKey, String(current + 1), { expirationTtl: 120 });
    return true;
  } catch {
    return null;
  }
}

export function onRequestOptions(context) {
  if (context?.request && !hasAllowedOrigin(context.request)) {
    return jsonResponse(403, "FORBIDDEN_ORIGIN", "Cross-origin requests are not allowed");
  }
  return new Response(null, {
    status: 204,
    headers: { Allow: "POST, OPTIONS", ...RESPONSE_HEADERS },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", ...RESPONSE_HEADERS } });
  }
  if (!hasAllowedOrigin(request)) {
    return jsonResponse(403, "FORBIDDEN_ORIGIN", "Cross-origin requests are not allowed");
  }

  if (!env.JWT_SECRET || !env.RATE_LIMIT_KV) {
    return jsonResponse(503, "SECURITY_NOT_CONFIGURED", "Chat security is not configured");
  }

  const providerName = String(env.LLM_PROVIDER || "").toLowerCase();
  const provider = PROVIDERS[providerName];
  const model = typeof env.LLM_MODEL === "string" ? env.LLM_MODEL.trim() : "";
  const apiKey = provider ? env[provider.keyEnv] || env.LLM_API_KEY : "";
  if (!provider || !model || !apiKey) {
    return jsonResponse(503, "PROVIDER_NOT_CONFIGURED", "Chat provider is not configured");
  }

  const payload = await verifyJwt(extractToken(request), env.JWT_SECRET);
  if (!payload?.sub) {
    return jsonResponse(401, "AUTH_REQUIRED", "Authentication required");
  }

  const user = await getUser(env.RATE_LIMIT_KV, payload.sub);
  if (!user) {
    return jsonResponse(401, "AUTH_REQUIRED", "Authentication required");
  }

  const userRate = await checkRateLimit(env.RATE_LIMIT_KV, `user:${payload.sub}`, USER_REQUESTS_PER_MINUTE);
  if (userRate === null) {
    return jsonResponse(503, "RATE_LIMIT_UNAVAILABLE", "Rate limiting is unavailable");
  }
  if (!userRate) {
    return jsonResponse(429, "RATE_LIMITED", "Too many requests", { "Retry-After": "60" });
  }

  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) {
    const ipRate = await checkRateLimit(env.RATE_LIMIT_KV, `ip:${clientIp}`, IP_REQUESTS_PER_MINUTE);
    if (ipRate === null) {
      return jsonResponse(503, "RATE_LIMIT_UNAVAILABLE", "Rate limiting is unavailable");
    }
    if (!ipRate) {
      return jsonResponse(429, "RATE_LIMITED", "Too many requests", { "Retry-After": "60" });
    }
  }

  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonResponse(413, "REQUEST_TOO_LARGE", "Request too large");
    }
    body = JSON.parse(raw);
  } catch {
    return jsonResponse(400, "INVALID_JSON", "Invalid JSON");
  }

  const validationError = validateBody(body);
  if (validationError) {
    return jsonResponse(400, "INVALID_REQUEST", `Invalid request: ${validationError}`);
  }

  const quota = await consumeQuota(env.RATE_LIMIT_KV, payload.sub);
  if (!quota.ok) {
    const status = quota.reason === "Free quota exhausted" ? 429 : 401;
    const code = status === 429 ? "QUOTA_EXCEEDED" : "AUTH_REQUIRED";
    return jsonResponse(status, code, status === 429 ? "Daily quota exceeded" : "Authentication required");
  }

  const cleanBody = { ...body, model };
  cleanBody.messages = body.messages.map((message) =>
    message.role === "developer" ? { ...message, role: "system" } : message,
  );
  if (Number.isFinite(cleanBody.max_tokens)) {
    cleanBody.max_tokens = Math.min(Math.max(1, cleanBody.max_tokens), 8192);
  }
  if (Number.isFinite(cleanBody.max_completion_tokens)) {
    cleanBody.max_completion_tokens = Math.min(Math.max(1, cleanBody.max_completion_tokens), 8192);
  }

  const upstreamPath = provider.pathFn ? provider.pathFn(model) : provider.path;
  const upstreamUrl = `${provider.baseUrl}${upstreamPath}`;
  const upstreamHeaders = {
    "Content-Type": "application/json",
    [provider.authHeader]: `${provider.authPrefix}${apiKey}`,
    ...(provider.extraHeaders || {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const responseHeaders = {
    ...RESPONSE_HEADERS,
    "X-Quota-Remaining": String(quota.remaining),
  };

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(cleanBody),
      redirect: "manual",
      signal: controller.signal,
    });

    if (!upstream.ok) {
      console.error(`[ChatProxy] upstream_failed provider=${providerName} status=${upstream.status}`);
      return jsonResponse(502, "UPSTREAM_ERROR", "Chat provider request failed", responseHeaders);
    }

    if (cleanBody.stream && upstream.body) {
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          ...responseHeaders,
        },
      });
    }

    return new Response(await upstream.text(), {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
        ...responseHeaders,
      },
    });
  } catch (error) {
    const reason = error && typeof error === "object" && error.name === "AbortError" ? "timeout" : "network";
    console.error(`[ChatProxy] upstream_unavailable provider=${providerName} reason=${reason}`);
    return jsonResponse(502, "UPSTREAM_ERROR", "Chat provider request failed", responseHeaders);
  } finally {
    clearTimeout(timeoutId);
  }
}
