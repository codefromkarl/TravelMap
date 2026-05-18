/**
 * POST /api/auth/logout
 *
 * 清除 auth_token cookie
 */

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "auth_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
    },
  });
}
