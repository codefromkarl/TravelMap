/**
 * GET /api/auth/callback?code=xxx&state=yyy
 *
 * GitHub / Google OAuth 回调：
 *   1. 验证 state JWT
 *   2. 用 code 换 access_token
 *   3. 获取用户信息
 *   4. 创建/查找用户，签发 auth_token cookie
 *   5. 重定向回首页
 */

import { isSafeRedirectPath, verifyJwt, signJwt } from "../../_lib/jwt.js";
import { getUser, createUser } from "../../_lib/quota.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return new Response("Missing code or state", { status: 400 });
  }

  // ── 验证 state ──
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    return new Response("Authentication not configured", { status: 503 });
  }
  const statePayload = await verifyJwt(state, jwtSecret);
  if (!statePayload || !statePayload.provider) {
    return new Response("Invalid or expired state", { status: 400 });
  }

  const provider = statePayload.provider;
  const redirect = statePayload.redirect || "/";
  if (!isSafeRedirectPath(redirect)) {
    return new Response("Invalid redirect", { status: 400 });
  }

  // ── 用 code 换 access_token ──
  let profile;
  try {
    const tokenData = await exchangeCode(request, provider, code, env);
    profile = await fetchUserProfile(provider, tokenData.access_token, env);
  } catch {
    console.error("[Auth] OAuth exchange failed");
    return new Response("OAuth authentication failed", { status: 502 });
  }

  if (!profile || !profile.id) {
    return new Response("Failed to get user profile", { status: 502 });
  }

  // ── 创建/查找用户 ──
  const kv = env.RATE_LIMIT_KV;
  if (!kv) {
    return new Response("KV not configured", { status: 503 });
  }

  const userId = `${provider}_${profile.id}`;
  let user = await getUser(kv, userId);
  if (!user) {
    user = await createUser(kv, {
      id: userId,
      provider,
      name: profile.name,
      avatar: profile.avatar,
      email: profile.email,
    });
  }

  // ── 签发 JWT cookie ──
  const token = await signJwt(
    { sub: user.id, provider, name: user.name },
    jwtSecret,
    86400 * 7, // 7 天有效
  );

  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(redirect, url.origin).toString(),
      "Set-Cookie": `auth_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${86400 * 7}`,
    },
  });
}

// ─── GitHub OAuth ───────────────────────────────────────────
async function exchangeCode(req, provider, code, env) {
  if (provider === "github") {
    const resp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    return resp.json();
  }

  if (provider === "google") {
    const reqUrl = new URL(req.url);
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${reqUrl.origin}/api/auth/callback`,
        grant_type: "authorization_code",
      }),
    });
    return resp.json();
  }

  throw new Error(`Unknown provider: ${provider}`);
}

async function fetchUserProfile(provider, accessToken, env) {
  if (provider === "github") {
    // 获取基本信息
    const userResp = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "TravelAgent" },
    });
    const userData = await userResp.json();

    // 尝试获取邮箱
    let email = userData.email || "";
    if (!email) {
      try {
        const emailResp = await fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "TravelAgent" },
        });
        const emails = await emailResp.json();
        const primary = emails.find((e) => e.primary);
        if (primary) email = primary.email;
      } catch {}
    }

    return {
      id: String(userData.id),
      name: userData.name || userData.login,
      avatar: userData.avatar_url,
      email,
    };
  }

  if (provider === "google") {
    const resp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await resp.json();
    return {
      id: data.id,
      name: data.name,
      avatar: data.picture,
      email: data.email,
    };
  }

  return null;
}
