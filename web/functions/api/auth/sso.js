/**
 * GET /api/auth/sso
 *
 * 博客 SSO 登录流程（不依赖跨域 cookie）：
 *   1. 已有有效本地 JWT → 直接回首页
 *   2. 有 blog_session query param → 验证后签发本地 JWT
 *   3. 否则 → 重定向到博客登录页（带 callbackURL）
 *
 * 博客登录成功后会重定向回 /api/auth/sso?blog_session=xxx
 * （需要博客端配置 callbackURL 或在登录后重定向时带上 session token）
 */

import { verifyJwt, signJwt, extractToken } from "../../_lib/jwt.js";
import { getUser, createUser } from "../../_lib/quota.js";

const BLOG_ORIGIN = "https://codefromkarl.xyz";

export async function onRequestGet(context) {
  const { request, env } = context;
  const jwtSecret = env.JWT_SECRET || "dev-secret";
  const url = new URL(request.url);
  const travelOrigin = url.origin;

  // ── 1. 已有有效本地 JWT → 直接回首页 ──
  const localToken = extractToken(request);
  if (localToken) {
    const payload = await verifyJwt(localToken, jwtSecret);
    if (payload?.sub) {
      return Response.redirect(travelOrigin, 302);
    }
  }

  // ── 2. 有 blog_session 参数 → 验证并签发本地 JWT ──
  const blogSession = url.searchParams.get("blog_session");
  if (blogSession) {
    try {
      const sessionResp = await fetch(`${BLOG_ORIGIN}/api/auth/get-session`, {
        headers: { Cookie: `better-auth.session_token=${blogSession}` },
      });

      if (sessionResp.ok) {
        const sessionData = await sessionResp.json();
        if (sessionData?.user?.id) {
          return await issueLocalJwt(env, jwtSecret, sessionData.user, travelOrigin);
        }
      }
    } catch (err) {
      console.error("[SSO] blog_session verification failed:", err);
    }
    // 验证失败 → 继续到登录页
  }

  // ── 3. 尝试从 cookie 读取博客 session（同域场景 fallback）──
  const cookie = request.headers.get("Cookie") || "";
  const sessionMatch = cookie.match(/(?:^|;\s*)better-auth\.session_token=([^;]+)/);
  if (sessionMatch) {
    try {
      const sessionResp = await fetch(`${BLOG_ORIGIN}/api/auth/get-session`, {
        headers: { Cookie: `better-auth.session_token=${sessionMatch[1]}` },
      });
      if (sessionResp.ok) {
        const sessionData = await sessionResp.json();
        if (sessionData?.user?.id) {
          return await issueLocalJwt(env, jwtSecret, sessionData.user, travelOrigin);
        }
      }
    } catch (err) {
      console.error("[SSO] cookie verification failed:", err);
    }
  }

  // ── 4. 无有效 session → 重定向到博客登录 ──
  // callbackURL 指向博客的 /api/auth/sso-callback（需博客端实现）
  // 博客登录后会重定向回 travel 子域的 /api/auth/sso?blog_session=xxx
  const callbackURL = `${travelOrigin}/api/auth/sso`;
  return Response.redirect(
    `${BLOG_ORIGIN}/auth/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`,
    302,
  );
}

/** 签发本地 JWT 并重定向 */
async function issueLocalJwt(env, jwtSecret, blogUser, travelOrigin) {
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

  const token = await signJwt(
    { sub: localUserId, provider: "blog-sso", name: user?.name || blogUser.name || "" },
    jwtSecret,
    86400 * 7,
  );

  return new Response(null, {
    status: 302,
    headers: {
      Location: travelOrigin,
      "Set-Cookie": `auth_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${86400 * 7}`,
    },
  });
}
