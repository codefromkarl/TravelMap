/**
 * GET /api/auth/sso
 *
 * 跨子域 SSO：读取博客 (codefromkarl.xyz) 的 Better Auth session cookie，
 * 验证后在 travel 子域签发本地 JWT。
 *
 * 流程：
 *   1. 检查是否已有有效本地 JWT → 直接回首页
 *   2. 读取 better-auth.session_token cookie
 *   3. 调博客 /api/auth/get-session 验证
 *   4. 创建/查找本地用户 → 签发 auth_token JWT
 *   5. 无 session → 重定向到博客登录页（带 callbackURL）
 */

import { verifyJwt, signJwt, extractToken } from "../../_lib/jwt.js";
import { getUser, createUser } from "../../_lib/quota.js";

const BLOG_ORIGIN = "https://codefromkarl.xyz";

export async function onRequestGet(context) {
  const { request, env } = context;
  const jwtSecret = env.JWT_SECRET || "dev-secret";
  const travelOrigin = new URL(request.url).origin;

  // ── 1. 已有有效本地 JWT → 直接回首页 ──
  const localToken = extractToken(request);
  if (localToken) {
    const payload = await verifyJwt(localToken, jwtSecret);
    if (payload?.sub) {
      return Response.redirect(travelOrigin, 302);
    }
  }

  // ── 2. 读取博客的 Better Auth session cookie ──
  const cookie = request.headers.get("Cookie") || "";
  const sessionMatch = cookie.match(
    /(?:^|;\s*)better-auth\.session_token=([^;]+)/,
  );

  if (!sessionMatch) {
    // 没有 session cookie → 去博客登录
    return redirectToBlogLogin(travelOrigin);
  }

  // ── 3. 调博客验证 session ──
  try {
    const sessionResp = await fetch(
      `${BLOG_ORIGIN}/api/auth/get-session`,
      {
        headers: {
          Cookie: `better-auth.session_token=${sessionMatch[1]}`,
        },
      },
    );

    if (!sessionResp.ok) {
      return redirectToBlogLogin(travelOrigin);
    }

    const sessionData = await sessionResp.json();
    if (!sessionData?.user?.id) {
      return redirectToBlogLogin(travelOrigin);
    }

    // ── 4. 创建/查找本地用户 ──
    const blogUser = sessionData.user;
    const kv = env.RATE_LIMIT_KV;
    const localUserId = `blog_${blogUser.id}`;

    let user = kv ? await getUser(kv, localUserId) : null;
    if (!user && kv) {
      user = await createUser(kv, {
        id: localUserId,
        provider: "blog-sso",
        name: blogUser.name || blogUser.email,
        avatar: blogUser.image || "",
        email: blogUser.email || "",
      });
    }

    // ── 5. 签发本地 JWT ──
    const token = await signJwt(
      {
        sub: localUserId,
        provider: "blog-sso",
        name: user?.name || blogUser.name || "",
      },
      jwtSecret,
      86400 * 7, // 7 天
    );

    return new Response(null, {
      status: 302,
      headers: {
        Location: travelOrigin,
        "Set-Cookie": `auth_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${86400 * 7}`,
      },
    });
  } catch (err) {
    console.error("[SSO] Session verification failed:", err);
    return redirectToBlogLogin(travelOrigin);
  }
}

function redirectToBlogLogin(travelOrigin) {
  return Response.redirect(
    `${BLOG_ORIGIN}/auth/sign-in?callbackURL=${encodeURIComponent(travelOrigin)}`,
    302,
  );
}
