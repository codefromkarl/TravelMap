/**
 * GET /api/auth/status
 *
 * 返回当前用户信息和剩余配额
 * 未登录时返回 401
 */

import { verifyJwt, extractToken } from "../../_lib/jwt.js";
import { getUser, FREE_TIER } from "../../_lib/quota.js";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

/** 返回 401，附带建议走 SSO 的重定向信息 */
function unauthenticated(ssoRedirect = false) {
  const headers = {
    ...HEADERS,
    "Set-Cookie": "auth_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  };
  const body = { authenticated: false };
  if (ssoRedirect) {
    body.ssoUrl = "/api/auth/sso";
  }
  return new Response(JSON.stringify(body), { status: 401, headers });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || !env.RATE_LIMIT_KV) {
    return new Response(JSON.stringify({ authenticated: false, code: "AUTH_NOT_CONFIGURED" }), {
      status: 503,
      headers: HEADERS,
    });
  }
  const token = extractToken(request);

  // 无本地 JWT → 检查是否有博客的 Better Auth cookie
  if (!token) {
    const cookie = request.headers.get("Cookie") || "";
    const hasBlogSession = /better-auth\.session_token=/.test(cookie);
    return unauthenticated(hasBlogSession);
  }

  const payload = await verifyJwt(token, jwtSecret);
  if (!payload || !payload.sub) {
    return unauthenticated(true);
  }

  const user = await getUser(env.RATE_LIMIT_KV, payload.sub);

  if (!user) {
    return unauthenticated(true);
  }

  const remaining = FREE_TIER.maxApiCalls - (user.usage?.apiCalls || 0);

  return new Response(
    JSON.stringify({
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        provider: user.provider,
      },
      quota: {
        used: user.usage?.apiCalls || 0,
        max: FREE_TIER.maxApiCalls,
        remaining: Math.max(0, remaining),
      },
    }),
    { headers: HEADERS },
  );
}
