/**
 * GET /api/auth/login?provider=github|google
 *
 * 生成 OAuth 授权 URL，将用户重定向到 GitHub / Google 登录页
 */

import { signJwt } from "../../_lib/jwt.js";

const OAUTH_CONFIG = {
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    scope: "read:user user:email",
    clientIdEnv: "GITHUB_CLIENT_ID",
  },
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scope: "openid profile email",
    clientIdEnv: "GOOGLE_CLIENT_ID",
  },
};

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") || "";
  const cfg = OAUTH_CONFIG[provider];
  if (!cfg) {
    return new Response("Unsupported provider", { status: 400 });
  }

  const clientId = env[cfg.clientIdEnv];
  if (!clientId) {
    return new Response(`OAuth not configured: ${cfg.clientIdEnv}`, { status: 503 });
  }

  // 构建 redirect_uri（自动检测当前域名）
  const reqUrl = new URL(request.url);
  const redirectUri = `${reqUrl.origin}/api/auth/callback`;

  // state 参数用 JWT 签名防 CSRF（5 分钟有效）
  const jwtSecret = env.JWT_SECRET || "dev-secret";
  const state = await signJwt({ provider, redirect: url.searchParams.get("redirect") || "/" }, jwtSecret, 300);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: cfg.scope,
    state,
    response_type: "code",
  });

  // Google 需要 access_type=online 和 prompt
  if (provider === "google") {
    params.set("access_type", "online");
    params.set("prompt", "consent");
  }

  return Response.redirect(`${cfg.authorizeUrl}?${params.toString()}`, 302);
}
